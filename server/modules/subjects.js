/** subjects module (auto-extracted from db.js) */
const { decomposeMonthly } = require("../pure-calc");

function rowToSubject(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    cat: row.cat,
    center: row.center,
    method: row.method,
    controlLogic: row.control_logic,
    parentId: row.parent_id != null ? row.parent_id : null,
    sortNo: row.sort_no,
  };
}

/* 幂等迁移：从 economic_event.acct_code 去重生成 account_subject，并回填 subject_id */

function migrateSubjects(db) {
  const cnt = db.prepare("SELECT COUNT(*) AS c FROM account_subject").get().c;
  if (cnt > 0) return; // 已迁移过，不重复
  const rows = db.prepare(
    "SELECT acct_code, MAX(center) AS center, MAX(method) AS method FROM economic_event WHERE acct_code IS NOT NULL AND acct_code != '' GROUP BY acct_code ORDER BY acct_code"
  ).all();
  const ins = db.prepare(
    "INSERT INTO account_subject (code, name, cat, center, method, control_logic, sort_no) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  rows.forEach((r, i) => {
    ins.run(r.acct_code, r.acct_code, r.acct_code, r.center, r.method, "", i);
  });
  // 回填 subject_id
  const subs = db.prepare("SELECT id, code FROM account_subject").all();
  const map = {};
  subs.forEach((s) => (map[s.code] = s.id));
  const evs = db.prepare("SELECT id, acct_code FROM economic_event").all();
  const upd = db.prepare("UPDATE economic_event SET subject_id = ? WHERE id = ?");
  evs.forEach((e) => {
    if (e.acct_code && map[e.acct_code] != null) upd.run(map[e.acct_code], e.id);
  });
}

/* ---------- 会计科目 CRUD ---------- */

function listSubjects(db, opts) {
  opts = opts || {};
  let sql = "SELECT * FROM account_subject WHERE 1=1";
  const params = [];
  if (opts.center) { sql += " AND center = ?"; params.push(opts.center); }
  if (opts.method) { sql += " AND method = ?"; params.push(opts.method); }
  sql += " ORDER BY sort_no, code";
  return db.prepare(sql).all(...params).map(rowToSubject);
}

function getSubject(db, id) {
  return rowToSubject(db.prepare("SELECT * FROM account_subject WHERE id = ?").get(id));
}

function createSubject(db, body) {
  const code = String(body.code || "").trim();
  if (!code) return { error: "科目编码不能为空" };
  const dup = db.prepare("SELECT id FROM account_subject WHERE code = ?").get(code);
  if (dup) return { error: "科目编码已存在" };
  const info = {
    name: String(body.name || code).trim(),
    cat: String(body.cat || "").trim(),
    center: body.center ? String(body.center).trim() : null,
    method: body.method ? String(body.method).trim() : null,
    controlLogic: body.controlLogic ? String(body.controlLogic).trim() : "",
    sortNo: Number.isFinite(body.sortNo) ? Number(body.sortNo) : 0,
  };
  const r = db.prepare(
    "INSERT INTO account_subject (code, name, cat, center, method, control_logic, sort_no) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(code, info.name, info.cat, info.center, info.method, info.controlLogic, info.sortNo);
  return getSubject(db, r.lastInsertRowid);
}

function updateSubject(db, id, body) {
  const cur = getSubject(db, id);
  if (!cur) return null;
  const code = body.code != null ? String(body.code).trim() : cur.code;
  if (code !== cur.code) {
    const dup = db.prepare("SELECT id FROM account_subject WHERE code = ? AND id != ?").get(code, id);
    if (dup) return { error: "科目编码已存在" };
  }
  const name = body.name != null ? String(body.name).trim() : cur.name;
  const cat = body.cat != null ? String(body.cat).trim() : cur.cat;
  const center = body.center !== undefined ? (body.center ? String(body.center).trim() : null) : cur.center;
  const method = body.method !== undefined ? (body.method ? String(body.method).trim() : null) : cur.method;
  const controlLogic = body.controlLogic !== undefined ? String(body.controlLogic).trim() : cur.controlLogic;
  const sortNo = body.sortNo !== undefined && Number.isFinite(body.sortNo) ? Number(body.sortNo) : cur.sortNo;
  db.prepare(
    "UPDATE account_subject SET code=?, name=?, cat=?, center=?, method=?, control_logic=?, sort_no=? WHERE id=?"
  ).run(code, name, cat, center, method, controlLogic, sortNo, id);
  return getSubject(db, id);
}

function deleteSubject(db, id) {
  const cur = getSubject(db, id);
  if (!cur) return { error: "未找到科目" };
  const ref = db.prepare("SELECT COUNT(*) AS c FROM economic_event WHERE subject_id = ?").get(id);
  if (ref && ref.c > 0) return { error: "该科目下仍有 " + ref.c + " 条经济事项引用，无法删除（请先迁移或删除相关事项）" };
  db.prepare("DELETE FROM account_subject WHERE id = ?").run(id);
  return { ok: true, id };
}

/* ---------- 经济事项 CRUD（本体增删改） ---------- */

module.exports = {
  createSubject,
  deleteSubject,
  getSubject,
  listSubjects,
  migrateSubjects,
  rowToSubject,
  updateSubject,
};
