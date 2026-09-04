/** subjects module (auto-extracted from db.js) */
const { decomposeMonthly } = require("../pure-calc");
const fs = require("fs");
const path = require("path");

/* 4 级分类树 seed 数据（由 scripts/extract_subject_tree.py 从 2 个 Excel 一次性抽取产出） */
const SEED_FILE = path.join(__dirname, "..", "seeds", "subject-tree.json");

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
    level: row.level != null ? row.level : null,
    path: row.path != null ? row.path : null,
    sortNo: row.sort_no,
  };
}

/* 幂等清理：删除旧平铺科目（code 纯数字 = M6 费控会计科目）及其挂载的旧经济事项。
 * 这些过渡数据已被 seedSubjectTree(146 树) + seedEventLeaves(300 叶子) 替代。 */
function migrateSubjects(db) {
  const oldSubjects = db.prepare("SELECT id FROM account_subject WHERE code GLOB '[0-9]*'").all();
  let removedEvents = 0;
  const delEv = db.prepare("DELETE FROM economic_event WHERE subject_id = ?");
  const delSub = db.prepare("DELETE FROM account_subject WHERE id = ?");
  for (const s of oldSubjects) {
    removedEvents += delEv.run(s.id).changes;
    delSub.run(s.id);
  }
  return { ok: true, removedSubjects: oldSubjects.length, removedEvents };
}

/* 幂等 seed：把 4 级分类树写入 account_subject（建 parent_id/level/path 关系）。可重复执行不重复插入。 */
function seedSubjectTree(db) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
  } catch (e) {
    return { error: "seed 文件缺失或非法: " + SEED_FILE };
  }
  const subjects = data.subjects || [];
  if (!subjects.length) return { error: "seed subjects 为空" };

  const ins = db.prepare(
    "INSERT OR IGNORE INTO account_subject (code, name, cat, center, method, control_logic, level, path, sort_no, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)"
  );
  let inserted = 0;
  subjects.forEach((s) => {
    const r = ins.run(
      s.path, s.name, s.cat || "", s.center || null, null, s.controlLogic || "", s.level, s.path, s.sortNo
    );
    if (r.changes) inserted++;
  });

  // 回填 parent_id（依赖先插入的子节点 id）
  const upd = db.prepare(
    "UPDATE account_subject SET parent_id = (SELECT id FROM account_subject WHERE code = ?) WHERE code = ? AND parent_id IS NULL"
  );
  subjects.forEach((s) => {
    if (s.parentPath) upd.run(s.parentPath, s.path);
  });

  return { ok: true, subjects: subjects.length, inserted };
}

/* ---------- 会计科目 CRUD ---------- */

function listSubjects(db, opts) {
  opts = opts || {};
  let sql = "SELECT * FROM account_subject WHERE 1=1";
  const params = [];
  if (opts.center) { sql += " AND center = ?"; params.push(opts.center); }
  if (opts.method) { sql += " AND method = ?"; params.push(opts.method); }
  if (opts.level) { sql += " AND level = ?"; params.push(opts.level); }
  sql += " ORDER BY sort_no, code";
  return db.prepare(sql).all(...params).map(rowToSubject);
}

function getSubject(db, id) {
  return rowToSubject(db.prepare("SELECT * FROM account_subject WHERE id = ?").get(id));
}

/* 树结构：按 parent_id 组装嵌套 children（供 /api/subjects?tree=1） */
function buildSubjectTree(db) {
  const rows = db.prepare("SELECT * FROM account_subject ORDER BY sort_no, code").all();
  const map = {};
  rows.forEach((r) => {
    const n = rowToSubject(r);
    map[n.id] = Object.assign({}, n, { children: [] });
  });
  const roots = [];
  rows.forEach((r) => {
    const n = map[r.id];
    if (n.parentId != null && map[n.parentId]) map[n.parentId].children.push(n);
    else roots.push(n);
  });
  return roots;
}

/* 环检测：ancestorId 是否为 nodeId 的祖先（含自身），与 organization.isOrgAncestor 同语义 */
function isSubjectAncestor(db, ancestorId, nodeId) {
  const seen = new Set();
  let cur = getSubject(db, nodeId);
  while (cur && cur.parentId != null) {
    if (seen.has(cur.id)) break; // 环保护
    seen.add(cur.id);
    if (cur.parentId === ancestorId) return true;
    cur = getSubject(db, cur.parentId);
  }
  return false;
}

function createSubject(db, body) {
  const code = String(body.code || "").trim();
  if (!code) return { error: "科目编码不能为空" };
  const name = String(body.name || code).trim();
  const dup = db.prepare("SELECT id FROM account_subject WHERE code = ?").get(code);
  if (dup) return { error: "科目编码已存在" };

  let parentId = body.parentId != null ? Number(body.parentId) : null;
  let level = 1;
  let pathVal = name;
  if (parentId != null) {
    const parent = getSubject(db, parentId);
    if (!parent) return { error: "上级科目不存在" };
    level = (parent.level || 1) + 1;
    pathVal = (parent.path || parent.name) + "/" + name;
  }
  if (body.level != null) level = Number(body.level);
  if (body.path != null) pathVal = String(body.path).trim();

  const info = {
    name,
    cat: String(body.cat || "").trim(),
    center: body.center ? String(body.center).trim() : null,
    method: body.method ? String(body.method).trim() : null,
    controlLogic: body.controlLogic ? String(body.controlLogic).trim() : "",
    sortNo: Number.isFinite(body.sortNo) ? Number(body.sortNo) : 0,
  };
  const r = db.prepare(
    "INSERT INTO account_subject (code, name, cat, center, method, control_logic, sort_no, parent_id, level, path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(code, info.name, info.cat, info.center, info.method, info.controlLogic, info.sortNo, parentId, level, pathVal);
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

  /* parentId / level / path：改父级时重算层级；支持显式覆盖 */
  let parentId = cur.parentId;
  if (body.parentId !== undefined) {
    parentId = body.parentId != null ? Number(body.parentId) : null;
    if (parentId != null) {
      if (parentId === id) return { error: "上级科目不能是自身" };
      if (isSubjectAncestor(db, id, parentId)) return { error: "不能挂到自身下级之下（会形成环）" };
      if (!getSubject(db, parentId)) return { error: "上级科目不存在" };
    }
  }
  let level = cur.level;
  let pathVal = cur.path;
  if (parentId != null) {
    const p = getSubject(db, parentId);
    level = (p.level || 1) + 1;
    pathVal = (p.path || p.name) + "/" + name;
  } else if (body.parentId !== undefined) {
    level = 1;
    pathVal = name;
  }
  if (body.level != null) level = Number(body.level);
  if (body.path != null) pathVal = String(body.path).trim();

  db.prepare(
    "UPDATE account_subject SET code=?, name=?, cat=?, center=?, method=?, control_logic=?, sort_no=?, parent_id=?, level=?, path=? WHERE id=?"
  ).run(code, name, cat, center, method, controlLogic, sortNo, parentId, level, pathVal, id);
  return getSubject(db, id);
}

function deleteSubject(db, id) {
  const cur = getSubject(db, id);
  if (!cur) return { error: "未找到科目" };
  const ref = db.prepare("SELECT COUNT(*) AS c FROM economic_event WHERE subject_id = ?").get(id);
  if (ref && ref.c > 0) return { error: "该科目下仍有 " + ref.c + " 条经济事项引用，无法删除（请先迁移或删除相关事项）" };
  const child = db.prepare("SELECT COUNT(*) AS c FROM account_subject WHERE parent_id = ?").get(id);
  if (child && child.c > 0) return { error: "该科目下仍有 " + child.c + " 个子科目，无法删除（请先删除子科目）" };
  db.prepare("DELETE FROM account_subject WHERE id = ?").run(id);
  return { ok: true, id };
}

/* ---------- 经济事项 CRUD（本体增删改） ---------- */

module.exports = {
  buildSubjectTree,
  createSubject,
  deleteSubject,
  getSubject,
  isSubjectAncestor,
  listSubjects,
  migrateSubjects,
  rowToSubject,
  seedSubjectTree,
  updateSubject,
};
