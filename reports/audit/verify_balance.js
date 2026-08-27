const puppeteer = require("puppeteer");
const path = require("path");

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  return page;
}

async function login(page, user) {
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle2" });
  await page.waitForSelector(".login-field input", { timeout: 8000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type(user);
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForFunction(() => !document.querySelector(".login-screen") && document.getElementById("appRoot").style.display === "flex", { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 700));
}

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

  /* === 1. 上级领导（张明远 / ceo+boss）工作台 === */
  const page = await newPage(browser);
  await login(page, "zhangmy");

  const wb = await page.evaluate(() => {
    const navBtns = Array.from(document.querySelectorAll(".qn-btn")).map((b) => b.textContent.trim());
    const heroCards = Array.from(document.querySelectorAll(".wb-hero-card .wh-title")).map((x) => x.textContent.trim());
    const goBtns = Array.from(document.querySelectorAll(".wb-hero-card button")).map((b) => b.textContent.trim());
    return { navBtns, heroCards, goBtns };
  });
  console.log("W nav:", JSON.stringify(wb.navBtns));
  console.log("W hero:", JSON.stringify(wb.heroCards), "btn:", JSON.stringify(wb.goBtns));

  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll(".wb-hero-card button")).find((x) => x.textContent.includes("汇总平衡"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 900));

  const bal = await page.evaluate(() => {
    const kpis = Array.from(document.querySelectorAll(".bal-kpi .bk-val")).map((x) => x.textContent.trim());
    const labels = Array.from(document.querySelectorAll(".bal-kpi .bk-label")).map((x) => x.textContent.trim());
    const kpiPairs = kpis.map((v, i) => labels[i] + "=" + v);
    const filterBtns = Array.from(document.querySelectorAll(".bal-filter-btn")).map((b) => b.textContent.trim());
    const rows = document.querySelectorAll(".balance-table tbody tr").length;
    const title = (document.querySelector(".page-title") || {}).textContent || "";
    const navActive = (document.querySelector(".qn-btn.active") || {}).textContent || "";
    return { title, kpiPairs, filterBtns, rows, navActive };
  });
  console.log("B title:", bal.title, "| navActive:", bal.navActive);
  console.log("B KPIs:", JSON.stringify(bal.kpiPairs));
  console.log("B filters:", JSON.stringify(bal.filterBtns));
  console.log("B table rows:", bal.rows);

  await page.screenshot({ path: path.join(__dirname, "balance-page.png"), fullPage: true });
  await page.close();

  /* === 2. 部门经理（王敏）编制页：不应有平衡预览按钮 === */
  const page2 = await newPage(browser);
  await login(page2, "wangmin");
  await page2.evaluate(() => { location.hash = "compile"; });
  await page2.waitForFunction(() => document.querySelector(".page-title") && document.querySelector(".page-title").textContent.includes("预算编制"), { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 500));
  const compile = await page2.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".plan-actions button")).map((b) => b.textContent.trim());
    return { btns };
  });
  console.log("C compile buttons:", JSON.stringify(compile.btns));
  console.log("C balance btn present:", compile.btns.some((b) => b.includes("平衡")));
  await page2.close();

  await browser.close();
  console.log("DONE");
})();
