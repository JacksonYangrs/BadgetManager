/* ================================================================
 * org_center.e2e.cjs — 预算工作人员与归口关系 (D3/D4/D5) 前端 E2E
 *  1) admin 导航顺序：组织架构 → 预算工作人员（改名生效）。
 *  2) 预算工作人员页标题为「预算工作人员」，表格含「所属部门」列，可建用户绑部门。
 *  3) 组织架构 Tab 编辑模态含「归属管理中心」下拉 + 组织类型；SVG 节点按类型着色。
 * ================================================================ */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const BASE = "http://localhost:8300";
const OUT = path.join(__dirname, "..", "..", "output", "e2e");
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } }

async function login(page, user) {
  await page.fill('.login-field input[type="text"]', user);
  await page.fill('.login-field input[type="password"]', "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { state: "visible", timeout: 8000 });
}
async function navLabels(page) {
  return page.$$eval("button.qn-btn", (btns) => btns.map((b) => b.textContent.trim()));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + "/");
  await login(page, "admin");

  console.log("--- 导航顺序 + 预算工作人员页 ---");
  const labels = await navLabels(page);
  ok(labels.includes("组织架构") && labels.includes("预算工作人员"), `导航含 组织架构 与 预算工作人员 (${labels.join("/")})`);
  const orgIdx = labels.indexOf("组织架构");
  const staffIdx = labels.indexOf("预算工作人员");
  ok(orgIdx >= 0 && staffIdx >= 0 && staffIdx > orgIdx, `预算工作人员 在 组织架构 之后 (org=${orgIdx}, staff=${staffIdx})`);

  await page.click('button.qn-btn:has-text("预算工作人员")');
  await page.waitForSelector(".page-title", { timeout: 5000 });
  await page.waitForSelector(".acc-table th", { timeout: 8000 });
  const title = await page.$eval(".page-title", (e) => e.textContent.trim());
  ok(title === "预算工作人员", `页面标题为「预算工作人员」 (实际 ${title})`);
  const hasDeptCol = await page.$$eval(".acc-table th", (ths) => ths.some((t) => t.textContent.includes("所属组织") || t.textContent.includes("所属部门")));
  ok(hasDeptCol, "用户表含所属部门/组织列");

  console.log("--- 组织架构 Tab 编辑模态：类型 + 归属管理中心 ---");
  await page.click('button.qn-btn:has-text("基础数据")');
  await page.click('button.bd-tab:has-text("组织架构")');
  await page.waitForSelector(".bd-orgchart svg", { timeout: 8000 });
  await page.waitForTimeout(400);
  // 节点按类型着色：center 节点存在
  const centerColored = await page.$$eval(".oc-node.oc-type-center", (ns) => ns.length);
  ok(centerColored > 0, `SVG 含按类型着色的管理中心节点 (${centerColored} 个)`);
  // 打开编辑模态（点第一个节点）
  await page.click(".bd-orgchart .oc-node");
  await page.waitForSelector("#o_type", { timeout: 5000 });
  const hasType = await page.$("#o_type") !== null;
  const hasCenter = await page.$("#o_center") !== null;
  ok(hasType, "编辑模态含「组织类型」下拉");
  ok(hasCenter, "编辑模态含「归属管理中心」下拉");
  await page.screenshot({ path: path.join(OUT, "org_edit_modal.png"), fullPage: false });
  await browser.close();

  console.log(`\n=== E2E 结果：通过 ${pass} · 失败 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();
