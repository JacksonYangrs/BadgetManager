/** budget-execution module (auto-extracted from db.js) */


function initExecutions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS budget_execution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    cat TEXT NOT NULL,
    month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
    amount INTEGER NOT NULL DEFAULT 0,
    UNIQUE(org_id, cat, month)
  );`);
}

/* 幂等种子：仅当 budget_execution 为空时生成（不覆盖真实导入的数据） */

function seedExecutions(db) {
  const cnt = db.prepare("SELECT COUNT(*) AS c FROM budget_execution").get().c;
  if (cnt > 0) return cnt;
  const rows = db.prepare("SELECT org_id, cat, last_year, monthly FROM unit_budget WHERE last_year IS NOT NULL AND last_year != 0").all();
  const ins = db.prepare("INSERT OR IGNORE INTO budget_execution (org_id, cat, month, amount) VALUES (?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    rows.forEach((r) => {
      let ratio = [];
      try { ratio = r.monthly ? JSON.parse(r.monthly) : []; } catch (e) { ratio = []; }
      const sum = ratio.reduce((a, b) => a + (Number(b) || 0), 0);
      for (let m = 1; m <= 12; m++) {
        let amt;
        if (sum > 0) amt = Math.round((r.last_year * (Number(ratio[m - 1]) || 0)) / sum);
        else amt = Math.round(r.last_year / 12);
        ins.run(r.org_id, r.cat, m, amt);
      }
    });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return db.prepare("SELECT COUNT(*) AS c FROM budget_execution").get().c;
}

/* 查询某组织（含其全部事项）指定月份的逐月执行；months 为空返回全部 12 月 */

function listExecutions(db, { orgId, months } = {}) {
  let sql = "SELECT org_id, cat, month, amount FROM budget_execution WHERE 1=1";
  const args = [];
  if (orgId != null) { sql += " AND org_id = ?"; args.push(orgId); }
  if (months && months.length) { sql += " AND month IN (" + months.map(() => "?").join(",") + ")"; months.forEach((m) => args.push(m)); }
  sql += " ORDER BY org_id, cat, month";
  return db.prepare(sql).all(...args);
}

/* 单点 upsert（财务 Excel 导入 / 手动修正真实执行） */

function upsertExecution(db, orgId, cat, month, amount) {
  const ex = db.prepare("SELECT id FROM budget_execution WHERE org_id = ? AND cat = ? AND month = ?").get(orgId, cat, month);
  if (ex) db.prepare("UPDATE budget_execution SET amount = ? WHERE id = ?").run(Math.round(Number(amount) || 0), ex.id);
  else db.prepare("INSERT INTO budget_execution (org_id, cat, month, amount) VALUES (?, ?, ?, ?)").run(orgId, cat, month, Math.round(Number(amount) || 0));
  return db.prepare("SELECT * FROM budget_execution WHERE org_id = ? AND cat = ? AND month = ?").get(orgId, cat, month);
}

/* ================================================================
 * 组织架构 + 用户账户 + 角色系统（2026-08-23 模块三 · 正式客户项目基础模块）
 *  - organization：三级组织树（集团 HQ → 二级单位 → 三级部门），level 标识层级
 *  - role：角色字典 + 视图白名单（views JSON）+ 数据范围（scope）
 *  - user：用户账户（scrypt 密码哈希，不存明文）
 *  - user_role：用户-角色多对多（一人可多角色）
 *  - session：登录会话（token，带过期时间，持久化 DB 重启不失效）
 * ================================================================ */

/* ---------- 组织三级树种子（在现有 HQ+4 单位基础上深化到部门层） ---------- */

module.exports = {
  initExecutions,
  listExecutions,
  seedExecutions,
  upsertExecution,
};
