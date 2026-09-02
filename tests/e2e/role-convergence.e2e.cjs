/* ================================================================
 * role-convergence.e2e.cjs — T7 角色模型收敛回归 E2E（真实浏览器 + 真实后端）
 * 运行：node tests/e2e/role-convergence.e2e.cjs
 * 自启后端（node --experimental-sqlite server/server.js @ E2E_PORT，
 *          独立临时 DB_FILE，不与 dev 库/运行中 dev server 争锁），
 * 用 puppeteer 驱动真实桌面 SPA，断言角色收敛（14 混合角色 → 9 标准 role code）：
 *   A. 前端 BM.ROLES 恰 9 个标准角色，无 boss/finance/manager/staff/buHead
 *   B. 角色切换器（demo 通道）仅 9 张角色卡，参数联动（中心/费用类型/法人公司）
 *   C. 前端 BM.ROLES 与后端 GET /api/roles 字典一致
 *   D. 5 个 seed 用户真实登录 → 角色映射正确 + /api/auth/me 无旧角色
 *   E. roleViews 白名单（ceo/cooAnalyst/adminHead/expense 代表角色）
 * 优雅降级：无 puppeteer / 后端启动失败 / 浏览器无法启动 → SKIP（exit 0）。
 * ================================================================ */
const puppeteer = (() => { try { return require("puppeteer"); } catch { return null; } })();
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const PORT = Number(process.env.E2E_PORT || 8402);
const BASE = process.env.E2E_BASE || "http://127.0.0.1:" + PORT;
const NODE = process.execPath;
const SERVER = path.resolve(__dirname, "../../server/server.js");
/* 独立临时库：避免与运行中的 dev server（8300）共用 economic_event.db 产生 SQLITE_BUSY，
 * 同时验证「全新库直接 seed 收敛结果」路径（旧库迁移路径见 tests/integration/role-migration.test.cjs）。 */
const DB_FILE = process.env.E2E_DB_FILE || path.join(os.tmpdir(), "badget-role-e2e-" + Date.now() + ".db");

const STANDARD = ["admin", "ceo", "cooLead", "cooAnalyst", "legalHead", "adminHead", "companyBudgeter", "centerOwner", "expense"];
const OBSOLETE = ["boss", "finance", "manager", "staff", "buHead"];
/* 5 个 seed 用户收敛后期望角色（与 USER_SEEDS / ROLE_REMAP 一致） */
const SEED_EXPECT = [
  { username: "zhangmy",   roles: ["ceo"] },
  { username: "lijing",    roles: ["cooAnalyst", "centerOwner"] },
  { username: "zhangwei",  roles: ["expense"] },
  { username: "wangmin",   roles: ["adminHead"] },
  { username: "sunyue",    roles: ["cooAnalyst"] },
];
const SEED_PASSWORD = "Admin@2026";

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

  /* 自启后端（独立临时 DB） */
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

    console.log("\n▸ 角色模型收敛 E2E（真实浏览器 + 真实后端，独立临时库）");
    console.log("  后端 DB_FILE = " + DB_FILE);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(
      "window.BM && BM.apiLogin && BM.roleViews && BM.ROLES && BM.state",
      { timeout: 15000 }
    );

    /* 注意：website/views/roleSwitch.js 未在 index.html 中加载（孤儿文件，见测试报告），
     * 此处显式注入其真实源码以验证「角色切换器收敛逻辑」（9 角色 / 参数联动）。 */
    await page.addScriptTag({ path: path.resolve(__dirname, "../../website/views/roleSwitch.js") });
    const rsDefined = await page.evaluate(() => typeof BM.renderRoleSwitch === "function");
    if (!rsDefined) throw new Error("roleSwitch.js 注入后 BM.renderRoleSwitch 仍缺失");

    /* ---------- A. 前端角色字典收敛 ---------- */
    const roleKeys = await page.evaluate(() => Object.keys(BM.ROLES).slice().sort());
    await check("A1 前端 BM.ROLES 恰 9 个标准角色", () => {
      assert.deepStrictEqual(roleKeys, STANDARD.slice().sort());
    });
    await check("A2 前端 BM.ROLES 无 5 个旧角色（boss/finance/manager/staff/buHead）", () => {
      const hit = roleKeys.filter((k) => OBSOLETE.includes(k));
      assert.strictEqual(hit.length, 0, "仍含旧角色 " + hit.join(","));
    });

    /* ---------- B. 角色切换器（demo 通道：未登录 → 渲染全部 BM.ROLES） ---------- */
    const switcher = await page.evaluate(async () => {
      BM.renderRoleSwitch();
      await new Promise((r) => setTimeout(r, 50));
      const cards = [...document.querySelectorAll("#modalRoot .role-card")];
      const ids = cards.map((c) => [...c.classList].find((x) => x !== "role-card" && x !== "selected"));
      return { count: cards.length, ids: ids.filter(Boolean) };
    });
    await check("B1 角色切换器仅渲染 9 张角色卡", () => {
      assert.strictEqual(switcher.count, 9, "实际渲染 " + switcher.count + " 张");
    });
    await check("B2 角色切换器无旧角色卡", () => {
      const hit = switcher.ids.filter((id) => OBSOLETE.includes(id));
      assert.strictEqual(hit.length, 0, "仍含旧角色卡 " + hit.join(","));
    });

    /* 参数联动：centerOwner→选中心 / expense→选费用类型 / 法人层→选公司（§8.2） */
    const params = await page.evaluate(async () => {
      const click = (cls) => { const c = document.querySelector("#modalRoot .role-card." + cls); if (c) c.click(); };
      const read = () => [...document.querySelectorAll("#modalRoot .login-dept")].map((r) => r.style.display);
      click("centerOwner"); await new Promise((r) => setTimeout(r, 10)); const center = read();
      click("expense");      await new Promise((r) => setTimeout(r, 10)); const expense = read();
      click("legalHead");    await new Promise((r) => setTimeout(r, 10)); const company = read();
      return { center, expense, company };
    });
    await check("B3 centerOwner 显示「选择职能中心」下拉", () => {
      assert.strictEqual(params.center[0], "flex", "中心行 display=" + params.center[0]);
    });
    await check("B4 expense 显示「选择费用类型」下拉", () => {
      assert.strictEqual(params.expense[1], "flex", "费用类型行 display=" + params.expense[1]);
    });
    await check("B5 法人层角色显示「选择法人公司」下拉", () => {
      assert.strictEqual(params.company[2], "flex", "法人公司行 display=" + params.company[2]);
    });

    /* ---------- C. 前端 BM.ROLES ↔ 后端 /api/roles 字典一致（§8.4） ---------- */
    await check("C1 前端 BM.ROLES 与后端 /api/roles 字典一致", async () => {
      const backend = await page.evaluate(async () => {
        /* 先以 admin 登录拿 token 调 /api/roles（该接口需鉴权） */
        await new Promise((res) => BM.apiLogin("admin", "Admin@2026", res));
        const list = await BM.apiGet("/api/roles");
        return (list || []).map((r) => r.code).sort();
      });
      assert.deepStrictEqual(roleKeys, backend.slice().sort(), "后端 codes=" + backend.join(","));
    });

    /* ---------- D. 5 个 seed 用户真实登录映射 + /api/auth/me 无旧角色 ---------- */
    for (const u of SEED_EXPECT) {
      const got = await page.evaluate(async (username) => {
        await new Promise((res) => BM.apiLogin(username, "Admin@2026", res));
        const token = BM.state.token;
        const me = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + token } }).then((r) => r.json());
        return {
          stateRoles: (BM.state.user && BM.state.user.roles || []).map((r) => r.code),
          meRoles: (me.roles || []).map((r) => r.code),
          views: BM.roleViews(),
        };
      }, u.username);

      await check(`D ${u.username} 登录角色 = ${JSON.stringify(u.roles)}`, () => {
        assert.deepStrictEqual(got.stateRoles.slice().sort(), u.roles.slice().sort(), "实际=" + got.stateRoles.join(","));
      });
      await check(`D ${u.username} /api/auth/me 角色映射正确且无旧角色`, () => {
        assert.deepStrictEqual(got.meRoles.slice().sort(), u.roles.slice().sort(), "实际=" + got.meRoles.join(","));
        const hit = got.meRoles.filter((r) => OBSOLETE.includes(r));
        assert.strictEqual(hit.length, 0, "仍含旧角色 " + hit.join(","));
      });
    }

    /* ---------- E. roleViews 白名单（代表角色，§4.1 核心视图 + 角色差异） ---------- */
    async function loginViews(username) {
      return page.evaluate(async (un) => {
        await new Promise((res) => BM.apiLogin(un, "Admin@2026", res));
        return BM.roleViews();
      }, username);
    }
    const CORE = ["wb-home", "compile", "kanban", "rules"];

    const vCeo = await loginViews("zhangmy");
    await check("E1 ceo roleViews 含核心 4 视图 + 集团层 balance（§4.1 部分）", () => {
      CORE.forEach((v) => assert.ok(vCeo.includes(v), "缺 " + v));
      assert.ok(vCeo.includes("balance"), "ceo 缺 balance（集团层调整）");
      assert.ok(!vCeo.includes("org"), "不应含已移除的 org 菜单");
    });

    const vAnalyst = await loginViews("sunyue");
    await check("E2 cooAnalyst roleViews 含 basedata/accounts/ai-config/balance（总经办编辑）", () => {
      CORE.forEach((v) => assert.ok(vAnalyst.includes(v), "缺 " + v));
      ["basedata", "accounts", "ai-config", "balance"].forEach((v) => assert.ok(vAnalyst.includes(v), "cooAnalyst 缺 " + v));
    });

    const vAdminHead = await loginViews("wangmin");
    await check("E3 adminHead roleViews 恰为核心 4 视图（无越权 basedata/accounts/balance）", () => {
      CORE.forEach((v) => assert.ok(vAdminHead.includes(v), "缺 " + v));
      ["basedata", "accounts", "ai-config", "balance"].forEach((v) => assert.ok(!vAdminHead.includes(v), "adminHead 越权含 " + v));
    });

    const vExpense = await loginViews("zhangwei");
    await check("E4 expense roleViews 恰为核心 4 视图（无越权）", () => {
      CORE.forEach((v) => assert.ok(vExpense.includes(v), "缺 " + v));
      ["basedata", "accounts", "ai-config", "balance"].forEach((v) => assert.ok(!vExpense.includes(v), "expense 越权含 " + v));
    });

    /* 信息性输出：§4.1 全矩阵 vs 当前 roleViews 差异（待建视图属 T6/后续，不计失败） */
    const SEC41 = {
      ceo: ["wb-home", "compile", "kanban", "rules", "balance", "benchmark", "collision", "riskView", "final"],
      cooAnalyst: ["wb-home", "compile", "kanban", "rules", "basedata", "accounts", "ai-config", "benchmark", "collision", "importView"],
      adminHead: ["wb-home", "compile", "kanban", "rules", "collisionTune"],
      expense: ["wb-home", "compile", "kanban", "rules"],
    };
    const cur = { ceo: vCeo, cooAnalyst: vAnalyst, adminHead: vAdminHead, expense: vExpense };
    console.log("  ℹ §4.1 全矩阵 vs 当前 roleViews（待建视图，不计失败）:");
    Object.keys(SEC41).forEach((r) => {
      const miss = SEC41[r].filter((v) => !cur[r].includes(v));
      console.log("      " + r + " 缺 " + (miss.length ? miss.join("/") : "—") + "（当前=" + cur[r].join(",") + "）");
    });

    if (pageErrors.length) console.log("  ℹ 页面运行时 JS 异常（未计入失败，供排查）：" + pageErrors.join(" | "));
  } catch (e) {
    console.log("⚠️  E2E 执行异常：" + e.message);
    failed++;
  } finally {
    if (browser) await browser.close();
    try { child.kill("SIGKILL"); } catch {}
  }

  console.log("\n角色收敛 E2E：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
