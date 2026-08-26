/** auth module (auto-extracted from db.js) */
const crypto = require("crypto");
const organization = require("./organization");
const notifications = require("./notifications");

const DEPT_SEEDS = [
  { code: "2010-01", name: "一公司 · 综合办公室", parent: "2010" },
  { code: "2010-02", name: "一公司 · 财务部", parent: "2010" },
  { code: "2010-03", name: "一公司 · 后勤保障部", parent: "2010" },
  { code: "2020-01", name: "二公司 · 综合办公室", parent: "2020" },
  { code: "2020-02", name: "二公司 · 财务部", parent: "2020" },
  { code: "2020-03", name: "二公司 · 后勤保障部", parent: "2020" },
  { code: "2170-01", name: "三公司 · 综合办公室", parent: "2170" },
  { code: "2170-02", name: "三公司 · 财务部", parent: "2170" },
  { code: "2170-03", name: "三公司 · 后勤保障部", parent: "2170" },
  { code: "3050-01", name: "四公司 · 综合办公室", parent: "3050" },
  { code: "3050-02", name: "四公司 · 财务部", parent: "3050" },
  { code: "3050-03", name: "四公司 · 后勤保障部", parent: "3050" },
];

/* 角色字典：views = 可见视图白名单（导航）；scope = 数据范围（group 集团 / company 本公司 / center 归口 / self 本人） */

const ROLE_SEEDS = [
  { code: "admin",         name: "系统管理员",     desc: "账户 / 组织 / 角色管理，平台运维", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "all" },
  { code: "ceo",           name: "集团 CEO",       desc: "集团总额 · 压降目标 · 重大争议决策", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "group" },
  { code: "cooLead",       name: "总经办负责人",   desc: "组织审核 · 牵头协商 · 推动压降下达", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "group" },
  { code: "cooAnalyst",    name: "总经办预算管理员", desc: "预算汇总 · 对标分析 · 决算核查", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "group" },
  { code: "finance",       name: "财务经理",       desc: "预算总控 · 汇总 · 调整 · 决算", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "all" },
  { code: "buHead",        name: "事业部负责人",   desc: "事业部预算统筹 · 压降落实 · 经营线审核", views: ["wb-home", "compile", "kanban", "rules"], scope: "group" },
  { code: "legalHead",     name: "法人公司负责人", desc: "本公司预算统筹 · 审批", views: ["wb-home", "compile", "kanban", "rules"], scope: "company" },
  { code: "adminHead",     name: "行政归口负责人", desc: "归口科目管理 · 压降落实", views: ["wb-home", "compile", "kanban", "rules"], scope: "center" },
  { code: "companyBudgeter", name: "公司预算员",   desc: "本公司预算填报审核 · 汇总上报", views: ["wb-home", "compile", "kanban", "rules"], scope: "company" },
  { code: "centerOwner",   name: "职能中心归口责任人", desc: "归口科目跨公司统筹 · 编制审核", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "center" },
  { code: "manager",       name: "部门经理",       desc: "本部门编制 · 追踪 · 审批", views: ["wb-home", "compile", "kanban", "rules"], scope: "dept" },
  { code: "expense",       name: "基层费用责任岗", desc: "经济事项填报 · 月度分解 · AI 建议", views: ["wb-home", "compile", "kanban", "rules"], scope: "self" },
  { code: "staff",         name: "员工",           desc: "负责采购项目 · 发起采购 / 报销", views: ["wb-home", "compile", "kanban", "rules"], scope: "self" },
  { code: "boss",          name: "总经理",         desc: "全局决策 · 审批 · 决算（兼容旧角色）", views: ["wb-home", "compile", "kanban", "rules", "accounts", "basedata"], scope: "all" },
];

/* 示例用户：username / 统一初始密码 Admin@2026（正式部署须改密） / 姓名 / 组织 code / 角色 code 列表
 * 组织覆盖（上下级部门示例）：李静（集团财务部·上级） ↔ 王敏（一公司财务部·下级） */

const USER_SEEDS = [
  { username: "admin",     real_name: "系统管理员", org: "HQ",     roles: ["admin"] },
  { username: "zhangmy",   real_name: "张明远",     org: "HQ",     roles: ["ceo", "boss"] },
  { username: "xujing",    real_name: "徐静",       org: "COO-HQ", roles: ["cooLead"] },
  { username: "lijing",    real_name: "李静",       org: "FIN-HQ", roles: ["finance", "cooAnalyst"] },
  { username: "zhoufang",  real_name: "周芳",       org: "ADM-HQ", roles: ["centerOwner"] },
  { username: "sunyue",    real_name: "孙悦",       org: "BU-01",  roles: ["buHead"] },
  { username: "chenkai",   real_name: "陈凯",       org: "2020",   roles: ["adminHead"] },
  { username: "liuyang",   real_name: "刘洋",       org: "3050",   roles: ["companyBudgeter"] },
  { username: "wangmin",   real_name: "王敏",       org: "2010-02", roles: ["manager"] },
  { username: "zhaolei",   real_name: "赵磊",       org: "2010-03", roles: ["expense"] },
  { username: "duanwei",   real_name: "段伟",       org: "2020-03", roles: ["expense"] },
  { username: "zhangwei",  real_name: "张伟",       org: "2010-01", roles: ["staff"] },
];

const SEED_PASSWORD = "Admin@2026";

const SESSION_TTL_MS = 24 * 3600 * 1000; /* 会话有效期 24 小时 */

/* ---------- 密码哈希（scrypt：salt:hash） ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(":") < 0) return false;
  const [salt, hash] = stored.split(":");
  const calc = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(calc, "hex"), Buffer.from(hash, "hex"));
}

/* ---------- 初始化：组织三级树 + 角色 + 用户 + 会话 ---------- */

function initAuth(db) {
  /* organization 表深化：加 level 列（兼容已有表） */
  const cols = db.prepare("PRAGMA table_info(organization)").all().map((c) => c.name);
  if (!cols.includes("level")) db.exec("ALTER TABLE organization ADD COLUMN level TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS role (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT,
      views TEXT,
      scope TEXT
    );
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      real_name TEXT,
      org_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS user_role (
      user_id INTEGER NOT NULL,
      role_code TEXT NOT NULL,
      PRIMARY KEY (user_id, role_code)
    );
    CREATE TABLE IF NOT EXISTS session (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role_scope TEXT,
      org_scope TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      view TEXT,
      ref_id TEXT,
      priority TEXT DEFAULT 'normal',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  /* 角色种子 */
  if (db.prepare("SELECT COUNT(*) AS c FROM role").get().c === 0) {
    const ins = db.prepare("INSERT INTO role (code, name, desc, views, scope) VALUES (?, ?, ?, ?, ?)");
    ROLE_SEEDS.forEach((r) => ins.run(r.code, r.name, r.desc, JSON.stringify(r.views), r.scope));
  } else {
    /* 已有库增量补角色（幂等） */
    const ins = db.prepare("INSERT OR IGNORE INTO role (code, name, desc, views, scope) VALUES (?, ?, ?, ?, ?)");
    ROLE_SEEDS.forEach((r) => ins.run(r.code, r.name, r.desc, JSON.stringify(r.views), r.scope));
  }

  /* 基础数据视图迁移（幂等）：为 5 类基础数据维护角色补 basedata 视图（兼容已存在的库） */
  ["admin", "finance", "cooLead", "cooAnalyst", "centerOwner"].forEach((code) => {
    const row = db.prepare("SELECT views FROM role WHERE code = ?").get(code);
    if (row) {
      let arr = [];
      try { arr = JSON.parse(row.views || "[]"); } catch (e) {}
      if (!Array.isArray(arr)) arr = [];
      if (!arr.includes("basedata")) {
        arr.push("basedata");
        db.prepare("UPDATE role SET views = ? WHERE code = ?").run(JSON.stringify(arr), code);
      }
    }
  });

  /* 预算工作人员视图迁移（入口修复，幂等）：admin/财务/总经办/归口责任人/总经理(boss,ceo) 补 accounts 视图 */
  ["admin", "finance", "cooLead", "cooAnalyst", "centerOwner", "boss", "ceo"].forEach((code) => {
    const row = db.prepare("SELECT views FROM role WHERE code = ?").get(code);
    if (row) {
      let arr = [];
      try { arr = JSON.parse(row.views || "[]"); } catch (e) {}
      if (!Array.isArray(arr)) arr = [];
      if (!arr.includes("accounts")) {
        arr.push("accounts");
        db.prepare("UPDATE role SET views = ? WHERE code = ?").run(JSON.stringify(arr), code);
      }
    }
  });

  /* 导航顺序迁移（D4，幂等）：admin 视图中确保「组织架构(org)」在「预算工作人员(accounts)」之前 —— 已废弃（org 菜单已移除），保留空操作免误改旧库 */
  {
    const row = db.prepare("SELECT views FROM role WHERE code = 'admin'").get();
    if (row) {
      let arr = [];
      try { arr = JSON.parse(row.views || "[]"); } catch (e) {}
      if (!Array.isArray(arr)) arr = [];
      /* 不再重排 org/accounts，交由下方移除 org 迁移统一处理 */
      void arr;
    }
  }

  /* 移除组织架构菜单（2026-08-24，幂等）：从所有角色 views 白名单剔除 "org"，菜单栏不再显示「组织架构」；
   * 架构图仍保留在「基础数据」页第 3 个 Tab（可编辑，admin/总经办）；员工不再有独立入口。 */
  {
    const rows = db.prepare("SELECT code, views FROM role").all();
    rows.forEach((r) => {
      let arr = [];
      try { arr = JSON.parse(r.views || "[]"); } catch (e) {}
      if (!Array.isArray(arr)) arr = [];
      if (arr.includes("org")) {
        arr = arr.filter((v) => v !== "org");
        db.prepare("UPDATE role SET views = ? WHERE code = ?").run(JSON.stringify(arr), r.code);
      }
    });
  }

  /* 部门 / 事业部 / 职能中心等组织节点由 scripts/import_excel_data.py 全量导入，此处不再硬编码插入 */

  /* 事业部 / 集团职能中心节点由导入脚本全量导入，此处不再硬编码迁移 */

  /* 用户组织归属由 scripts/import_excel_data.py 重映射，此处不再硬编码修正 */

  /* 角色迁移（幂等）：孙悦 → 事业部负责人（buHead），移除旧 legalHead */
  db.prepare("DELETE FROM user_role WHERE role_code = 'legalHead' AND user_id = (SELECT id FROM user WHERE username = 'sunyue')").run();
  db.prepare("INSERT OR IGNORE INTO user_role (user_id, role_code) SELECT id, 'buHead' FROM user WHERE username = 'sunyue'").run();

  /* 组织扩展迁移（D1）：加 type / managed_center_id 列 + 回填 type + 种子 11 管理中心 */
  organization.migrateOrgTypeAndCenters(db);

  /* 修正历史 seed 用户组织归属（2026-08-25）：sunyue(buHead) 旧 org=BU-ADM 不存在，改挂真实 BU-01 */
  {
    const bu01 = db.prepare("SELECT id FROM organization WHERE code = 'BU-01'").get();
    const su = db.prepare("SELECT id, org_id FROM user WHERE username = 'sunyue'").get();
    if (bu01 && su && (su.org_id == null || db.prepare("SELECT code FROM organization WHERE id = ?").get(su.org_id) == null)) {
      db.prepare("UPDATE user SET org_id = ? WHERE id = ?").run(bu01.id, su.id);
    }
  }

  /* 用户 + 角色关联种子 */
  if (db.prepare("SELECT COUNT(*) AS c FROM user").get().c === 0) {
    const insUser = db.prepare("INSERT INTO user (username, password, real_name, org_id, active) VALUES (?, ?, ?, ?, 1)");
    const insRel = db.prepare("INSERT INTO user_role (user_id, role_code) VALUES (?, ?)");
    USER_SEEDS.forEach((u) => {
      const org = db.prepare("SELECT id FROM organization WHERE code = ?").get(u.org);
      const r = insUser.run(u.username, hashPassword(SEED_PASSWORD), u.real_name, org ? org.id : null);
      u.roles.forEach((rc) => insRel.run(r.lastInsertRowid, rc));
    });
  }

  /* 消息推送模块种子（骨架 + 演示各类消息，幂等） */
  notifications.seedNotifications(db);
}

/* ---------- 组织扩展迁移（D1）：type / managed_center_id + 11 管理中心种子 ---------- */
/* organization 原有列 level（group/company/dept）。本次新增业务分类 type：
 *   group=总部 / unit=二级单位(原 level=company) / dept=三级部门(原 level=dept) / center=管理中心
 * managed_center_id：unit/dept 归属的管理中心 id（一对多，1 中心管 N 部门）。 */

function loginUser(db, username, password) {
  const row = db.prepare("SELECT * FROM user WHERE username = ? AND active = 1").get(username);
  if (!row || !verifyPassword(password, row.password)) return { error: "用户名或密码错误" };
  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = Date.now() + SESSION_TTL_MS;
  db.prepare("INSERT INTO session (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, row.id, expires);
  return { token, user: userToDto(db, row) };
}

function userToDto(db, row) {
  const roles = db.prepare("SELECT r.code, r.name, r.desc, r.views, r.scope FROM role r JOIN user_role ur ON ur.role_code = r.code WHERE ur.user_id = ? ORDER BY ur.rowid").all(row.id)
    .map((r) => ({ code: r.code, name: r.name, desc: r.desc, views: r.views ? JSON.parse(r.views) : [], scope: r.scope }));
  const org = row.org_id ? db.prepare("SELECT id, code, name, parent_id, level FROM organization WHERE id = ?").get(row.org_id) : null;
  return {
    id: row.id, username: row.username, realName: row.real_name,
    active: row.active, org, roles,
  };
}

function getUserByToken(db, token) {
  if (!token) return null;
  const s = db.prepare("SELECT * FROM session WHERE token = ?").get(token);
  if (!s) return null;
  if (Date.now() > s.expires_at) {
    db.prepare("DELETE FROM session WHERE token = ?").run(token);
    return null;
  }
  const row = db.prepare("SELECT * FROM user WHERE id = ? AND active = 1").get(s.user_id);
  if (!row) return null;
  return userToDto(db, row);
}

function logoutSession(db, token) {
  if (!token) return;
  db.prepare("DELETE FROM session WHERE token = ?").run(token);
}

function listRoles(db) {
  return ROLE_SEEDS.map((r) => ({ code: r.code, name: r.name, desc: r.desc, views: r.views, scope: r.scope }));
}

/* ---------- 组织树 ---------- */

function listOrgUsers(db, orgId) {
  const rows = db.prepare("SELECT * FROM user WHERE org_id = ? AND active = 1 ORDER BY id").all(orgId);
  return rows.map((r) => userToDto(db, r));
}

/* ---------- 用户管理（admin） ---------- */

function listUsers(db) {
  const rows = db.prepare("SELECT * FROM user ORDER BY id").all();
  return rows.map((r) => userToDto(db, r));
}

function createUser(db, { username, password, realName, orgId, roleCodes, active }) {
  if (!username || !password) return { error: "缺少用户名或密码" };
  if (db.prepare("SELECT id FROM user WHERE username = ?").get(username)) return { error: "用户名已存在" };
  const org = orgId ? db.prepare("SELECT id FROM organization WHERE id = ?").get(orgId) : null;
  const r = db.prepare("INSERT INTO user (username, password, real_name, org_id, active) VALUES (?, ?, ?, ?, ?)")
    .run(username, hashPassword(password), realName || username, org ? org.id : null, active === false ? 0 : 1);
  const uid = r.lastInsertRowid;
  (roleCodes || []).forEach((rc) => db.prepare("INSERT INTO user_role (user_id, role_code) VALUES (?, ?)").run(uid, rc));
  return userToDto(db, db.prepare("SELECT * FROM user WHERE id = ?").get(uid));
}

function updateUser(db, id, { realName, orgId, roleCodes, active, password }) {
  const row = db.prepare("SELECT * FROM user WHERE id = ?").get(id);
  if (!row) return null;
  if (realName != null) db.prepare("UPDATE user SET real_name = ? WHERE id = ?").run(String(realName), id);
  if (orgId != null) db.prepare("UPDATE user SET org_id = ? WHERE id = ?").run(orgId ? Number(orgId) : null, id);
  if (active != null) db.prepare("UPDATE user SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
  if (password) db.prepare("UPDATE user SET password = ? WHERE id = ?").run(hashPassword(password), id);
  if (Array.isArray(roleCodes)) {
    db.prepare("DELETE FROM user_role WHERE user_id = ?").run(id);
    roleCodes.forEach((rc) => db.prepare("INSERT INTO user_role (user_id, role_code) VALUES (?, ?)").run(id, rc));
  }
  return userToDto(db, db.prepare("SELECT * FROM user WHERE id = ?").get(id));
}

/* ================================================================
 * 消息推送模块（2026-08-24 D2：按角色 / 范围只推相关）
 *  - notification：广播（role_scope）+ 个人定向（user_id）两类
 *  - 可见性约束：基层角色（expense/staff）不可见 type ∈ {org, account, summary}
 * ================================================================ */

module.exports = {
  DEPT_SEEDS,
  ROLE_SEEDS,
  SEED_PASSWORD,
  SESSION_TTL_MS,
  USER_SEEDS,
  createUser,
  getUserByToken,
  hashPassword,
  initAuth,
  listOrgUsers,
  listRoles,
  listUsers,
  loginUser,
  logoutSession,
  updateUser,
  userToDto,
  verifyPassword,
};
