/* ================================================================
 * org_editable.e2e.cjs — 组织架构可编辑 (C5) 前端 E2E
 * 覆盖：admin 在基础数据·组织架构 Tab 看到 SVG + 编辑控件；
 *       centerOwner(zhoufang) 同 Tab 仅能看到 SVG，无编辑控件。
 * 运行：NODE_PATH=<node workspace node_modules> node tests/e2e/org_editable.e2e.cjs
 * ================================================================ */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = "http://localhost:8300";
const OUTDIR = path.join(__dirname, "..", "..", "output", "e2e");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

async function login(page, user) {
  await page.fill('.login-field input[type="text"]', user);
  await page.fill('.login-field input[type="password"]', "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#appRoot", { state: "visible", timeout: 8000 });
}

async function openOrgTab(page) {
  await page.click('button.qn-btn:has-text("基础数据")');
  await page.waitForSelector('button.bd-tab:has-text("组织架构")', { timeout: 5000 });
  await page.click('button.bd-tab:has-text("组织架构")');
  // 等待 SVG 渲染（数据获取 + DOM 构建）
  await page.waitForSelector(".bd-orgchart svg", { timeout: 8000 });
  await page.waitForTimeout(500);
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // ---------- admin：可编辑 ----------
  {
    console.log("--- admin 登录 ---");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + "/");
    await login(page, "admin");
    await openOrgTab(page);

    const info = await page.evaluate(() => {
      const svg = document.querySelector(".bd-orgchart svg");
      const bar = document.querySelector(".bd-orgchart .oc-toolbar");
      const addBtn = document.querySelector(".bd-orgchart #ocAdd");
      const rect = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
      return {
        svgFound: !!svg,
        svgWidth: rect.width,
        svgHeight: rect.height,
        nodes: svg ? svg.querySelectorAll(".oc-node").length : 0,
        toolbarFound: !!bar,
        addBtnFound: !!addBtn,
      };
    });
    ok(info.svgFound, "admin 看到 SVG 组织图");
    ok(info.svgHeight > 100, `admin SVG 高度正常 (${info.svgHeight}px)`);
    ok(info.nodes > 0, `admin SVG 包含节点 (${info.nodes} 个)`);
    ok(info.toolbarFound, "admin 看到编辑工具栏");
    ok(info.addBtnFound, "admin 看到「新增组织」按钮");

    await page.screenshot({ path: path.join(OUTDIR, "org_admin.png"), fullPage: false });
    await page.close();
  }

  // ---------- centerOwner(zhoufang)：只读 ----------
  {
    console.log("--- centerOwner(zhoufang) 登录 ---");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + "/");
    await login(page, "zhoufang");
    await openOrgTab(page);

    const info = await page.evaluate(() => {
      const svg = document.querySelector(".bd-orgchart svg");
      const bar = document.querySelector(".bd-orgchart .oc-toolbar");
      const addBtn = document.querySelector(".bd-orgchart #ocAdd");
      const rect = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
      return {
        svgFound: !!svg,
        svgWidth: rect.width,
        svgHeight: rect.height,
        nodes: svg ? svg.querySelectorAll(".oc-node").length : 0,
        toolbarFound: !!bar,
        addBtnFound: !!addBtn,
      };
    });
    ok(info.svgFound, "zhoufang 看到 SVG 组织图");
    ok(info.svgHeight > 100, `zhoufang SVG 高度正常 (${info.svgHeight}px)`);
    ok(info.nodes > 0, `zhoufang SVG 包含节点 (${info.nodes} 个)`);
    ok(!info.toolbarFound, "zhoufang 看不到编辑工具栏");
    ok(!info.addBtnFound, "zhoufang 看不到「新增组织」按钮");

    await page.screenshot({ path: path.join(OUTDIR, "org_viewer.png"), fullPage: false });
    await page.close();
  }

  await browser.close();
  console.log(`\n=== E2E 结果：通过 ${pass} · 失败 ${fail} ===`);
  console.log("截图：", OUTDIR);
  process.exit(fail ? 1 : 0);
})();
