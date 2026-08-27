const puppeteer = require('puppeteer');
const path = require('path');
const OUT = path.resolve(__dirname, 'assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TAB_SELS = ['.mt-btn.active', '.rtab-btn.active', '.dash-tab.active', '.bd-tab.active', '.nav-tab.active', '.view-tab.active', '.tab-btn.active'];
const TAB_BTNS = '.mt-btn, .rtab-btn, .dash-tab, .bd-tab, .nav-tab, .view-tab, .tab-btn';

function collectActive() {
  const out = {};
  for (const s of TAB_SELS) {
    const el = document.querySelector(s);
    if (el) {
      const cs = getComputedStyle(el);
      out[s] = { color: cs.color, bg: cs.backgroundColor, borderBottom: cs.borderBottomColor };
    }
  }
  const gold = [...document.querySelectorAll('.btn, .btn-accent, .btn-primary')]
    .filter((b) => getComputedStyle(b).backgroundColor === 'rgb(201, 164, 74)').length;
  return { tabs: out, goldBtnCount: gold };
}

async function login(browser, url, viewport, label, loginWaitSel) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  try { await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 }); }
  catch (e) { console.log(label, 'goto fail', e.message); await page.close(); return null; }
  try { await page.waitForFunction((s) => document.querySelector(s) !== null, { timeout: 15000 }, loginWaitSel); }
  catch (e) { console.log(label, 'login wait fail', e.message); await page.close(); return null; }
  await sleep(500);
  await page.type(loginWaitSel, 'admin', { delay: 10 });
  await page.type(loginWaitSel.replace('[type="text"]', '[type="password"]'), 'Admin@2026', { delay: 10 });
  await page.click('.login-submit');
  try {
    await page.waitForFunction(() => { const a = document.getElementById('appRoot'); return a && a.style.display !== 'none'; }, { timeout: 15000 });
  } catch (e) { console.log(label, 'app wait fail', e.message); }
  await sleep(1000);
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await login(browser, 'http://localhost:8300/', { width: 1440, height: 900 }, 'desktop', '.login-form input[type="text"]');
  if (!page) { await browser.close(); return; }
  const qnBtns = await page.$$('.qn-btn');
  const allProbes = [];
  const goldByView = {};
  let vi = 0;
  for (const qb of qnBtns) {
    const txt = await qb.evaluate((e) => e.textContent.trim());
    try { await qb.click(); } catch (e) {}
    await sleep(800);
    await page.screenshot({ path: path.join(OUT, `unify-d${vi}-${txt}.png`) });
    const tabHandles = await page.$$(TAB_BTNS);
    for (const th of tabHandles) {
      try { await th.click(); } catch (e) {}
      await sleep(200);
      const probe = await page.evaluate(collectActive);
      if (Object.keys(probe.tabs).length) allProbes.push({ view: txt, ...probe });
    }
    const g = await page.evaluate(() => [...document.querySelectorAll('.btn, .btn-accent, .btn-primary')].filter((b) => getComputedStyle(b).backgroundColor === 'rgb(201, 164, 74)').length);
    goldByView[txt] = g;
    vi++;
  }
  await page.close();
  await browser.close();
  console.log(JSON.stringify({ allProbes, goldByView }, null, 2));
})();
