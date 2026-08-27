const puppeteer = require("puppeteer");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });

  await page.goto("http://localhost:8300/", { waitUntil: "networkidle2" });

  // login
  await page.waitForSelector(".login-field input", { timeout: 8000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForFunction(() => !document.querySelector(".login-screen"), { timeout: 10000 });

  // navigate to compile view
  await page.goto("http://localhost:8300/#compile", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200));

  const out = path.join(__dirname, "compile-table-reordered.png");
  await page.screenshot({ path: out, fullPage: false });

  // verify header order and button classes
  const info = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll("table thead th")).map((th) => th.textContent.trim());
    const monthBtns = Array.from(document.querySelectorAll("td button")).filter((b) => b.textContent.includes("月度拆分"));
    const useBtns = Array.from(document.querySelectorAll("td button")).filter((b) => b.textContent.includes("采纳中值"));
    const firstMonth = monthBtns[0];
    const firstUse = useBtns[0];
    const mStyle = firstMonth ? window.getComputedStyle(firstMonth) : null;
    const uStyle = firstUse ? window.getComputedStyle(firstUse) : null;
    return {
      headers: ths,
      monthBtnCount: monthBtns.length,
      useBtnCount: useBtns.length,
      monthBtnClass: firstMonth ? firstMonth.className : null,
      useBtnClass: firstUse ? firstUse.className : null,
      monthBg: mStyle ? mStyle.backgroundColor : null,
      monthColor: mStyle ? mStyle.color : null,
      useBg: uStyle ? uStyle.backgroundColor : null,
      useColor: uStyle ? uStyle.color : null,
      useBorder: uStyle ? uStyle.borderColor : null,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  console.log("screenshot:", out);
  await browser.close();
})();
