const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 300 });
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".login-field input", { timeout: 10000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => { location.hash = "kanban"; });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "reports/audit/kanban-import-btn.png", fullPage: false });
  const styles = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.trim() === "费控导入");
    if (!btn) return null;
    const cs = getComputedStyle(btn);
    return {
      text: btn.textContent.trim(),
      className: btn.className,
      height: cs.height,
      padding: cs.padding,
      fontSize: cs.fontSize,
    };
  });
  console.log(JSON.stringify(styles));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
