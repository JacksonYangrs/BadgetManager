const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, 'assets');
const URL = 'http://localhost:8300/';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function capture(browser, viewport, label) {
  const context = await browser.createBrowserContext({ isIncognito: true });
  const page = await context.newPage();
  page.on('console', (msg) => console.log(`[${label}] console:`, msg.text()));
  page.on('pageerror', (err) => console.log(`[${label}] pageerror:`, err.message));
  await page.setViewport(viewport);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  console.log(`[${label}] goto done`);
  const quickCheck = await page.evaluate(() => ({
    loginRoot: document.getElementById('loginRoot')?.innerHTML?.slice(0, 200) || null,
    inputs: document.querySelectorAll('.login-form input[type="text"]').length,
  }));
  console.log(`[${label}] quickCheck`, quickCheck);
  await page.waitForFunction(
    () => document.querySelector('.login-form input[type="text"]') !== null,
    { timeout: 15000 }
  );
  await sleep(500);

  // screenshot login
  const loginPath = path.join(OUT, `login-${label}.png`);
  await page.screenshot({ path: loginPath, fullPage: false });

  // collect login metadata
  const loginMeta = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || null,
    lang: document.documentElement.lang,
    h1s: Array.from(document.querySelectorAll('h1')).map((e) => e.textContent.trim()),
    h2s: Array.from(document.querySelectorAll('h2')).map((e) => e.textContent.trim()),
    h3s: Array.from(document.querySelectorAll('h3')).map((e) => e.textContent.trim()),
    buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map((e) => e.textContent.trim()).filter(Boolean),
    links: Array.from(document.querySelectorAll('a')).map((e) => ({ text: e.textContent.trim(), href: e.href })),
    imagesWithoutAlt: Array.from(document.querySelectorAll('img:not([alt])')).length,
    totalImages: Array.from(document.querySelectorAll('img')).length,
    landmarks: {
      main: !!document.querySelector('main'),
      nav: !!document.querySelector('nav'),
      footer: !!document.querySelector('footer'),
      header: !!document.querySelector('header'),
      aside: !!document.querySelector('aside'),
    },
  }));

  // performance baseline before login
  const perfLogin = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      ttfb: nav ? nav.responseStart - nav.startTime : null,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
      loadComplete: nav ? nav.loadEventEnd - nav.startTime : null,
    };
  });

  // login
  await page.type('.login-form input[type="text"]', 'admin', { delay: 10 });
  await page.type('.login-form input[type="password"]', 'Admin@2026', { delay: 10 });
  await page.click('.login-submit');
  await page.waitForFunction(() => {
    const app = document.getElementById('appRoot');
    return app && app.style.display !== 'none';
  }, { timeout: 15000 });
  await sleep(1500);

  // screenshot app
  const appPath = path.join(OUT, `app-${label}.png`);
  await page.screenshot({ path: appPath, fullPage: false });

  // collect app metadata
  const appMeta = await page.evaluate(() => {
    const allText = document.body.innerText;
    return {
      title: document.title,
      h1s: Array.from(document.querySelectorAll('h1')).map((e) => e.textContent.trim()),
      h2s: Array.from(document.querySelectorAll('h2')).map((e) => e.textContent.trim()),
      h3s: Array.from(document.querySelectorAll('h3')).map((e) => e.textContent.trim()),
      buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map((e) => e.textContent.trim()).filter(Boolean),
      links: Array.from(document.querySelectorAll('a')).map((e) => ({ text: e.textContent.trim(), href: e.href })),
      navLabels: Array.from(document.querySelectorAll('#quicknav .qn-btn')).map((e) => e.textContent.trim()),
      copilotMessages: Array.from(document.querySelectorAll('.msg')).map((e) => e.innerText.trim()).slice(0, 6),
      totalImages: Array.from(document.querySelectorAll('img')).length,
      imagesWithoutAlt: Array.from(document.querySelectorAll('img:not([alt])')).length,
      wordCount: allText.split(/\s+/).filter((w) => w.length > 0).length,
      landmarks: {
        main: !!document.querySelector('main'),
        nav: !!document.querySelector('nav'),
        footer: !!document.querySelector('footer'),
        header: !!document.querySelector('header'),
        aside: !!document.querySelector('aside'),
      },
    };
  });

  // performance after login (lab LCP/CLS/TBT proxy)
  const perfApp = await page.evaluate(() => {
    return new Promise((resolve) => {
      let lcp = null;
      let cls = 0;
      const obsLcp = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length) lcp = entries[entries.length - 1].startTime;
      });
      obsLcp.observe({ entryTypes: ['largest-contentful-paint'] });
      const obsCls = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) cls += e.value;
        }
      });
      obsCls.observe({ entryTypes: ['layout-shift'] });
      const longTasks = performance.getEntriesByType('longtask') || [];
      const tbt = longTasks.reduce((sum, t) => sum + t.duration - 50, 0);
      setTimeout(() => {
        obsLcp.disconnect();
        obsCls.disconnect();
        resolve({ lcp, cls, tbt, longTaskCount: longTasks.length });
      }, 3000);
    });
  });

  // extract computed brand colors from key elements
  const palette = await page.evaluate(() => {
    const els = [
      document.querySelector('.topbar'),
      document.querySelector('.btn-primary'),
      document.querySelector('.btn-accent'),
      document.querySelector('.copilot-panel'),
      document.querySelector('.view-panel'),
      document.querySelector('.login-card'),
      document.querySelector('body'),
    ].filter(Boolean);
    return els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        selector: el.className || el.tagName,
        backgroundColor: cs.backgroundColor,
        color: cs.color,
        borderColor: cs.borderColor,
      };
    });
  });

  await context.close();
  return { loginPath, appPath, loginMeta, appMeta, perfLogin, perfApp, palette };
}

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const desktop = await capture(browser, { width: 1440, height: 900 }, 'desktop');
  const mobile = await capture(browser, { width: 375, height: 667, isMobile: true }, 'mobile');
  await browser.close();

  const output = {
    url: URL,
    capturedAt: new Date().toISOString(),
    desktop,
    mobile,
  };
  fs.writeFileSync(path.join(OUT, '..', 'capture.json'), JSON.stringify(output, null, 2));
  console.log('capture done', path.join(OUT, '..', 'capture.json'));
})();
