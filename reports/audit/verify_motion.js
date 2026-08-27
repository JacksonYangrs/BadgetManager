const puppeteer = require('puppeteer');
const path = require('path');
const OUT = path.resolve(__dirname, 'assets');
const URL = 'http://localhost:8300/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(browser, viewport, label) {
  const ctx = await browser.createBrowserContext({ isIncognito: true });
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.login-form input[type="text"]') !== null, { timeout: 15000 });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, `after-motion-login-${label}.png`) });
  // inspect
  const styles = await page.evaluate(() => {
    const btn = document.querySelector('.login-submit');
    const card = document.querySelector('.login-card');
    const csBtn = getComputedStyle(btn);
    const csCard = getComputedStyle(card);
    return {
      btnTransition: csBtn.transitionProperty + ' ' + csBtn.transitionDuration,
      cardAnimation: csCard.animationName + ' ' + csCard.animationDuration,
      primary: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
    };
  });
  await page.type('.login-form input[type="text"]', 'admin', { delay: 10 });
  await page.type('.login-form input[type="password"]', 'Admin@2026', { delay: 10 });
  await page.click('.login-submit');
  await page.waitForFunction(() => document.getElementById('appRoot').style.display !== 'none', { timeout: 15000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `after-motion-app-${label}.png`) });
  const appStyles = await page.evaluate(() => {
    const qn = document.querySelector('.qn-btn');
    const card = document.querySelector('.ai-card, .method-chip');
    return {
      qnTransition: qn ? getComputedStyle(qn).transitionProperty + ' ' + getComputedStyle(qn).transitionDuration : 'n/a',
      cardTransition: card ? getComputedStyle(card).transitionProperty + ' ' + getComputedStyle(card).transitionDuration : 'n/a',
    };
  });
  await ctx.close();
  return { styles, appStyles };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const desktop = await check(browser, { width: 1440, height: 900 }, 'desktop');
  const mobile = await check(browser, { width: 375, height: 667, isMobile: true }, 'mobile');
  await browser.close();
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})();
