const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on("console", (m) => logs.push("PAGE:" + m.text()));
  page.on("pageerror", (e) => logs.push("PAGEERR:" + e.message));

  await page.goto("http://localhost:8300/", { waitUntil: "networkidle0", timeout: 30000 });

  // login
  await page.waitForSelector(".login-field input", { timeout: 10000 });
  const inputs = await page.$$(".login-field input");
  await inputs[0].type("admin");
  await inputs[1].type("Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { visible: true, timeout: 10000 });
  await new Promise((r) => setTimeout(r, 600));

  async function probe(hash, tabLabel, selector, shot) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await new Promise((r) => setTimeout(r, 800));
    if (tabLabel) {
      // click the rtab button with matching label
      const clicked = await page.evaluate((lab) => {
        const btns = Array.from(document.querySelectorAll(".rtab-btn"));
        const b = btns.find((x) => x.textContent.trim().includes(lab));
        if (b) { b.click(); return true; }
        return false;
      }, tabLabel);
      logs.push("tabClick(" + tabLabel + ")=" + clicked);
      await new Promise((r) => setTimeout(r, 500));
    }
    await page.waitForSelector(selector, { visible: true, timeout: 8000 });
    const info = await page.evaluate((sel) => {
      const lab = document.querySelector(sel);
      const input = lab && lab.parentElement ? lab.parentElement.querySelector('input[type="file"]') : null;
      const cs = lab ? getComputedStyle(lab) : null;
      const ics = input ? getComputedStyle(input) : null;
      return {
        labelText: lab ? lab.textContent.trim() : null,
        labelBg: cs ? cs.backgroundColor : null,
        labelColor: cs ? cs.color : null,
        inputW: ics ? ics.width : null,
        inputPos: ics ? ics.position : null,
        inputClip: ics ? ics.clip : null,
      };
    }, selector);
    await page.screenshot({ path: shot, fullPage: false });
    logs.push(selector + " => " + JSON.stringify(info));
    return info;
  }

  // rules -> createNext
  const r1 = await probe("rules", "创建明年新规则", ".file-pick-label", "reports/audit/filebtn-rules.png");
  // import view (no sub-tab)
  const r2 = await probe("importView", null, ".file-pick-label", "reports/audit/filebtn-import.png");

  console.log("RESULTS:");
  console.log(JSON.stringify({ r1, r2 }, null, 2));
  console.log("LOGS:\n" + logs.join("\n"));
  await browser.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
