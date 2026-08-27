const puppeteer = require("puppeteer");
const path = require("path");

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  await page.goto("http://localhost:8300/", { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));

  const out = path.join(__dirname, "login-logo-sanan.png");
  await page.screenshot({ path: out, fullPage: false });

  const info = await page.evaluate(() => {
    const logo = document.querySelector(".login-logo");
    if (!logo) return { error: "no login-logo found" };
    const s = window.getComputedStyle(logo);
    return {
      width: s.width,
      height: s.height,
      backgroundImage: s.backgroundImage.slice(0, 80),
      backgroundColor: s.backgroundColor,
      borderRadius: s.borderRadius,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  console.log("screenshot:", out);
  await browser.close();
})();
