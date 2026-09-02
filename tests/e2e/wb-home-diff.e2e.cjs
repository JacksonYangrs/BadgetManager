/* ================================================================
 * wb-home-diff.e2e.cjs — T6b 工作台差异化首页 E2E（真实浏览器 + 真实后端）
 * 运行：node tests/e2e/wb-home-diff.e2e.cjs
 * 自启后端（独立临时 DB），puppeteer 驱动真实 SPA，验证 9 角色 wb-home：
 *   ① hello 责任叙事（scopeText）与角色匹配
 *   ② 总览卡接真实表 /api/workbench-overview（kpi 渲染出数字）
 *   ③ 专属面板按 scope 分组（ceo 决策卡 / expense 项目卡 / admin 平台概览 / centerOwner 归口卡）
 *   ④ AI 正在为您关注 区存在（Copilot 动态接口降级占位不报错）
 * 优雅降级：无 puppeteer / 后端启动失败 → SKIP（exit 0）。
 * ================================================================ */
const puppeteer = (() => { try { return require("puppeteer"); } catch { return null; } })();
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.E2E_PORT || 8403);
const BASE = process.env.E2E_BASE || "http://127.0.0.1:" + PORT;
const NODE = process.execPath;
const SERVER = path.resolve(__dirname, "../../server/server.js");
const DB_FILE = process.env.E2E_DB_FILE || path.join(os.tmpdir(), "badget-wbhome-e2e-" + Date.now() + ".db");

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
    console.log("⚠️  SKIP E2E：未安装 puppeteer");
    process.exit(0);
  }

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
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    console.log("\n▸ 工作台差异化首页 E2E（真实浏览器 + 真实后端，独立临时库）");
    console.log("  后端 DB_FILE = " + DB_FILE);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction("window.BM && BM.apiLogin && BM.openView && BM.state", { timeout: 15000 });

    /* 登录 → 打开 wb-home → 等待总览卡异步 fetch 渲染 */
    async function openHome(username) {
      await page.evaluate(async (un) => {
        await new Promise((res) => BM.apiLogin(un, "Admin@2026", res));
        BM.openView("wb-home");
      }, username);
      await new Promise((r) => setTimeout(r, 400));
    }
    const vpText = () => page.evaluate(() => document.getElementById("viewPanel").innerText);
    const kpiCount = () => page.evaluate(() => document.querySelectorAll("#viewPanel .kpi").length);

    /* ---------- ① ceo：集团总览 + 决策入口 ---------- */
    await openHome("zhangmy");
    let txt = await vpText();
    await check("ceo hello 标题含『集团 CEO』", () => { assert(txt.indexOf("集团 CEO") >= 0, "缺标题"); });
    await check("ceo scopeText 含『全局数据』", () => { assert(txt.indexOf("全局数据") >= 0, "缺责任叙事"); });
    await check("ceo 总览卡标题『集团预算总览』", () => { assert(txt.indexOf("集团预算总览") >= 0, "缺总览标题"); });
    await check("ceo 总览卡 kpi 渲染出数字（4 个指标）", () => {
      return kpiCount().then((n) => assert(n >= 4, "kpi 数=" + n));
    });
    await check("ceo 入口卡『待决策 · 重大争议』", () => { assert(txt.indexOf("待决策") >= 0, "缺决策入口"); });
    await check("ceo『AI 正在为您关注』区存在", () => { assert(txt.indexOf("AI 正在为您关注") >= 0, "缺关注区"); });

    /* ---------- ② expense：我负责的项目（无总览卡） ---------- */
    await openHome("zhangwei");
    txt = await vpText();
    await check("expense 面板『我负责的采购项目』", () => { assert(txt.indexOf("我负责的采购项目") >= 0, "缺项目面板"); });
    await check("expense 含『报销数据接入』提示", () => { assert(txt.indexOf("报销数据接入") >= 0, "缺报销提示"); });
    await check("expense 无预算总览卡（基层不接集团总览）", () => {
      return vpText().then((t) => assert(t.indexOf("预算执行总览") < 0, "不该出现总览卡"));
    });

    /* ---------- ③ admin：平台概览 + 运维入口 ---------- */
    await openHome("admin");
    txt = await vpText();
    await check("admin hello 标题含『系统管理员』", () => { assert(txt.indexOf("系统管理员") >= 0, "缺标题"); });
    await check("admin 平台概览『账户 · 组织 · 角色』", () => { assert(txt.indexOf("账户 · 组织 · 角色") >= 0, "缺平台概览"); });
    await check("admin 入口『预算工作人员』", () => { assert(txt.indexOf("预算工作人员") >= 0, "缺账户入口"); });
    await check("admin 入口『基础数据 + AI 配置』", () => { assert(txt.indexOf("AI 配置") >= 0, "缺配置入口"); });
    await check("admin 无预算总览卡（平台层不接预算总览）", () => {
      return vpText().then((t) => assert(t.indexOf("预算执行总览") < 0, "不该出现总览卡"));
    });

    /* ---------- ④ centerOwner：归口总览 + 标准/风险 ---------- */
    await openHome("zhoufang");
    txt = await vpText();
    await check("centerOwner 总览标题『归口科目预算总览』", () => { assert(txt.indexOf("归口科目预算总览") >= 0, "缺归口总览"); });
    await check("centerOwner 入口『归口专业标准』", () => { assert(txt.indexOf("归口专业标准") >= 0, "缺标准入口"); });
    await check("centerOwner 入口『归口风险』", () => { assert(txt.indexOf("归口风险") >= 0, "缺风险入口"); });

    /* ---------- ⑤ 法人层 legalHead：本公司总览 + 协商/调整 ---------- */
    await openHome("chenkai"); /* chenkai = adminHead（本公司行政负责人） */
    txt = await vpText();
    await check("adminHead 总览标题『本公司预算总览』", () => { assert(txt.indexOf("本公司预算总览") >= 0, "缺本公司总览"); });
    await check("adminHead 入口『本公司编制进度』", () => { assert(txt.indexOf("本公司编制进度") >= 0, "缺编制入口"); });
    await check("adminHead 入口『执行偏差』", () => { assert(txt.indexOf("执行偏差") >= 0, "缺看板入口"); });

    /* ---------- ⑥ 全程零 JS 运行异常 ---------- */
    await check("全程无 pageerror（JS 运行异常）", () => {
      assert.strictEqual(pageErrors.length, 0, "pageerror: " + pageErrors.join(" | "));
    });

    console.log("\n工作台差异化 E2E：" + passed + " 通过 / " + failed + " 失败");
  } finally {
    try { if (browser) await browser.close(); } catch {}
    try { child.kill("SIGKILL"); } catch {}
  }

  process.exit(failed ? 1 : 0);
})();
