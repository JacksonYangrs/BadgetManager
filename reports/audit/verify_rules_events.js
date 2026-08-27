const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
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
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll(".rtab-btn")).find((x) => x.textContent.trim().includes("适用经济事项"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "reports/audit/rules-events-layout.png", fullPage: false });

  // click second card and capture
  const info = await page.evaluate(() => {
    const cards = document.querySelectorAll(".evt-cards .scope-card");
    if (cards.length > 1) cards[1].click();
    return {
      cardCount: cards.length,
      commentOverflow: getComputedStyle(document.querySelector(".evt-cards")).overflowX,
      commentDisplay: getComputedStyle(document.querySelector(".evt-comment")).display,
      listDisplay: getComputedStyle(document.querySelector(".evt-list")).display,
    };
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: "reports/audit/rules-events-card2.png", fullPage: false });
  console.log(JSON.stringify(info));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
