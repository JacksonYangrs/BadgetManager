/* ================================================================
 * backend-api.test.cjs — 后端 API 回归（集成测试，独立于单元套件）
 * 运行：node --experimental-sqlite tests/integration/backend-api.test.cjs
 * 前提：项目根安装 express（npm i express）；server 启动会初始化 economic_event.db。
 * 优雅降级：express 缺失或 server 启动失败 → SKIP（exit 0，不阻断 CI）。
 * 用例：
 *   1. GET  /api/health                       → 200 {ok:true}
 *   2. GET  /api/events                       → 200 数组
 *   3. GET  /api/roles                        → 200 数组
 *   4. POST /api/auth/login (admin/Admin@2026) → 200 {user,token}
 *   5. GET  /api/events/:id（取首条）          → 200
 * ================================================================ */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = 8399;
const SERVER = path.resolve(__dirname, "../../server/server.js");
const NODE = process.execPath;

function req(method, p, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { method, host: "127.0.0.1", port: PORT, path: p, headers: Object.assign({ "Content-Type": "application/json" }, headers || {}) },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { let j; try { j = JSON.parse(d); } catch { j = d; } resolve({ status: res.statusCode, body: j }); });
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

function waitHealth(tries) {
  return new Promise((resolve, reject) => {
    const tick = () =>
      req("GET", "/api/health")
        .then((r) => (r.status === 200 ? resolve() : tries-- ? setTimeout(tick, 300) : reject(new Error("health timeout"))))
        .catch(() => (tries-- ? setTimeout(tick, 300) : reject(new Error("health timeout"))));
    tick();
  });
}

(async () => {
  try { require.resolve("express"); } catch {
    console.log("⚠️  SKIP 后端 API 回归：未安装 express（运行 `npm i express` 后启用）");
    process.exit(0);
  }

  const DB_FILE = path.join(require("os").tmpdir(), "badget-test-" + Date.now() + ".db"); /* 测试隔离：不污染开发库 */
  const spawnServer = () =>
    spawn(NODE, ["--experimental-sqlite", SERVER], {
      env: Object.assign({}, process.env, { PORT: String(PORT), DB_FILE }),
      stdio: ["ignore", "ignore", "ignore"],
    });

  let child = spawnServer();

  let passed = 0, failed = 0;
  const OBSOLETE = ["boss", "finance", "staff", "manager", "buHead"];
  const assert = require("assert");
  const check = async (name, fn) => {
    try { await fn(); passed++; console.log("  ✓ " + name); }
    catch (e) { failed++; console.log("  ✗ " + name + " → " + e.message); }
  };

  try {
    await waitHealth(50);
    console.log("\n▸ 后端 API 回归（集成）");
    await check("GET /api/health → 200 {ok:true}", async () => {
      const r = await req("GET", "/api/health");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.ok, true);
    });
    let firstId = null, token = null;
    await check("POST /api/auth/login admin → 200 {user,token}", async () => {
      const r = await req("POST", "/api/auth/login", {}, { username: "admin", password: "Admin@2026" });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.token, "登录应返回 token");
      token = r.body.token;
    });
    await check("GET /api/events → 200 数组", async () => {
      const r = await req("GET", "/api/events", token ? { authorization: "Bearer " + token } : {});
      assert.strictEqual(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });
    await check("GET /api/roles → 9 个标准角色，无旧角色", async () => {
      const r = await req("GET", "/api/roles", token ? { authorization: "Bearer " + token } : {});
      assert.strictEqual(r.status, 200);
      assert.ok(Array.isArray(r.body));
      assert.strictEqual(r.body.length, 9);
      const codes = r.body.map((x) => x.code);
      OBSOLETE.forEach((c) => assert.ok(!codes.includes(c), "角色字典仍含旧角色 " + c));
    });
    await check("GET /api/events 首条可定位", async () => {
      const r = await req("GET", "/api/events", token ? { authorization: "Bearer " + token } : {});
      firstId = r.body[0] && r.body[0].id;
      assert.ok(firstId != null);
    });
    /* ---------- 角色收敛回归：5 用户重映射 + me 无旧角色 + 权限闸门 ---------- */
    const ROLE_REMAP = {
      zhangmy: ["ceo"],
      lijing: ["cooAnalyst", "centerOwner"],
      zhangwei: ["expense"],
      wangmin: ["adminHead"],
      sunyue: ["cooAnalyst"],
    };
    for (const [un, expRoles] of Object.entries(ROLE_REMAP)) {
      await check(`登录 ${un} → 角色映射 ${JSON.stringify(expRoles)}`, async () => {
        const r = await req("POST", "/api/auth/login", {}, { username: un, password: "Admin@2026" });
        assert.strictEqual(r.status, 200);
        const roles = (r.body.user.roles || []).map((x) => x.code).sort();
        assert.deepStrictEqual(roles, expRoles.slice().sort());
      });
    }
    await check("GET /api/auth/me → roles 不含旧角色", async () => {
      const r = await req("GET", "/api/auth/me", { authorization: "Bearer " + token });
      assert.strictEqual(r.status, 200);
      const codes = (r.body.roles || []).map((x) => x.code);
      OBSOLETE.forEach((c) => assert.ok(!codes.includes(c), "me 仍含旧角色 " + c));
    });
    await check("权限闸门 · zhangwei(expense) 编辑基础数据 → 403", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "zhangwei", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("POST", "/api/subjects", { authorization: "Bearer " + t }, { code: "T-OBS", name: "越权测试科目" });
      assert.strictEqual(r.status, 403);
    });
    await check("权限闸门 · wangmin(adminHead) 编辑组织 → 403", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "wangmin", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("POST", "/api/orgs", { authorization: "Bearer " + t }, { code: "X-OBS", name: "越权组织" });
      assert.strictEqual(r.status, 403);
    });
    await check("权限闸门 · zhangmy(ceo) 查看账户 → 200", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "zhangmy", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("GET", "/api/users", { authorization: "Bearer " + t });
      assert.strictEqual(r.status, 200);
    });
    await check("权限闸门 · lijing(cooAnalyst) 编辑规则(ai-config) → 200", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "lijing", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("GET", "/api/ai-config", { authorization: "Bearer " + t });
      assert.strictEqual(r.status, 200);
    });
    await check("GET /api/workbench-overview · admin 全域 → 200 总览结构", async () => {
      const r = await req("GET", "/api/workbench-overview?months=1,2,3,4,5,6,7,8,9", { authorization: "Bearer " + token });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(typeof r.body.totalBudget, "number");
      assert.strictEqual(typeof r.body.totalExec, "number");
      assert.strictEqual(typeof r.body.remain, "number");
      assert.strictEqual(typeof r.body.execRate, "number");
      assert.ok(Array.isArray(r.body.topOverspent), "topOverspent 应为数组");
    });
    await check("GET /api/workbench-overview · zhangwei(expense) 范围受限仍 200", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "zhangwei", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("GET", "/api/workbench-overview?months=1,2,3,4,5,6,7,8,9", { authorization: "Bearer " + t });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(typeof r.body.totalBudget, "number");
    });
    if (firstId != null) {
      await check("GET /api/events/:id → 200", async () => {
        const r = await req("GET", "/api/events/" + firstId, token ? { authorization: "Bearer " + token } : {});
        assert.strictEqual(r.status, 200);
        assert.ok(typeof r.body.amount === "number");
      });
      /* 合同级断言：经 API 改写金额 → 后端月度分解必须等价于 pure-calc.decomposeMonthly
       * （验证后还原原始金额，避免污染开发库） */
      await check("PUT/GET amount → 后端月度分解符合 pure-calc 合同（验证后还原）", async () => {
        const orig = (await req("GET", "/api/events/" + firstId, token ? { authorization: "Bearer " + token } : {})).body;
        const AMT = 1234567;
        const put = await req("PUT", "/api/events/" + firstId + "/amount", token ? { authorization: "Bearer " + token } : {}, { amount: AMT });
        assert.strictEqual(put.status, 200);
        assert.strictEqual(put.body.amount, AMT);
        const exp = require("../../server/pure-calc").decomposeMonthly(AMT);
        assert.deepStrictEqual(put.body.monthly, exp);
        const restore = await req("PUT", "/api/events/" + firstId + "/amount", token ? { authorization: "Bearer " + token } : {}, { amount: orig.amount });
        assert.strictEqual(restore.status, 200);
      });
    }
  } catch (e) {
    console.log("❌ 后端 API 回归失败：server 启动/health 超时 → " + e.message);
    try { child.kill("SIGKILL"); } catch {}
    process.exit(1); /* 启动/health 失败必须如实失败，不可假装通过 */
  }

  /* ---------- 幂等迁移验证：同一 DB 重启 server，重复启动不报错且角色仍收敛 ---------- */
  try { child.kill("SIGKILL"); } catch {}
  child = spawnServer();
  try {
    await waitHealth(50);
    console.log("\n▸ 幂等迁移验证（同一 DB 重启）");
    await check("重启后 /api/health 正常", async () => {
      const r = await req("GET", "/api/health");
      assert.strictEqual(r.status, 200);
    });
    await check("重启后 /api/roles 仍 9 个角色且无旧角色", async () => {
      const lr = await req("POST", "/api/auth/login", {}, { username: "admin", password: "Admin@2026" });
      const t = lr.body.token;
      const r = await req("GET", "/api/roles", { authorization: "Bearer " + t });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.length, 9);
      const codes = r.body.map((x) => x.code);
      OBSOLETE.forEach((c) => assert.ok(!codes.includes(c)));
    });
    await check("重启后 lijing 角色映射仍正确（幂等重插）", async () => {
      const r = await req("POST", "/api/auth/login", {}, { username: "lijing", password: "Admin@2026" });
      assert.strictEqual(r.status, 200);
      const roles = (r.body.user.roles || []).map((x) => x.code).sort();
      assert.deepStrictEqual(roles, ["centerOwner", "cooAnalyst"]);
    });
  } catch (e) {
    console.log("❌ 幂等迁移验证失败 → " + e.message);
    failed++;
  }

  try { child.kill("SIGKILL"); } catch {}
  console.log("\n后端 API 回归：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
