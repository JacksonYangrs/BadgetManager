/* E2E（Playwright）：预算规则页 Tab4「创建明年新规则」（2026-08-25）
 * 流程：进 Tab4 → 粘贴政策文本 → 解析抽取 → 生成草案（克隆明年 v2027 + 应用抽取）→ 正式发布 → 校验 active 切换
 * 幂等：开头清理非 active 版本，结尾恢复 active=v2026.0
 */
const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
const BASE = "http://localhost:8300";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page, username, password) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  await page.fill(".login-form input[type=text]", username);
  await page.fill(".login-form input[type=password]", password);
  await page.click(".login-submit");
  await page.waitForSelector("div.workbench", { timeout: 8000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));

  console.log("【登录 + 进预算规则页 + Tab4 流程】");
  await login(page, "admin", "Admin@2026");

  const res = await page.evaluate(async () => {
    const out = { err: null };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const tok = BM.state.token;
    const api = (method, url, body) => fetch(url, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(url + " " + r.status))));
    const panel = document.getElementById("viewPanel");
    try {
      BM.renderRules(panel);
      for (let i = 0; i < 40; i++) { if (document.querySelector(".scope-cards .scope-card")) break; await sleep(100); }
      out.title = (document.querySelector(".page-title") || {}).innerText || "";

      // 清理：删所有非 active 版本（幂等起点）
      const vs0 = await api("GET", "/api/rule-versions");
      for (const v of vs0) { if (v.status !== "active") { try { await api("DELETE", "/api/rule-versions/" + v.id); } catch (e) {} } }
      BM.renderRules(panel);
      for (let i = 0; i < 40; i++) { if (document.querySelector(".scope-cards .scope-card")) break; await sleep(100); }

      // 进 Tab4
      const t4 = document.querySelector('.rtab-btn[data-tab="createNext"]');
      if (t4) t4.click();
      for (let i = 0; i < 30; i++) { if (document.querySelector(".create-next-head")) break; await sleep(100); }
      out.tab4 = !!document.querySelector(".create-next-head");
      out.targetYear = (document.querySelector(".create-next-head") || {}).innerText || "";

      // 三类监督规则下拉（trackMode / surplusAction / allowOverBudget）存在 + 默认继承 active
      const selAll = document.querySelectorAll(".cn-flow-select");
      out.flowSelectCount = selAll.length;
      out.flowKeys = Array.from(selAll).map((s) => s.dataset.key);
      const vsRaw = await api("GET", "/api/rule-versions");
      const activeV0 = vsRaw.find((v) => v.status === "active");
      const activeFlow = {};
      (activeV0.items || []).filter((i) => i.category === "flow").forEach((i) => { activeFlow[i.scopeKey] = String(i.value); });
      out.selDefaults = Array.from(selAll).map((s) => s.dataset.key + "=" + s.value).join(",");
      out.defMatch = Array.from(selAll).every((s) => activeFlow[s.dataset.key] === s.value);

      // 粘贴政策文本 + 解析抽取
      const paste = document.querySelector(".cn-paste");
      paste.value = "食堂费用下降3%，宿舍住宿下降10%，办公管理费下降5%";
      const upBtn = document.querySelector(".cn-ops button");
      if (upBtn) upBtn.click();
      for (let i = 0; i < 40; i++) { if (document.querySelector(".cn-ex-item")) break; await sleep(100); }
      out.cnEx = document.querySelectorAll(".cn-ex-item").length;
      out.cnExText = (document.querySelector(".cn-ex-result") || {}).innerText || "";

      // 把「超预算处理」下拉设为「允许超预算」，验证生成草案时覆盖 + 发布后同步到业务
      const overSel = document.querySelector('.cn-flow-select[data-key="allowOverBudget"]');
      if (overSel) { overSel.value = "true"; overSel.dispatchEvent(new Event("change")); }
      out.overSelSet = overSel ? overSel.value : "missing";

      // 生成草案版本
      const genBtn = document.querySelector(".cn-draft-ops .btn-primary");
      if (genBtn) genBtn.click();
      for (let i = 0; i < 60; i++) { if (document.querySelector(".cn-draft-view .scope-card")) break; await sleep(100); }
      out.draftCards = document.querySelectorAll(".cn-draft-view .scope-card").length;
      out.pubEnabled = !document.querySelector(".cn-draft-ops .btn-accent").disabled;

      // 克隆继承断言：草案 event-map 关联集合 == 生成前 active 的 event-map
      const vsMid = await api("GET", "/api/rule-versions");
      const draftV = vsMid.find((v) => v.status === "draft");
      const activeV0b = vsMid.find((v) => v.status === "active");
      const emActive = draftV && activeV0b ? await api("GET", "/api/rule-versions/" + activeV0b.id + "/event-map") : [];
      const emDraft = draftV ? await api("GET", "/api/rule-versions/" + draftV.id + "/event-map") : [];
      const norm = (em) => em.map((e) => e.scopeKey + ":" + (e.subjectIds || []).slice().sort((a, b) => a - b).join(",")).sort().join("|");
      out.emActive = norm(emActive); out.emDraft = norm(emDraft);
      out.emCloned = out.emActive === out.emDraft;

      // 验证下拉实时同步到草案预览（pushFlowOverrides：改 trackMode → 预览监督规则文本更新）
      const trackSel = document.querySelector('.cn-flow-select[data-key="trackMode"]');
      out.trackLiveUpdated = false; out.trackOtherLabel = "";
      if (trackSel) {
        const opts = Array.from(trackSel.options).map((o) => o.value);
        const other = opts.find((o) => o !== trackSel.value) || opts[0];
        const lblMap = (BM.RULES_LABELS && BM.RULES_LABELS.trackMode) || {};
        const otherLabel = lblMap[other] || other;
        trackSel.value = other; trackSel.dispatchEvent(new Event("change"));
        for (let i = 0; i < 40; i++) {
          const t = (document.querySelector(".cn-draft-view") || {}).innerText || "";
          if (t.includes(otherLabel)) { out.trackLiveUpdated = true; break; }
          await sleep(100);
        }
        out.trackOtherLabel = otherLabel;
      }
      out.draftAllowOver = (document.querySelector(".cn-draft-view") || {}).innerText.includes("允许超预算");

      // 正式发布（override confirm）
      window.confirm = () => true;
      const pubBtn = document.querySelector(".cn-draft-ops .btn-accent");
      if (pubBtn) pubBtn.click();
      let activeV = null;
      for (let i = 0; i < 60; i++) {
        const vs = await api("GET", "/api/rule-versions");
        const a = vs.find((v) => v.status === "active");
        if (a && /v2027/.test(a.version)) { activeV = a.version; break; }
        await sleep(100);
      }
      out.activeAfter = activeV;

      const vsNow = await api("GET", "/api/rule-versions");
      const v2026 = vsNow.find((v) => v.version === "v2026.0");
      out.v2026Status = v2026 ? v2026.status : "missing";

      // 发布后监督规则应同步到业务全局（修复隐藏双轨不同步）
      out.stateAllowOver = BM.state.rules.allowOverBudget;

      // Tab1 当前版本（重渲染整页确保最新）
      BM.renderRules(panel);
      for (let i = 0; i < 40; i++) { if (document.querySelector(".scope-cards .scope-card")) break; await sleep(100); }
      const t1 = document.querySelector('.rtab-btn[data-tab="current"]');
      if (t1) t1.click();
      await sleep(300);
      out.tab1Title = (document.querySelector(".rv-title") || {}).innerText || "";

      // 恢复：发布 v2026.0 回到初始 active
      if (v2026) { try { await api("POST", "/api/rule-versions/" + v2026.id + "/publish", { sourceType: "rollback", note: "E2E 恢复" }); } catch (e) {} }
    } catch (e) {
      out.err = e.message + " || " + (e.stack || "").slice(0, 300);
    }
    return out;
  });

  console.log("RESULT", JSON.stringify(res, null, 0));
  ok(!res.err, "无运行时错误" + (res.err ? " => " + res.err : ""));
  ok(/预算规则管理/.test(res.title || ""), "页面标题含「预算规则管理」=> " + (res.title || ""));
  ok(res.tab4, "Tab4 渲染（创建明年新规则）");
  ok(/2027/.test(res.targetYear || ""), "Tab4 目标年度显示 2027 => " + (res.targetYear || ""));
  ok(res.cnEx > 0 && /canteen|食堂/.test(res.cnExText), "② 抽取建议含 canteen（食堂）=> " + res.cnEx + " 条");
  ok(res.draftCards === 10, "③ 草案预览渲染 " + res.draftCards + " 张基线卡（预期 10）");
  ok(res.pubEnabled, "生成草案后「正式发布」按钮可用");
  ok(res.flowSelectCount === 3, "Tab4 含 3 个监督规则下拉 => " + (res.flowSelectCount || 0));
  ok(JSON.stringify(res.flowKeys) === JSON.stringify(["trackMode", "surplusAction", "allowOverBudget"]), "下拉键为 trackMode/surplusAction/allowOverBudget => " + (res.flowKeys || []).join(","));
  ok(res.defMatch, "下拉默认值继承当前生效版本 => " + (res.selDefaults || ""));
  ok(res.overSelSet === "true", "「超预算处理」下拉已设为允许超预算 => " + (res.overSelSet || ""));
  ok(res.draftAllowOver, "草案预览监督规则显示「允许超预算」（下拉值已覆盖 flow 项）");
  ok(res.trackLiveUpdated, "下拉改 trackMode 后草案预览实时同步 => " + (res.trackOtherLabel || ""));
  ok(/v2027/.test(res.activeAfter || ""), "正式发布后 active 切换为 " + (res.activeAfter || "未切换"));
  ok(res.stateAllowOver === true, "发布后 BM.state.rules.allowOverBudget 同步为 true（业务拦截随之生效）=> " + (res.stateAllowOver === undefined ? "undefined" : res.stateAllowOver));
  ok(res.v2026Status === "archived", "原 v2026.0 已归档 => " + (res.v2026Status || ""));
  ok(/v2027/.test(res.tab1Title || ""), "Tab1 当前版本显示 " + (res.tab1Title || ""));
  ok(res.emCloned, "草案 event-map 克隆继承 active（关联集合一致）");
  ok(errs.length === 0, "无 pageerror => " + JSON.stringify(errs));

  await page.screenshot({ path: "output/e2e/create_next_rule.png", fullPage: true });
  await browser.close();
  console.log("\n=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
