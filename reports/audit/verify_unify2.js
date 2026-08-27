const puppeteer = require('puppeteer');
const path = require('path');
const OUT = path.resolve(__dirname, 'assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readTabs() {
  const tabs = [...document.querySelectorAll('.mt-btn, .rtab-btn, .dash-tab, .bd-tab, .nav-tab, .view-tab, .tab-btn')];
  const out = [];
  for (const t of tabs) {
    const base = t.className.split(' ')[0];
    t.style.transition = 'none';
    t.classList.add('active');
    const cs = getComputedStyle(t);
    out.push({ cls: base, color: cs.color, borderBottom: cs.borderBottomColor, bg: cs.backgroundColor });
    t.classList.remove('active');
    t.style.transition = '';
  }
  const gold = [...document.querySelectorAll('.btn, .btn-accent, .btn-primary')]
    .filter((b) => getComputedStyle(b).backgroundColor === 'rgb(201, 164, 74)').length;
  return { tabs: out, goldBtnCount: gold };
}

async function login(browser, url, viewport, label, loginWaitSel, submitSel, readySel) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  try { await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 }); }
  catch (e) { console.log(label, 'goto fail', e.message); await page.close(); return null; }
  try { await page.waitForFunction((s) => document.querySelector(s) !== null, { timeout: 15000 }, loginWaitSel); }
  catch (e) { console.log(label, 'login wait fail', e.message); await page.close(); return null; }
  await sleep(500);
  await page.type(loginWaitSel, 'admin', { delay: 10 });
  await page.type(loginWaitSel.replace('[type="text"]', '[type="password"]'), 'Admin@2026', { delay: 10 });
  await page.click(submitSel);
  try { await page.waitForFunction((s) => document.querySelector(s) !== null, { timeout: 15000 }, readySel); }
  catch (e) { console.log(label, 'ready wait fail', e.message); }
  await sleep(900);
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await login(browser, 'http://localhost:8300/', { width: 1440, height: 900 }, 'desktop', '.login-form input[type="text"]', '.login-submit', '#appRoot');
  const report = { desktop: {}, mobile: {} };
  if (page) {
    const qnBtns = await page.$$('.qn-btn');
    let vi = 0;
    for (const qb of qnBtns) {
      const txt = await qb.evaluate((e) => e.textContent.trim());
      try { await qb.click(); } catch (e) {}
      await sleep(700);
      const probe = await page.evaluate(readTabs);
      report.desktop[txt] = probe;
      vi++;
    }
    await page.close();
  }
  const mpage = await login(browser, 'http://localhost:8300/mobile/', { width: 375, height: 667, isMobile: true }, 'mobile', 'input[type="text"]', '.login-btn', '.tabbar');
  if (mpage) {
    const probe = await mpage.evaluate(readTabs);
    report.mobile = probe;
    await mpage.close();
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
})();
