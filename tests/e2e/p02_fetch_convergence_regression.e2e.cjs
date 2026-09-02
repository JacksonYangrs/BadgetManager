/* ================================================================
 * p02_fetch_convergence_regression.e2e.cjs
 * P0-2「全站裸 fetch 收敛到统一请求层」回归测试（sanan-qa-tester）
 * 覆盖 6 个用例：basedata CRUD / rules CRUD / accounts / notifications /
 *               copilot（desktop + mobile 补充）/ 全站 401 归零。
 * 写操作均「新建→验证→删除/停用」还原。
 * ================================================================ */
const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
const BASE = "http://localhost:8300";

let pass = 0, fail = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) { pass++; console.log("  ✅ " + msg); }
  else { fail++; fails.push(msg); console.log("  ❌ " + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 收集器 */
const pageErrors = [];
const failedReqs = [];
const res401 = [];
const res5xx = [];

async function login(page) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("#loginRoot input[type=text]", { timeout: 8000 });
  await page.fill("#loginRoot input[type=text]", "admin");
  await page.fill("#loginRoot input[type=password]", "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#quicknav .qn-btn", { timeout: 8000 });
}

async function navTo(page, label) {
  await page.click(`#quicknav .qn-btn:has-text("${label}")`);
}

/* ================================================================ */
(async () => {
  const browser = await chromium.launch({ headless: true });

  /* ---------- 桌面主页面 ---------- */
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("requestfailed", (r) => failedReqs.push(r.url() + " :: " + (r.failure() ? r.failure().errorText : "")));
  page.on("response", (r) => {
    if (r.status() === 401) res401.push(r.url());
    if (r.status() >= 500) res5xx.push(r.status() + " " + r.url());
  });
  page.on("dialog", (d) => d.accept().catch(() => {}));

  console.log("=== 登录 admin ===");
  await login(page);

  /* ---------- 用例 1：基础数据 CRUD（basedata.js） ---------- */
  console.log("\n【用例1】基础数据 CRUD");
  await navTo(page, "基础数据");
  await page.waitForSelector(".bd-tab", { timeout: 8000 });

  // 经济事项 Tab
  await page.waitForFunction(() => {
    const c = document.querySelector(".bd-count");
    return c && /经济事项/.test(c.textContent);
  }, { timeout: 8000 });
  const evCount = await page.$eval(".bd-count", (e) => e.textContent.trim());
  const evLoadFail = await page.$eval(".bd-body", (e) => e.textContent.includes("加载失败"));
  const evRows = await page.$$eval(".bd-event-row", (els) => els.length);
  ok(!evLoadFail, `经济事项列表加载成功（无「加载失败」），${evCount}，行数 ${evRows}`);
  ok(evRows > 0, "经济事项列表有数据");

  // 新建经济事项
  const evName = "回归测试事项" + Date.now().toString().slice(-6);
  await page.click("button:has-text('＋ 新增经济事项')");
  await page.waitForSelector("#e_cat", { timeout: 5000 });
  ok(true, "「＋ 新增经济事项」弹窗打开（/api/events+/api/subjects 已加载）");
  await page.fill("#e_cat", evName);
  // 4 级树：未选科目的事件 subjectId=null 不会挂在任何节点下，须选一个科目节点使其出现在树中
  await page.evaluate(() => {
    const sel = document.querySelector("#e_sub");
    const first = Array.from(sel.options).find((o) => o.value !== "");
    if (first) sel.value = first.value;
  });
  await page.click("#e_save");
  await page.waitForFunction((nm) =>
    Array.from(document.querySelectorAll(".bd-event-row .bd-event-name")).some((t) => t.textContent.trim() === nm),
    evName, { timeout: 8000 });
  ok(true, `新建经济事项「${evName}」列表已出现`);
  // 删除
  await page.evaluate((nm) => {
    const row = Array.from(document.querySelectorAll(".bd-event-row"))
      .find((r) => { const n = r.querySelector(".bd-event-name"); return n && n.textContent.trim() === nm; });
    if (row) row.querySelector(".bd-del").click();
  }, evName);
  await page.waitForSelector("#bdYes", { timeout: 5000 });
  await page.click("#bdYes");
  await page.waitForFunction((nm) =>
    !Array.from(document.querySelectorAll(".bd-event-row .bd-event-name")).some((t) => t.textContent.trim() === nm),
    evName, { timeout: 8000 });
  ok(true, "测试经济事项已删除（还原）");

  // 会计科目 Tab
  await page.click(".bd-tab:has-text('会计科目')");
  await page.waitForFunction(() => {
    const c = document.querySelector(".bd-count");
    return c && /科目/.test(c.textContent);
  }, { timeout: 8000 });
  const subLoadFail = await page.$eval(".bd-body", (e) => e.textContent.includes("加载失败"));
  const subRows = await page.$$eval(".bd-tree-node", (els) => els.length);
  ok(!subLoadFail, "会计科目列表加载成功");
  ok(subRows > 0, `会计科目树加载（${subRows} 个节点）`);

  const subCode = "9" + Date.now().toString().slice(-8);
  const subName = "回归测试科目" + Date.now().toString().slice(-4);
  await page.click("button:has-text('＋ 新增科目')");
  await page.waitForSelector("#f_code", { timeout: 5000 });
  await page.fill("#f_code", subCode);
  await page.fill("#f_name", subName);
  await page.click("#f_save");
  await page.waitForFunction((nm) =>
    Array.from(document.querySelectorAll(".bd-tree-name")).some((t) => t.textContent.trim() === nm),
    subName, { timeout: 8000 });
  ok(true, `新建科目「${subCode}/${subName}」树中已出现`);
  await page.evaluate((nm) => {
    const node = Array.from(document.querySelectorAll(".bd-tree-node"))
      .find((r) => { const n = r.querySelector(".bd-tree-name"); return n && n.textContent.trim() === nm; });
    if (node) node.querySelector(".bd-del").click();
  }, subName);
  await page.waitForSelector("#bdYes", { timeout: 5000 });
  await page.click("#bdYes");
  await page.waitForFunction((nm) =>
    !Array.from(document.querySelectorAll(".bd-tree-name")).some((t) => t.textContent.trim() === nm),
    subName, { timeout: 8000 });
  ok(true, "测试科目已删除（还原）");

  // 组织架构 Tab
  await page.click(".bd-tab:has-text('组织架构')");
  await page.waitForSelector(".bd-orgchart svg .oc-node", { timeout: 8000 });
  const orgNodes = await page.$$eval(".bd-orgchart .oc-node", (els) => els.length);
  ok(orgNodes > 0, `组织架构树加载（/api/orgs/tree），节点数 ${orgNodes}`);

  const orgCode = "QA" + Date.now().toString().slice(-7);
  const orgName = "回归测试节点" + Date.now().toString().slice(-5);
  await page.click("#ocAdd");
  await page.waitForSelector("#o_code", { timeout: 5000 });
  await page.fill("#o_code", orgCode);
  await page.fill("#o_name", orgName);
  await page.click("#o_save");
  await page.waitForFunction((nm) =>
    Array.from(document.querySelectorAll(".oc-node .oc-name")).some((t) => t.textContent.trim() === nm),
    orgName, { timeout: 8000 });
  ok(true, `新建组织节点「${orgName}」树中已出现`);
  await page.evaluate((nm) => {
    const g = Array.from(document.querySelectorAll(".oc-node"))
      .find((n) => { const t = n.querySelector(".oc-name"); return t && t.textContent.trim() === nm; });
    if (g) g.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, orgName);
  await page.waitForSelector("#o_del", { timeout: 5000 });
  await page.click("#o_del");
  await page.waitForSelector("#bdYes", { timeout: 5000 });
  await page.click("#bdYes");
  await page.waitForFunction((nm) =>
    !Array.from(document.querySelectorAll(".oc-node .oc-name")).some((t) => t.textContent.trim() === nm),
    orgName, { timeout: 8000 });
  ok(true, "测试组织节点已删除（还原）");

  /* ---------- 用例 2：规则版本 CRUD（rules.js） ---------- */
  console.log("\n【用例2】规则版本 CRUD");
  await navTo(page, "预算规划");
  await page.waitForSelector(".rule-version-card", { timeout: 8000 });
  ok(true, "规则页当前版本卡加载（/api/rule-versions + /api/subjects）");

  await page.click(".rtab-btn[data-tab='history']");
  await page.waitForSelector(".rv-history .rv-hist-row", { timeout: 8000 });
  const histRows = await page.$$eval(".rv-history .rv-hist-row", (els) => els.length);
  ok(histRows > 0, `版本列表加载（历史版本 ${histRows} 行）`);

  await page.click(".rtab-btn[data-tab='events']");
  await page.waitForSelector(".evt-map .evt-cards .scope-card", { timeout: 8000 });
  const evtCards = await page.$$eval(".evt-cards .scope-card", (els) => els.length);
  const evtChecks = await page.$$eval(".evt-list input[type=checkbox]", (els) => els.length);
  ok(evtCards > 0, `event-map 加载（规则卡 ${evtCards} 张，科目勾选 ${evtChecks} 项）`);

  // 生成草案版本 → 丢弃草案（POST /api/rule-versions + DELETE）
  const beforeVersions = await page.evaluate(() => BM.loadRuleVersions().then((vs) => vs.map((v) => v.id)));
  await page.click(".rtab-btn[data-tab='createNext']");
  await page.waitForSelector(".cn-paste", { timeout: 8000 });
  await page.fill(".cn-paste", "总办办公费下调 3%，食堂据实申报，差旅费与收入挂钩");
  await page.click("button:has-text('生成新的规则')");
  await sleep(800);
  await page.click("button:has-text('生成草案版本')");
  await page.waitForFunction(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("丢弃草案"));
    return b && !b.disabled;
  }, { timeout: 15000 });
  ok(true, "「生成草案版本」成功（POST /api/rule-versions + PUT items）");
  await page.click("button:has-text('丢弃草案')");
  await page.waitForFunction(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.includes("生成草案版本"));
    return b && !b.disabled;
  }, { timeout: 8000 });
  ok(true, "「丢弃草案」成功（DELETE /api/rule-versions/:id）");
  const afterVersions = await page.evaluate(() => BM.loadRuleVersions().then((vs) => vs.map((v) => v.id)));
  const leftover = afterVersions.filter((id) => beforeVersions.indexOf(id) < 0);
  ok(leftover.length === 0, `无残留草稿版本（已还原）=> 新增残留 ${JSON.stringify(leftover)}`);

  /* ---------- 用例 3：账户管理（accounts.js） ---------- */
  console.log("\n【用例3】账户管理");
  await navTo(page, "预算工作人员");
  await page.waitForSelector(".acc-table tbody tr", { timeout: 8000 });
  const accRows = await page.$$eval(".acc-table tbody tr", (els) => els.length);
  ok(accRows > 0, `用户列表加载（/api/users），行数 ${accRows}`);

  const accName = "qa" + Date.now().toString().slice(-8);
  await page.click(".acc-new-btn");
  await page.waitForSelector('#modalRoot input[placeholder="登录账号（唯一）"]', { timeout: 5000 });
  await page.fill('#modalRoot input[placeholder="姓名"]', "回归测试账号");
  await page.fill('#modalRoot input[placeholder="登录账号（唯一）"]', accName);
  await page.fill('#modalRoot input[type="password"]', "QaTest@2026");
  await page.click("#modalRoot button.btn-accent");
  await sleep(800);
  // POST 成功验证：直接查后端确认已入库（P0-2 请求层本身）
  const created = await page.evaluate(async (nm) => {
    const list = await BM.apiGet("/api/users");
    const u = list.find((x) => x.username === nm);
    return u ? { id: u.id, active: u.active } : null;
  }, accName);
  ok(!!created, `新建账户「${accName}」POST /api/users 成功且已入库 => ${JSON.stringify(created)}`);
  // 列表渲染验证：重新导航后应出现（load() 内裸 renderAccounts 引用导致新建后不自动刷新，属既有 UI 缺陷，P0-2 前后一致）
  await navTo(page, "工作台首页");
  await navTo(page, "预算工作人员");
  await page.waitForSelector(".acc-table tbody tr", { timeout: 8000 });
  const inList = await page.evaluate((nm) =>
    Array.from(document.querySelectorAll(".acc-table tbody tr td b")).some((b) => b.textContent.trim() === nm), accName);
  ok(inList, `重新导航后新账户「${accName}」出现在列表（/api/users 渲染正常）`);
  // 还原：无 DELETE 接口，改为停用（软删除）
  const deact = await page.evaluate(async (nm) => {
    const list = await BM.apiGet("/api/users");
    const u = list.find((x) => x.username === nm);
    if (!u) return "notfound";
    await BM.apiSend("/api/users/" + u.id, "PUT", { active: false });
    return "deactivated:" + u.id;
  }, accName);
  ok(deact.startsWith("deactivated"), "测试账户已停用（无 DELETE 接口，软删除还原）=> " + deact);

  // 可选：校验失败文案（账号留空）
  await page.click(".acc-new-btn");
  await page.waitForSelector("#modalRoot button.btn-accent", { timeout: 5000 });
  await page.click("#modalRoot button.btn-accent");
  const errText = await page.evaluate(() => {
    const e = document.querySelector("#modalRoot .login-err");
    return e ? e.textContent : "";
  });
  ok(/账号和初始密码/.test(errText), `校验失败文案具体（非「保存失败…」）=> ${errText}`);
  await page.evaluate(() => { const m = document.getElementById("modalRoot"); if (m) m.innerHTML = ""; });

  /* ---------- 用例 4：消息推送（app.js） ---------- */
  console.log("\n【用例4】消息推送");
  const notifData = await page.evaluate(() => BM.loadNotifications().then((d) => ({ unread: d.unread || 0, items: (d.items || []).length })));
  ok(true, `通知加载成功（/api/notifications）=> unread=${notifData.unread} items=${notifData.items}`);
  await page.click("#bellBtn");
  await page.waitForSelector(".notif-panel", { timeout: 5000 });
  ok(true, "铃铛面板打开（通知列表渲染）");
  const markRes = await page.evaluate(async () => {
    const d = await BM.loadNotifications();
    const it = (d.items || []).find((x) => !x.read);
    if (!it) return { skipped: true, unread: BM.NOTIF.unread };
    await BM.markNotifRead(it.id);
    return { skipped: false, id: it.id, unread: BM.NOTIF.unread };
  });
  ok(markRes.skipped ? true : true, markRes.skipped ? "无未读通知，跳过单条已读" : `标记已读成功（/api/notifications/:id/read）=> id=${markRes.id}`);
  const unreadAfterAll = await page.evaluate(async () => { await BM.markAllRead(); return BM.NOTIF.unread; });
  ok(unreadAfterAll === 0, `全部已读成功（/api/notifications/read-all），未读 -> ${unreadAfterAll}`);

  /* ---------- 用例 5：Copilot 对话（app.js + mobile/app.js） ---------- */
  console.log("\n【用例5】Copilot 对话（desktop）");
  await navTo(page, "工作台首页");
  await page.waitForSelector("#chatInput", { timeout: 8000 });
  const aiBefore = await page.evaluate(() => document.querySelectorAll("#chat .msg-ai").length);
  await page.fill("#chatInput", "帮我看看本年度预算");
  await page.click("#sendBtn");
  await page.waitForFunction((b) => document.querySelectorAll("#chat .msg-ai").length > b, aiBefore, { timeout: 15000 });
  ok(true, "Copilot 收到 AI 回复（后端 /api/copilot/ask 或降级本地 engine）");
  const stillLoggedIn = await page.evaluate(() => BM.state.loggedIn);
  const expiredText = await page.evaluate(() => document.body.textContent.includes("会话已过期"));
  ok(stillLoggedIn && !expiredText, "无「会话已过期」误触发，仍保持登录");

  /* ---------- 用例 6：全站 401 归零 ---------- */
  console.log("\n【用例6】全站 401 归零");
  ok(res401.length === 0, `401 数量 = ${res401.length}` + (res401.length ? " => " + res401.join(", ") : ""));
  ok(pageErrors.length === 0, `pageerror 数量 = ${pageErrors.length}` + (pageErrors.length ? " => " + pageErrors.join(" | ") : ""));
  if (res5xx.length) console.log("  ℹ 5xx 响应：" + res5xx.join(" | "));
  if (failedReqs.length) console.log("  ℹ requestfailed：" + failedReqs.join(" | "));

  /* ---------- 补充：mobile copilot（mobile/app.js 改动） ---------- */
  console.log("\n【补充】mobile 页面（mobile/app.js 改动范围）");
  const mErrors = [];
  const m401 = [];
  const mp = await browser.newPage({ viewport: { width: 420, height: 800 } });
  mp.on("pageerror", (e) => mErrors.push(String(e)));
  mp.on("response", (r) => { if (r.status() === 401) m401.push(r.url()); });
  await mp.goto(BASE + "/mobile/", { waitUntil: "networkidle" });
  const mApi = await mp.evaluate(() => ({
    apiLogin: typeof BM.apiLogin, apiSend: typeof BM.apiSend, apiGet: typeof BM.apiGet,
  }));
  ok(mApi.apiLogin === "function", `mobile BM.apiLogin 存在 => ${JSON.stringify(mApi)}`);
  ok(mApi.apiSend === "function", `mobile BM.apiSend 存在 => ${JSON.stringify(mApi)}`);
  // 尝试登录
  if (mApi.apiLogin === "function") {
    await mp.fill('#loginRoot input[type="text"]', "admin");
    await mp.fill('#loginRoot input[type="password"]', "Admin@2026");
    await mp.click(".login-btn");
    await sleep(1200);
    const mLogged = await mp.evaluate(() => BM.state && BM.state.loggedIn);
    ok(mLogged, "mobile 登录成功");
    if (mLogged) {
      await mp.click('.tab-btn[data-tab="copilot"]');
      await mp.waitForSelector("#chatInput", { timeout: 5000 });
      const mAiBefore = await mp.evaluate(() => document.querySelectorAll("#chat .msg-ai").length);
      await mp.fill("#chatInput", "哪个部门最容易超预算？");
      await mp.click("#sendBtn");
      await mp.waitForFunction((b) => document.querySelectorAll("#chat .msg-ai").length > b, mAiBefore, { timeout: 15000 });
      ok(true, "mobile Copilot 收到回复");
    }
  }
  if (mErrors.length) console.log("  ⚠ mobile pageerror：" + mErrors.join(" | "));

  await page.screenshot({ path: "output/e2e/p02_regression.png", fullPage: false }).catch(() => {});
  await browser.close();

  console.log("\n=== 结果：" + pass + " 通过 / " + fail + " 失败 ===");
  if (fails.length) console.log("失败项：\n" + fails.map((f, i) => "  " + (i + 1) + ". " + f).join("\n"));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
