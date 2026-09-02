/* E2E（Playwright）：预算规则页三 Tab 重构（2026-08-25）
 * 在单个 page.evaluate 内完成：渲染 + 卡片单选解释 + 历史删除守卫 + 映射编辑持久化。
 * 规避 SPA 视图切换的跨进程时序问题。
 */
const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
const BASE = "http://localhost:8300";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

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

  console.log("【登录 + 进预算规则页】");
  await login(page, "admin", "Admin@2026");

  const res = await page.evaluate(async () => {
    const out = { err: null };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const panel = document.getElementById("viewPanel");
      BM.renderRules(panel);
      // 等三 Tab 数据填充（fetch 完成）
      for (let i = 0; i < 40; i++) {
        if (document.querySelector(".scope-cards .scope-card")) break;
        await sleep(100);
      }
      out.title = (document.querySelector(".page-title") || {}).innerText || "";
      out.scopeCards = document.querySelectorAll(".scope-cards .scope-card").length;

      // Tab1：点第一张卡 → 解释区
      const sc = document.querySelector(".scope-cards .scope-card");
      if (sc) sc.click();
      await sleep(200);
      out.explain = !!document.querySelector(".scope-explain");
      out.flow = document.querySelectorAll(".rv-flow .rv-flow-item").length;

      // Tab2：历史版本 + active 删除禁用
      const t2 = document.querySelector('.rtab-btn[data-tab="history"]');
      if (t2) t2.click();
      await sleep(300);
      out.historyRows = document.querySelectorAll(".rv-history .rv-hist-row").length;
      out.activeDelDisabled = !!document.querySelector(".rv-history .rv-hist-row .btn.disabled");

      // Tab3：适用经济事项
      const t3 = document.querySelector('.rtab-btn[data-tab="events"]');
      if (t3) t3.click();
      await sleep(400);
      out.evtMap = !!document.querySelector(".evt-map");
      out.evtCards = document.querySelectorAll(".evt-cards .scope-card").length;
      out.checks = document.querySelectorAll(".evt-list input[type=checkbox]").length;

      // 版本切换器断言
      out.evtVerSel = !!document.querySelector(".evt-ver-sel");
      out.evtVerOpts = document.querySelectorAll(".evt-ver-sel option").length;

      // 新布局断言：工具栏 + 头卡 + 当前规则信息 + 规则名（不显示代码）+ 弹性分类徽章
      out.evtToolbar = !!document.querySelector(".evt-toolbar");
      out.evtToolbarSave = !!document.querySelector(".evt-toolbar .btn-accent");
      out.evtRvTitle = (document.querySelector('[data-pane="events"] .rv-title') || {}).textContent || "";
      out.evtCurInfo = !!document.querySelector(".evt-cur-info");
      const firstCard = document.querySelector(".evt-cards .scope-card");
      out.evtFirstCardKey = firstCard ? (firstCard.querySelector(".sc-k") || {}).textContent || "" : "";
      out.evtFirstCardHasBadge = firstCard ? !!firstCard.querySelector(".sc-badge") : false;
      out.evtFirstCardKeyIsName = /[\u4e00-\u9fa5]/.test(out.evtFirstCardKey) && out.evtFirstCardKey !== "down5";

      const tok = BM.state.token;
      const vsNow = await BM.loadRuleVersions();
      const activeV = vsNow.find((v) => v.status === "active");
      const activeId = activeV ? activeV.id : 1;

      // 持久化：清空 → 勾选 → 保存 → GET 确认（按 active 版本往返）
      await fetch(`/api/rule-versions/${activeId}/event-map`, { method: "PUT", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: "[]" });
      const c0 = document.querySelectorAll(".evt-list input[type=checkbox]");
      if (c0[0]) c0[0].click();
      if (c0[1]) c0[1].click();
      const saveBtn = document.querySelector(".evt-toolbar .btn-accent");
      if (saveBtn) saveBtn.click();
      await sleep(600);
      const em = await (await fetch(`/api/rule-versions/${activeId}/event-map`, { headers: { Authorization: "Bearer " + tok } })).json();
      out.savedNonEmpty = em.filter((e) => e.subjectIds && e.subjectIds.length).length;
      out.savedSample = em.filter((e) => e.subjectIds && e.subjectIds.length).map((e) => e.subjectIds.length);
      // 清理测试数据
      await fetch(`/api/rule-versions/${activeId}/event-map`, { method: "PUT", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: "[]" });

      // 切换版本器：选另一版本（若有）应重渲染标题为对应版本
      out.verSwitchOk = true;
      const sel = document.querySelector(".evt-ver-sel");
      if (sel && sel.options.length > 1) {
        const otherOpt = Array.from(sel.options).find((o) => Number(o.value) !== activeId);
        if (otherOpt) {
          sel.value = otherOpt.value; sel.dispatchEvent(new Event("change"));
          await sleep(400);
          out.verSwitchOk = (document.querySelector('[data-pane="events"] .rv-title') || {}).innerText.includes(otherOpt.textContent.split(" ")[0]);
        }
      }

      // 版本历史「查看」展开
      const t2b = document.querySelector('.rtab-btn[data-tab="history"]');
      if (t2b) t2b.click();
      await sleep(200);
      const vbtns = Array.from(document.querySelectorAll(".rv-hist-row .btn"));
      const viewBtn = vbtns.find((b) => (b.textContent || "").indexOf("查看") >= 0);
      if (viewBtn) viewBtn.click();
      await sleep(300);
      out.detail = !!document.querySelector(".rv-detail");
    } catch (e) {
      out.err = e.message + " || " + (e.stack || "").slice(0, 300);
    }
    return out;
  });

  console.log("RESULT", JSON.stringify(res, null, 0));
  ok(!res.err, "无运行时错误" + (res.err ? " => " + res.err : ""));
  ok(/预算规划/.test(res.title || ""), "页面标题含「预算规划」=> " + (res.title || ""));
  ok(res.scopeCards > 0, "Tab1 规则卡渲染 " + res.scopeCards + " 张");
  ok(res.explain, "Tab1 点卡显示解释区");
  ok(res.flow > 0, "Tab1 财务流程规则 " + res.flow + " 项");
  ok(res.historyRows > 0, "Tab2 历史版本 " + res.historyRows + " 行");
  ok(res.activeDelDisabled, "Tab2 active 行删除按钮已禁用（守卫）");
  ok(res.evtMap, "Tab3 .evt-map 渲染");
  ok(res.evtCards > 0, "Tab3 左侧规则卡 " + res.evtCards + " 张");
  ok(res.checks === 206, "Tab3 科目勾选 " + res.checks + "（预期 206）");
  ok(res.evtVerSel, "Tab3 版本切换器（.evt-ver-sel）存在");
  ok(res.evtVerOpts >= 1, "Tab3 版本切换器含 " + (res.evtVerOpts || 0) + " 个版本选项");
  ok(res.evtToolbar, "Tab3 工具栏（.evt-toolbar）渲染");
  ok(res.evtToolbarSave, "Tab3 工具栏内含保存按钮（.btn-accent）");
  ok(/v20\d{2}/.test(res.evtRvTitle || ""), "Tab3 头卡 .rv-title 显示版本号 => " + (res.evtRvTitle || ""));
  ok(!res.evtCurInfo, "Tab3 右侧当前规则信息面板（.evt-cur-info）已移除（新布局不渲染）");
  ok(res.evtFirstCardHasBadge, "Tab3 规则卡显示弹性分类徽章（.sc-badge）");
  ok(res.evtFirstCardKeyIsName, "Tab3 规则卡显示规则名（非代码）=> " + (res.evtFirstCardKey || ""));
  ok(res.savedNonEmpty >= 1 && res.savedSample[0] >= 2, "Tab3 保存持久化（按 active 版本往返）=> " + JSON.stringify(res.savedSample));
  ok(res.verSwitchOk, "Tab3 切换版本器后标题重渲染为对应版本");
  ok(res.detail, "版本历史详情可展开");
  ok(errs.length === 0, "无 pageerror => " + JSON.stringify(errs));

  await page.screenshot({ path: "output/e2e/rules_event_map.png", fullPage: true });
  await browser.close();
  console.log("\n=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
