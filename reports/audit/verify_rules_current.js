const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 500 });
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".login-field input", { timeout: 10000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => { location.hash = "rules"; });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "reports/audit/rules-current-cards.png", fullPage: false });
  const info = await page.evaluate(() => {
    const title = document.querySelector('[data-pane="current"] .wb-section-title');
    const cards = Array.from(document.querySelectorAll('[data-pane="current"] .scope-card .sc-k')).map((x) => x.textContent.trim());
    return { title: title ? title.textContent.trim() : null, cards };
  });
  console.log(JSON.stringify(info));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
