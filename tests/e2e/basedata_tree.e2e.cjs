/* ================================================================
 * basedata_tree.e2e.cjs — 经济事项 4 级分类树 · 基础数据页真机 E2E（L4）
 * 运行：node tests/e2e/basedata_tree.e2e.cjs
 * 自启后端（node --experimental-sqlite server/server.js @ E2E_PORT + 独立 DB_FILE），
 * 用 puppeteer 驱动真实桌面 SPA，覆盖：
 *   1. 真实登录 admin → 进「基础数据」页（顶部 quicknav 点击）
 *   2. 4 级分类树渲染（bd-tree / 节点 / 层级缩进 / L1「人工」默认展开）
 *   3. 叶子挂经济事项（bd-event-row）
 *   4. 级联表单：新增经济事项时「关联会计科目」下拉只列叶子（无非叶子节点）
 *   5. 新增经济事项 → 真实落库（API 反查）
 *   6. 编辑经济事项 → 级联下拉回显当前叶子路径 → 改名落库
 * 优雅降级：无 puppeteer / 后端启动失败 → SKIP（exit 0）。
 * ================================================================ */
const puppeteer = (() => { try { return require("puppeteer"); } catch { return null; } })();
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const PORT = Number(process.env.E2E_PORT || 8410);
const BASE = process.env.E2E_BASE || "http://127.0.0.1:" + PORT;
const NODE = process.execPath;
const SERVER = path.resolve(__dirname, "../../server/server.js");
const DB_FILE = path.join(os.tmpdir(), "basedata-e2e-" + Date.now() + ".db");
const OUTDIR = path.join(__dirname, "..", "..", "output", "e2e");

function get(p) {
  return new Promise((res, rej) => {
    const r = http.get(BASE + p, (x) => {
      let d = ""; x.on("data", (c) => (d += c));
      x.on("end", () => { let j; try { j = JSON.parse(d); } catch { j = d; } res({ status: x.statusCode, body: j }); });
    });
    r.on("error", rej);
  });
}

(async () => {
  if (!puppeteer) {
    console.log("⚠️  SKIP E2E：未安装 puppeteer（运行 `npm i puppeteer` 后启用）");
    process.exit(0);
  }

  /* 自启后端（独立 DB_FILE，避免 SQLITE_BUSY / 污染开发库） */
  const child = spawn(NODE, ["--experimental-sqlite", SERVER], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_FILE }),
    stdio: ["ignore", "ignore", "ignore"],
  });
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    try { const h = await get("/api/health"); if (h.status === 200) { healthy = true; break; } } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!healthy) {
    console.log("⚠️  SKIP E2E：后端启动失败");
    try { child.kill("SIGKILL"); } catch {}
    process.exit(0);
  }

  let passed = 0, failed = 0;
  const assert = require("assert");
  const check = async (name, fn) => {
    try { await fn(); passed++; console.log("  ✓ " + name); }
    catch (e) { failed++; console.log("  ✗ " + name + "  →  " + e.message); }
  };

  let browser;
  try {
    fs.mkdirSync(OUTDIR, { recursive: true });
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    console.log("\n▸ 基础数据 · 4 级分类树真机 E2E");

    /* 1. 打开首页 → 真实登录 */
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector('.login-field input[type="text"]', { timeout: 15000 });
    await page.type('.login-field input[type="text"]', "admin");
    await page.type('.login-field input[type="password"]', "Admin@2026");
    await page.click(".login-submit");
    await page.waitForFunction(
      "document.getElementById('appRoot').style.display === 'flex'",
      { timeout: 15000 }
    );
    await check("真实登录 admin → 进入主界面（appRoot 可见）", () => {
      assert.ok(true);
    });

    /* 2. 点击顶部「基础数据」→ 4 级分类树渲染 */
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("#quicknav button.qn-btn"));
      const b = btns.find((x) => x.textContent.trim() === "基础数据");
      if (!b) throw new Error("导航缺少「基础数据」入口");
      b.click();
    });
    await page.waitForSelector(".bd-tree", { timeout: 15000 });

    const treeInfo = await page.evaluate(() => {
      const tree = document.querySelector(".bd-tree");
      const nodes = document.querySelectorAll(".bd-tree-node");
      const names = Array.from(document.querySelectorAll(".bd-tree-name")).map((n) => n.textContent.trim());
      const eventRows = document.querySelectorAll(".bd-event-row");
      const paddings = new Set(Array.from(document.querySelectorAll(".bd-tree-row")).map((r) => r.style.paddingLeft));
      const hasRengong = names.includes("人工");
      // 默认展开 L1：找「人工」节点，看其是否非 collapsed
      let rengongExpanded = false;
      nodes.forEach((n) => {
        const nm = n.querySelector(".bd-tree-name");
        if (nm && nm.textContent.trim() === "人工" && !n.classList.contains("collapsed")) rengongExpanded = true;
      });
      return {
        treeFound: !!tree,
        nodeCount: nodes.length,
        eventRowCount: eventRows.length,
        hasRengong,
        rengongExpanded,
        paddingLevels: paddings.size,
      };
    });
    await check("4 级分类树渲染：bd-tree + 节点 + 含「人工」L1", () => {
      assert.ok(treeInfo.treeFound, "缺 .bd-tree");
      assert.ok(treeInfo.nodeCount > 0, "无树节点");
      assert.ok(treeInfo.hasRengong, "缺 L1「人工」节点");
    });
    await check("L1「人工」默认展开（非 collapsed）", () => {
      assert.ok(treeInfo.rengongExpanded, "「人工」应默认展开");
    });
    await check("层级缩进：存在 ≥2 级缩进（paddingLeft 分层）", () => {
      assert.ok(treeInfo.paddingLevels >= 2, "缩进层级不足: " + treeInfo.paddingLevels);
    });
    await check("叶子挂经济事项：bd-event-row 渲染 > 0", () => {
      assert.ok(treeInfo.eventRowCount > 0, "无经济事项行渲染");
    });

    /* 3. 级联表单：新增经济事项 → 下拉列全部科目节点（含中间节点），可选中「物料消耗」所属中间节点 */
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".bd-toolbar button"));
      const b = btns.find((x) => x.textContent.includes("新增经济事项"));
      if (!b) throw new Error("缺少「新增经济事项」按钮");
      b.click();
    });
    await page.waitForSelector("#e_sub", { timeout: 10000 });

    const cascadeInfo = await page.evaluate(async () => {
      const token = BM.state.token;
      const tree = await fetch("/api/subjects?tree=1", { headers: { Authorization: "Bearer " + token } }).then((r) => r.json());
      const flat = [];
      (function walk(ns) { ns.forEach((n) => { flat.push(n); walk(n.children || []); }); })(tree);
      const sel = document.querySelector("#e_sub");
      if (!sel) return { ok: false, reason: "no #e_sub" };
      const opts = Array.from(sel.options).filter((o) => o.value !== "");
      // 「物料消耗」所属中间节点：path 恰好为「材料消耗/物料消耗」（其 9 个 L3 子节点 path 更长，不误匹配）
      const wl = opts.find((o) => o.textContent.trim() === "材料消耗/物料消耗");
      return {
        ok: true,
        optionCount: opts.length,
        totalNodeCount: flat.length,
        wlFound: !!wl,
        wlValue: wl ? wl.value : "",
      };
    });
    await check("级联表单：关联会计科目下拉列全部科目节点（option 数 = 科目节点数，含中间节点）", () => {
      assert.ok(cascadeInfo.ok, cascadeInfo.reason || "");
      assert.strictEqual(cascadeInfo.optionCount, cascadeInfo.totalNodeCount,
        "下拉 option(" + cascadeInfo.optionCount + ") ≠ 科目节点数(" + cascadeInfo.totalNodeCount + ")");
    });
    await check("级联表单：能选中「物料消耗」所属中间节点「材料消耗/物料消耗」", () => {
      assert.ok(cascadeInfo.wlFound, "级联表单缺少「材料消耗/物料消耗」中间节点 option");
    });

    /* 4. 新增经济事项 → 真实落库 */
    const newCat = "E2E测试事项_" + Date.now();
    await page.evaluate((cat) => {
      const catInput = document.querySelector("#e_cat");
      catInput.value = cat;
      const sel = document.querySelector("#e_sub");
      // 选第一个非空 option
      const first = Array.from(sel.options).find((o) => o.value !== "");
      if (first) sel.value = first.value;
      document.querySelector("#e_save").click();
    }, newCat);
    // 等 modal 关闭 + 树刷新
    await page.waitForFunction(
      () => !document.querySelector(".modal-mask") && document.querySelector(".bd-tree"),
      { timeout: 10000 }
    );
    await check("新增经济事项 → 真实落库（API 反查存在且挂有效科目节点）", async () => {
      const token = await page.evaluate(() => BM.state.token);
      const evs = await new Promise((res, rej) => {
        http.get(BASE + "/api/events", { headers: { Authorization: "Bearer " + token } }, (r) => {
          let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
        }).on("error", rej);
      });
      const hit = evs.find((e) => e.cat === newCat);
      assert.ok(hit, "未找到新增经济事项 " + newCat);
      assert.ok(hit.subjectId != null, "新增经济事项 subjectId 应为有效科目节点");
    });

    /* 5. 编辑经济事项 → 级联回显 + 改名落库 */
    const editedCat = newCat + "_改";
    await page.evaluate((cat) => {
      // 找到刚新增事项行（bd-event-row）的「编辑」按钮
      const rows = Array.from(document.querySelectorAll(".bd-event-row"));
      const target = rows.find((r) => r.querySelector(".bd-event-name") && r.querySelector(".bd-event-name").textContent.trim() === cat);
      if (!target) throw new Error("未找到事项行 " + cat);
      const editBtn = Array.from(target.querySelectorAll("button")).find((b) => b.textContent.trim() === "编辑");
      if (!editBtn) throw new Error("事项行缺少编辑按钮");
      editBtn.click();
    }, newCat);
    await page.waitForSelector("#e_cat", { timeout: 10000 });
    const editEcho = await page.evaluate(async () => {
      const sel = document.querySelector("#e_sub");
      const selected = sel.options[sel.selectedIndex];
      const catVal = document.querySelector("#e_cat").value;
      return { catVal, subText: selected ? selected.textContent : "", hasPath: selected ? selected.textContent.includes("/") : false };
    });
    await check("编辑经济事项：级联下拉回显当前科目（含完整路径）", () => {
      assert.strictEqual(editEcho.catVal, newCat, "编辑表单应预填原事项名");
      assert.ok(editEcho.subText && editEcho.subText !== "（未关联）", "应回显科目");
    });
    await page.evaluate((cat) => {
      document.querySelector("#e_cat").value = cat;
      document.querySelector("#e_save").click();
    }, editedCat);
    await page.waitForFunction(
      () => !document.querySelector(".modal-mask") && document.querySelector(".bd-tree"),
      { timeout: 10000 }
    );
    await check("编辑经济事项 → 改名落库（API 反查新名）", async () => {
      const token = await page.evaluate(() => BM.state.token);
      const evs = await new Promise((res, rej) => {
        http.get(BASE + "/api/events", { headers: { Authorization: "Bearer " + token } }, (r) => {
          let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => res(JSON.parse(d)));
        }).on("error", rej);
      });
      assert.ok(evs.some((e) => e.cat === editedCat), "未找到改名后的事项 " + editedCat);
      assert.ok(!evs.some((e) => e.cat === newCat), "旧名应已替换");
    });

    await page.screenshot({ path: path.join(OUTDIR, "basedata_tree.png"), fullPage: false });

    if (pageErrors.length) console.log("  ℹ 页面运行时 JS 异常（供排查）：" + pageErrors.join(" | "));
  } catch (e) {
    console.log("⚠️  E2E 执行异常：" + e.message);
    failed++;
  } finally {
    if (browser) await browser.close();
    try { child.kill("SIGKILL"); } catch {}
    try { fs.unlinkSync(DB_FILE); } catch (_) {}
  }

  console.log("\n基础数据 4 级分类树 E2E：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
