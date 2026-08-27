const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForSelector(".login-field input", { timeout: 10000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));

  async function testUpload(hash, tabLabel, filePath) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 800));
    if (tabLabel) {
      await page.evaluate((lab) => {
        const b = Array.from(document.querySelectorAll(".rtab-btn")).find((x) => x.textContent.trim().includes(lab));
        if (b) b.click();
      }, tabLabel);
      await new Promise((r) => setTimeout(r, 500));
    }
    await page.waitForSelector(".file-picker input[type=file]", { visible: true, timeout: 8000 });
    const inputHandle = await page.$(".file-picker input[type=file]");
    await inputHandle.uploadFile(filePath);
    await new Promise((r) => setTimeout(r, 400));
    const name = await page.evaluate(() => {
      const n = document.querySelector(".file-picker-name");
      return { text: n ? n.textContent.trim() : null, empty: n ? n.classList.contains("empty") : null };
    });
    return name;
  }

  const a = await testUpload("rules", "创建明年新规则", "/tmp/policy.pdf");
  const b = await testUpload("importView", null, "/tmp/sample.csv");
  console.log("rules name =>", JSON.stringify(a));
  console.log("import name =>", JSON.stringify(b));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
