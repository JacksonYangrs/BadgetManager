/* E2E（Playwright）：移除「组织架构」顶部菜单项（2026-08-24）
 * 1) admin 登录 → 顶部导航【不含】「组织架构」；含「预算工作人员」「基础数据」
 * 2) 进「基础数据」页 → 第 3 个 Tab「组织架构」存在且可点开（架构图 SVG 仍保留）
 * 3) staff 登录 → 顶部导航仅核心 3 项 + 首页，无「组织架构」
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
async function navLabels(page) {
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  return page.$$eval("#quicknav .qn-btn", (bs) => bs.map((b) => b.textContent.trim()));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("【A】admin 顶部导航不应含「组织架构」，但含「预算工作人员」「基础数据」");
  await login(page, "admin", "Admin@2026");
  const nav = await navLabels(page);
  ok(!nav.includes("组织架构"), "导航无「组织架构」(实际: " + nav.join("/") + ")");
  ok(nav.includes("预算工作人员"), "导航含「预算工作人员」");
  ok(nav.includes("基础数据"), "导航含「基础数据」");

  console.log("【B】基础数据页第 3 Tab「组织架构」仍存在且可点开（架构图保留）");
  await page.click("#quicknav .qn-btn:has-text(\"基础数据\")");
  await page.waitForSelector(".bd-tabs", { timeout: 8000 });
  const tabs = await page.$$eval(".bd-tab", (ts) => ts.map((t) => t.textContent.trim()));
  ok(tabs.includes("组织架构"), "基础数据含「组织架构」Tab (实际: " + tabs.join("/") + ")");
  await page.click(".bd-tab:has-text(\"组织架构\")");
  await page.waitForTimeout(1200);
  const svgCount = await page.$$eval(".bd-orgchart svg", (s) => s.length);
  ok(svgCount > 0, "组织架构 Tab 内 SVG 组织图已渲染 (" + svgCount + " 个)");
  await page.screenshot({ path: "output/e2e/org_tab_in_basedata.png" });

  console.log("【C】staff 顶部导航仅核心 3 项 + 首页，无「组织架构」");
  await page.click("button:has-text(\"退出\")").catch(() => {});
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 }).catch(() => {});
  if (!(await page.$(".login-form input[type=text]"))) {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  }
  await login(page, "zhangwei", "Admin@2026");
  const nav2 = await navLabels(page);
  ok(!nav2.includes("组织架构"), "staff 导航无「组织架构」(实际: " + nav2.join("/") + ")");
  ok(!nav2.includes("基础数据"), "staff 导航无「基础数据」(权限门, 实际: " + nav2.join("/") + ")");

  await browser.close();
  console.log("\n=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
