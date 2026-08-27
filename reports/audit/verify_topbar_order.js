const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 200 });
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".login-field input", { timeout: 10000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: "reports/audit/topbar-bell-order.png", fullPage: false });
  const order = await page.evaluate(() => Array.from(document.querySelector(".topbar-right").children).map((c) => c.id || c.className || c.tagName));
  console.log(order);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
