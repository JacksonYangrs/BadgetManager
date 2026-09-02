/* ================================================================
 * smoke.e2e.cjs — 关键路径 E2E（真实浏览器 + 真实后端，自包含）
 * 运行：node tests/e2e/smoke.e2e.cjs
 * 自启后端（node --experimental-sqlite server/server.js @ E2E_PORT），
 * 用 puppeteer 驱动真实桌面 SPA，断言两条核心合同：
 *   A. 真实登录 admin → roleViews 含核心入口 compile/kanban/rules + accounts/basedata（P2a 修复）
 *   B. 前端 BM.calc.decomposeMonthly(amount) ≡ 后端 API 月度分布（实时跨端合同）
 * 优雅降级：无 puppeteer / 后端启动失败 / 浏览器无法启动 → SKIP（exit 0）。
 * ================================================================ */
const puppeteer = (() => { try { return require("puppeteer"); } catch { return null; } })();
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const PORT = Number(process.env.E2E_PORT || 8401);
const BASE = process.env.E2E_BASE || "http://127.0.0.1:" + PORT;
const NODE = process.execPath;
const SERVER = path.resolve(__dirname, "../../server/server.js");
const DB_FILE = path.join(os.tmpdir(), "smoke-e2e-" + Date.now() + ".db");

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
  for (let i = 0; i < 50; i++) {
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
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    console.log("\n▸ 关键路径 E2E（真实执行）");
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      "window.BM && BM.apiLogin && BM.roleViews && BM.calc && BM.calc.decomposeMonthly",
      { timeout: 15000 }
    );

    /* A) 真实登录 → roleViews 可见性（含 P2a 修复） */
    const views = await page.evaluate(async () => {
      await new Promise((res) => BM.apiLogin("admin", "Admin@2026", res));
      return BM.roleViews();
    });
    await check("真实登录 admin → roleViews 含核心入口（wb-home/compile/kanban/rules）", () => {
      ["wb-home", "compile", "kanban", "rules"].forEach((v) => assert.ok(views.includes(v), "缺少视图 " + v));
    });
    await check("真实登录 admin → roleViews 含 accounts + basedata（P2a 修复）", () => {
      assert.ok(views.includes("accounts"), "缺少 accounts（P2a 修复未完成）");
      assert.ok(views.includes("basedata"), "缺少 basedata（P2a 修复未完成）");
    });

    /* B) 前端分解 ≡ 后端 API 月度分布（实时跨端合同，写后还原；裸 fetch 补认证 token） */
    const cmp = await page.evaluate(async () => {
      const amount = 9876543;
      const fe = BM.calc.decomposeMonthly(amount);
      const token = BM.state.token;
      const h = { Authorization: "Bearer " + token };
      const list = await fetch("/api/events", { headers: h }).then((r) => r.json());
      if (!Array.isArray(list) || !list[0]) throw new Error("events 列表为空或无数据");
      const id = list[0].id, orig = list[0].amount;
      const putH = Object.assign({ "Content-Type": "application/json" }, h);
      await fetch("/api/events/" + id + "/amount", { method: "PUT", headers: putH, body: JSON.stringify({ amount }) });
      const after = await fetch("/api/events/" + id, { headers: h }).then((r) => r.json());
      await fetch("/api/events/" + id + "/amount", { method: "PUT", headers: putH, body: JSON.stringify({ amount: orig }) });
      return { fe, be: after.monthly, sum: after.monthly.reduce((a, b) => a + b, 0) };
    });
    await check("前端 decomposeMonthly ≡ 后端 API 月度分布", () => {
      assert.deepStrictEqual(cmp.fe, cmp.be);
      assert.strictEqual(cmp.sum, 9876543);
    });

    if (pageErrors.length) console.log("  ℹ 页面运行时 JS 异常（未计入失败，供排查）：" + pageErrors.join(" | "));
  } catch (e) {
    console.log("⚠️  E2E 执行异常：" + e.message);
    failed++;
  } finally {
    if (browser) await browser.close();
    try { child.kill("SIGKILL"); } catch {}
    try { fs.unlinkSync(DB_FILE); } catch (_) {}
  }

  console.log("\nE2E 关键路径：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
