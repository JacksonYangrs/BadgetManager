/* E2E（Playwright）：预算工作人员入口可见性 + 权限门
 * 1) finance/总经办/归口责任人 登录 → 顶部导航含「预算工作人员」且可进
 * 2) manager 登录 → 导航无「预算工作人员」入口
 */
const { chromium } = require("playwright");
const BASE = "http://localhost:8300";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

async function login(page, username, password) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  await page.fill(".login-form input[type=text]", username);
  await page.fill(".login-form input[type=password]", password);
  await page.click(".login-submit");
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("【A】lijing(finance+cooAnalyst) 应看到「预算工作人员」入口并可进入");
  await login(page, "lijing", "Admin@2026");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  const navLabels = await page.$$eval("#quicknav .qn-btn", (bs) => bs.map((b) => b.textContent.trim()));
  ok(navLabels.includes("预算工作人员"), "导航含「预算工作人员」(实际: " + navLabels.join("/") + ")");
  ok(!navLabels.includes("组织架构"), "导航已移除「组织架构」菜单项 (实际: " + navLabels.join("/") + ")");
  if (navLabels.includes("预算工作人员")) {
    await page.click("#quicknav .qn-btn:has-text(\"预算工作人员\")");
    await page.waitForSelector(".acc-table", { timeout: 8000 });
    const title = await page.$eval(".page-title", (e) => e.textContent.trim());
    ok(title === "预算工作人员", "页面标题为「预算工作人员」(实际 " + title + ")");
    const newBtn = await page.$(".acc-new-btn");
    ok(!!newBtn, "finance 可看到「＋ 新建账户」按钮（可编辑）");
    const editBtns = await page.$$(".acc-table button:has-text(\"编辑\")");
    ok(editBtns.length > 0, "行内「编辑」按钮可见 (" + editBtns.length + " 个)");
    await page.screenshot({ path: "output/e2e/accounts_lijing.png" });
  }

  console.log("【B】wangmin(manager) 不应看到「预算工作人员」入口");
  await page.click("button:has-text(\"退出\")").catch(() => {});
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 }).catch(() => {});
  if (!(await page.$(".login-form input[type=text]"))) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  }
  await login(page, "wangmin", "Admin@2026");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  const nav2 = await page.$$eval("#quicknav .qn-btn", (bs) => bs.map((b) => b.textContent.trim()));
  ok(!nav2.includes("预算工作人员"), "manager 导航无「预算工作人员」(实际: " + nav2.join("/") + ")");

  console.log("【C】zhangmy(boss+ceo 总经理) 应看到「预算工作人员」入口并可进入");
  await page.click("button:has-text(\"退出\")").catch(() => {});
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 }).catch(() => {});
  if (!(await page.$(".login-form input[type=text]"))) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  }
  await login(page, "zhangmy", "Admin@2026");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  const nav3 = await page.$$eval("#quicknav .qn-btn", (bs) => bs.map((b) => b.textContent.trim()));
  ok(nav3.includes("预算工作人员"), "总经理(boss/ceo) 导航含「预算工作人员」(实际: " + nav3.join("/") + ")");
  if (nav3.includes("预算工作人员")) {
    await page.click("#quicknav .qn-btn:has-text(\"预算工作人员\")");
    await page.waitForSelector(".acc-table", { timeout: 8000 });
    const title3 = await page.$eval(".page-title", (e) => e.textContent.trim());
    ok(title3 === "预算工作人员", "总经理进入页面标题正确 (实际 " + title3 + ")");
    const newBtn3 = await page.$(".acc-new-btn");
    ok(!!newBtn3, "总经理可看到「＋ 新建账户」按钮（可编辑）");
    await page.screenshot({ path: "output/e2e/accounts_boss.png" });
  }

  await browser.close();
  console.log("\n=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
