/* ================================================================
 * role-migration.test.cjs — 角色收敛幂等迁移回归（集成测试）
 * 运行：node --experimental-sqlite tests/integration/role-migration.test.cjs
 * 目的：验证 T1「角色模型收敛」的迁移路径——已存在库（含 5 个旧角色）在
 *       首次启动时平滑迁移（删旧 user_role 关联 + 重插映射 + 删旧 role 行），
 *       且重复启动幂等（不报错、不重复、不误删用户）。
 * 隔离：使用临时 DB_FILE，不污染开发库。
 * ================================================================ */
const path = require("path");
const os = require("os");

/* 必须在 require db.js 之前设置 DB_FILE（db.js 在模块加载时读取该环境变量） */
process.env.DB_FILE = path.join(os.tmpdir(), "badget-migration-" + Date.now() + ".db");

const dbm = require(path.resolve(__dirname, "../../server/db"));

const OBSOLETE = ["boss", "finance", "staff", "manager", "buHead"];
const STANDARD = ["admin", "ceo", "cooLead", "cooAnalyst", "legalHead", "adminHead", "companyBudgeter", "centerOwner", "expense"];

/* 旧库用户（收敛前，含 5 个旧角色映射） */
const OLD_USERS = [
  { username: "admin", roles: ["admin"] },
  { username: "zhangmy", roles: ["ceo", "boss"] },
  { username: "xujing", roles: ["cooLead"] },
  { username: "lijing", roles: ["finance", "cooAnalyst"] },
  { username: "zhoufang", roles: ["centerOwner"] },
  { username: "sunyue", roles: ["buHead"] },
  { username: "chenkai", roles: ["adminHead"] },
  { username: "liuyang", roles: ["companyBudgeter"] },
  { username: "wangmin", roles: ["manager"] },
  { username: "zhaolei", roles: ["expense"] },
  { username: "duanwei", roles: ["expense"] },
  { username: "zhangwei", roles: ["staff"] },
];

const ROLE_REMAP = {
  zhangmy: ["ceo"],
  lijing: ["cooAnalyst", "centerOwner"],
  zhangwei: ["expense"],
  wangmin: ["adminHead"],
  sunyue: ["cooAnalyst"],
};

let passed = 0, failed = 0;
const assert = require("assert");
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + " → " + e.message); }
}

(async () => {
  const db = dbm.init();
  dbm.initUnits(db); /* organization 表 + HQ 兜底（initAuth 依赖 organization.migrateOrgTypeAndCenters） */

  /* 预建 role / user / user_role 表（与 initAuth 同构），以便先构造旧库状态 */
  db.exec(`
    CREATE TABLE IF NOT EXISTS role (
      code TEXT PRIMARY KEY, name TEXT NOT NULL, desc TEXT, views TEXT, scope TEXT
    );
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, real_name TEXT,
      org_id INTEGER, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS user_role (
      user_id INTEGER NOT NULL, role_code TEXT NOT NULL,
      PRIMARY KEY (user_id, role_code)
    );
  `);

  /* 构造旧库状态：只预置 5 个旧角色 + 12 个用户 + 旧角色关联（标准角色由 initAuth seed 补齐） */
  const insRole = db.prepare("INSERT OR IGNORE INTO role (code, name, desc, views, scope) VALUES (?, ?, ?, ?, ?)");
  OBSOLETE.forEach((c) => insRole.run(c, "旧角色-" + c, "demo 冗余角色", "[]", "all"));

  const insUser = db.prepare("INSERT INTO user (username, password, real_name, org_id, active) VALUES (?, 'x', ?, NULL, 1)");
  const insRel = db.prepare("INSERT INTO user_role (user_id, role_code) VALUES (?, ?)");
  OLD_USERS.forEach((u) => {
    const r = insUser.run(u.username, u.username);
    u.roles.forEach((rc) => insRel.run(r.lastInsertRowid, rc));
  });

  console.log("▸ 角色收敛幂等迁移回归（旧库 → 迁移）");

  /* 第一次 initAuth：触发迁移 */
  await check("首次 initAuth 不报错（旧库迁移）", () => {
    dbm.initAuth(db);
  });

  await check("迁移后 role 表无 5 个旧角色", () => {
    const codes = db.prepare("SELECT code FROM role").all().map((r) => r.code);
    OBSOLETE.forEach((c) => assert.ok(!codes.includes(c), "仍含旧角色 " + c));
  });

  await check("迁移后 role 表恰为 9 个标准角色", () => {
    const codes = db.prepare("SELECT code FROM role").all().map((r) => r.code).sort();
    assert.deepStrictEqual(codes, STANDARD.slice().sort());
  });

  await check("迁移后 user 表未被误删（仍 12 个用户）", () => {
    assert.strictEqual(db.prepare("SELECT COUNT(*) AS c FROM user").get().c, OLD_USERS.length);
  });

  await check("迁移后 user_role 无旧角色关联", () => {
    const n = db.prepare("SELECT COUNT(*) AS c FROM user_role WHERE role_code IN ('boss','finance','staff','manager','buHead')").get().c;
    assert.strictEqual(n, 0);
  });

  for (const [un, exp] of Object.entries(ROLE_REMAP)) {
    await check(`迁移后 ${un} 角色 = ${JSON.stringify(exp)}`, () => {
      const rows = db.prepare(
        "SELECT r.code FROM user_role ur JOIN user u ON u.id = ur.user_id JOIN role r ON r.code = ur.role_code WHERE u.username = ?"
      ).all(un).map((x) => x.code).sort();
      assert.deepStrictEqual(rows, exp.slice().sort());
    });
  }

  /* 第二次 initAuth：幂等验证 */
  await check("第二次 initAuth 不报错（幂等）", () => {
    dbm.initAuth(db);
  });

  await check("二次迁移后 role 表仍 9 个标准角色", () => {
    const codes = db.prepare("SELECT code FROM role").all().map((r) => r.code).sort();
    assert.deepStrictEqual(codes, STANDARD.slice().sort());
  });

  await check("二次迁移后 lijing 无重复角色关联", () => {
    const n = db.prepare("SELECT COUNT(*) AS c FROM user_role ur JOIN user u ON u.id = ur.user_id WHERE u.username = 'lijing'").get().c;
    assert.strictEqual(n, ROLE_REMAP.lijing.length);
  });

  console.log("\n角色收敛幂等迁移回归：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
