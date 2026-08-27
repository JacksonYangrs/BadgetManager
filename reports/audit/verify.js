const puppeteer = require('puppeteer');
const path = require('path');

const OUT = path.resolve(__dirname, 'assets');
const URL = 'http://localhost:8300/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(browser, viewport, label) {
  const ctx = await browser.createBrowserContext({ isIncognito: true });
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.login-form input[type="text"]') !== null, { timeout: 15000 });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, `after-login-${label}.png`) });
  await page.type('.login-form input[type="text"]', 'admin', { delay: 10 });
  await page.type('.login-form input[type="password"]', 'Admin@2026', { delay: 10 });
  await page.click('.login-submit');
  await page.waitForFunction(() => {
    const app = document.getElementById('appRoot');
    return app && app.style.display !== 'none';
  }, { timeout: 15000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `after-app-${label}.png`) });
  const primary = await page.evaluate(() => getComputedStyle(document.querySelector('.topbar')).backgroundColor);
  const brandMarkBg = await page.evaluate(() => {
    const el = document.querySelector('.brand-mark');
    return el ? getComputedStyle(el).backgroundImage.slice(0, 30) : 'none';
  });
  const logoShown = await page.evaluate(() => {
    const el = document.querySelector('.brand-mark');
    if (!el) return false;
    const bg = getComputedStyle(el).backgroundImage;
    return bg.includes('data:image');
  });
  await ctx.close();
  return { primary, logoShown, brandMarkBg };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const desktop = await shot(browser, { width: 1440, height: 900 }, 'desktop');
  const mobile = await shot(browser, { width: 375, height: 667, isMobile: true }, 'mobile');
  await browser.close();
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})();
