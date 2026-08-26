/** rules module (auto-extracted from db.js) */
const { compileBaseline: pureCompileBaseline, aiSuggestion: pureAiSuggestion } = require("../pure-rule");
function getRuleFactors() { return RULE_FACTORS; }

let RULE_FACTORS = null; /* 由 loadActiveFactors 加载，发布新版本后刷新 */

function loadActiveFactors(db) {
  const row = db.prepare("SELECT id FROM budget_rule_version WHERE status = 'active' LIMIT 1").get();
  if (!row) { RULE_FACTORS = null; return; }
  const rows = db.prepare("SELECT scope_key, factor FROM budget_rule_item WHERE version_id = ? AND category = 'baseline' AND scope_type = 'type'").all(row.id);
  const m = {};
  rows.forEach((r) => { m[r.scope_key] = r.factor; });
  RULE_FACTORS = m;
}

/* 控制基线：按上级定义方法（转发 pure-rule，注入 DB 驱动的 RULE_FACTORS；无版本时回退 HARDCODED_FACTORS） */

function compileBaseline(method, type, lastYear) {
  return pureCompileBaseline(method, type, lastYear, RULE_FACTORS);
}

/* AI 建议：lo/hi/mid + 依据（与前端 BM.aiSuggestion 一致；转发 pure-rule） */

function migrateRuleVersions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_rule_version (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT UNIQUE NOT NULL,
      name TEXT,
      source_type TEXT,
      source_ref TEXT,
      effective_date TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      created_by TEXT,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS budget_rule_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      scope_type TEXT,
      scope_key TEXT,
      method TEXT,
      factor REAL,
      value TEXT,
      base_logic TEXT,
      raw TEXT
    );
    CREATE TABLE IF NOT EXISTS rule_item_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER NOT NULL,
      scope_key TEXT NOT NULL,
      subject_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_event ON rule_item_event(version_id, scope_key, subject_id);
    CREATE TABLE IF NOT EXISTS policy_document (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id INTEGER,
      filename   TEXT,
      text       TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
  if (db.prepare("SELECT COUNT(*) AS c FROM budget_rule_version").get().c > 0) return;
  const insV = db.prepare(
    "INSERT INTO budget_rule_version (version, name, source_type, status, created_by, note) VALUES (?, ?, 'manual', 'active', 'system', ?)"
  );
  const vId = insV.run(
    "v2026.0", "2026 基准预算规则（初始版）",
    "初始版本：固化 down5/canteen/dorm/revenue/green/actual 下降比例与财务流程规则（由 applyRuleBase 映射迁移）"
  ).lastInsertRowid;
  const insI = db.prepare(
    "INSERT INTO budget_rule_item (version_id, category, scope_type, scope_key, method, factor, value, base_logic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const BASE = [
    ["down5", 0.95, "较2025实际下降5%"], ["canteen", 0.97, "较2025实际下降3%"],
    ["dorm", 0.90, "较2025实际下降10%"], ["revenue", 0.98, "较2025实际下降2%"],
    ["green", 0.92, "较2025实际下降8%"], ["actual", 1.00, "据实申报"],
    ["volume", 0.98, "按业务量"], ["qtyPrice", 0.92, "量价联动"],
    ["history", 1.00, "历史持平"], ["manual", 1.00, "手工核定"],
  ];
  BASE.forEach(([k, f, l]) => insI.run(vId, "baseline", "type", k, "manageStd", f, null, l));
  const FLOW = [
    ["planMode", "bottomup", "自下而上编制"], ["trackMode", "reimburse", "实际报销入账追踪"],
    ["surplusAction", "reclaim", "期末结余收回"], ["allowOverBudget", "false", "不允许超预算（拦截+追加流程）"],
  ];
  FLOW.forEach(([k, val, l]) => insI.run(vId, "flow", "global", k, null, null, val, l));
  console.log("[seed] budget_rule_version 初始版本 v2026.0 写入（" + (BASE.length + FLOW.length) + " 条规则）");
}

function ruleItemToDto(r) {
  return {
    id: r.id, versionId: r.version_id, category: r.category, scopeType: r.scope_type,
    scopeKey: r.scope_key, method: r.method, factor: r.factor, value: r.value,
    baseLogic: r.base_logic, raw: r.raw,
  };
}

function ruleVersionToDto(db, v) {
  return {
    id: v.id, version: v.version, name: v.name, sourceType: v.source_type, sourceRef: v.source_ref,
    effectiveDate: v.effective_date, status: v.status, createdAt: v.created_at, createdBy: v.created_by, note: v.note,
    items: db.prepare("SELECT * FROM budget_rule_item WHERE version_id = ? ORDER BY id").all(v.id).map(ruleItemToDto),
  };
}

function listRuleVersions(db) {
  const rows = db.prepare("SELECT * FROM budget_rule_version ORDER BY id DESC").all();
  return rows.map((v) => ruleVersionToDto(db, v));
}

function activeRuleVersionId(db) {
  const r = db.prepare("SELECT id FROM budget_rule_version WHERE status = 'active' LIMIT 1").get();
  return r ? r.id : null;
}

function nextVersionLabel(db, year) {
  year = year || new Date().getFullYear();
  const rows = db.prepare("SELECT version FROM budget_rule_version WHERE version LIKE ?").all("v" + year + ".%");
  let max = -1;
  rows.forEach((r) => { const mm = new RegExp("^v" + year + "\\.(\\d+)$").exec(r.version); if (mm) max = Math.max(max, parseInt(mm[1], 10)); });
  return "v" + year + "." + (max + 1);
}

function cloneRuleVersion(db, body) {
  const cur = activeRuleVersionId(db);
  if (!cur) return { error: "无 active 版本可克隆" };
  const cv = db.prepare("SELECT * FROM budget_rule_version WHERE id = ?").get(cur);
  const year = (body && body.year) || new Date().getFullYear();
  const label = nextVersionLabel(db, year);
  const name = (body && body.name) || ("基于 " + cv.version + " 的新版本（草稿）");
  const vId = db.prepare(
    "INSERT INTO budget_rule_version (version, name, source_type, status, created_by, note) VALUES (?, ?, 'manual', 'draft', 'system', ?)"
  ).run(label, name, (body && body.note) || "").lastInsertRowid;
  const items = db.prepare("SELECT * FROM budget_rule_item WHERE version_id = ?").all(cur);
  const insI = db.prepare(
    "INSERT INTO budget_rule_item (version_id, category, scope_type, scope_key, method, factor, value, base_logic, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  items.forEach((it) => insI.run(vId, it.category, it.scope_type, it.scope_key, it.method, it.factor, it.value, it.base_logic, it.raw));
  cloneEventMap(db, cur, vId);
  return ruleVersionToDto(db, db.prepare("SELECT * FROM budget_rule_version WHERE id = ?").get(vId));
}

function updateRuleItems(db, id, items) {
  if (!db.prepare("SELECT id FROM budget_rule_version WHERE id = ?").get(id)) return { error: "版本不存在" };
  const up = db.prepare("UPDATE budget_rule_item SET factor = ?, value = ? WHERE version_id = ? AND scope_key = ?");
  (items || []).forEach((it) => {
    up.run(it.factor != null ? Number(it.factor) : null, it.value != null ? String(it.value) : null, id, it.scopeKey);
  });
  return { ok: true };
}

function publishRuleVersion(db, id, body) {
  const v = db.prepare("SELECT * FROM budget_rule_version WHERE id = ?").get(id);
  if (!v) return { error: "版本不存在" };
  if (v.status === "active") return { error: "该版本已生效，无需发布" };
  db.prepare("UPDATE budget_rule_version SET status = 'archived' WHERE status = 'active'").run();
  db.prepare(
    "UPDATE budget_rule_version SET status = 'active', source_type = ?, source_ref = ?, note = ?, effective_date = ? WHERE id = ?"
  ).run(
    (body && body.sourceType) || v.source_type || "manual",
    (body && body.sourceRef) || null,
    (body && body.note) || v.note,
    (body && body.effectiveDate) || new Date().toISOString().slice(0, 10),
    id
  );
  loadActiveFactors(db);
  return ruleVersionToDto(db, db.prepare("SELECT * FROM budget_rule_version WHERE id = ?").get(id));
}

/* 确定性变更抽取（占位 LLM 抽取：遵循「LLM 经 prompt 抽取，规则仅作护栏」——
 * 真实 LLM 接入在 AI Gateway 落地，此处先用正则解析常见"下调/下降 X%"表述产出建议清单，供人核对，不直接入库）
 * 增强：每条建议带 scopeKey（hint→scopeKey 词典映射），匹配不到则 scopeKey=null 待人指定；真 LLM 接入后由模型直出 scopeKey */

function deleteRuleVersion(db, id) {
  const v = db.prepare("SELECT * FROM budget_rule_version WHERE id = ?").get(id);
  if (!v) return { error: "版本不存在" };
  if (v.status === "active") return { error: "生效版本不可删除，请先发布其他版本再删除", code: "ACTIVE" };
  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM rule_item_event WHERE version_id = ?").run(id);
    db.prepare("DELETE FROM budget_rule_item WHERE version_id = ?").run(id);
    db.prepare("DELETE FROM budget_rule_version WHERE id = ?").run(id);
    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    return { error: "删除失败：" + (e && e.message ? e.message : String(e)) };
  }
}

/* 留存政策文件文本（AI 生成依据，可追溯）：关联生成的版本（草案/发布后回填 version_id） */

function getEventMap(db, versionId) {
  if (!db.prepare("SELECT id FROM budget_rule_version WHERE id = ?").get(versionId)) return { error: "版本不存在" };
  const rows = db.prepare("SELECT scope_key, subject_id FROM rule_item_event WHERE version_id = ?").all(versionId);
  const map = {};
  rows.forEach((r) => { (map[r.scope_key] = map[r.scope_key] || []).push(r.subject_id); });
  return Object.keys(map).map((k) => ({ scopeKey: k, subjectIds: map[k] }));
}

/* 克隆某版本的「规则卡→科目」映射（active → 新草案）：使新版本自带完整 event-map */

function cloneEventMap(db, fromVersionId, toVersionId) {
  const rows = db.prepare("SELECT scope_key, subject_id FROM rule_item_event WHERE version_id = ?").all(fromVersionId);
  const ins = db.prepare("INSERT OR IGNORE INTO rule_item_event (version_id, scope_key, subject_id) VALUES (?, ?, ?)");
  rows.forEach((r) => ins.run(toVersionId, r.scope_key, r.subject_id));
}

/* 覆盖写某版本映射：整版本清空后按 [{scopeKey, subjectIds}] 重插（事务） */

function putEventMap(db, versionId, body) {
  if (!db.prepare("SELECT id FROM budget_rule_version WHERE id = ?").get(versionId)) return { error: "版本不存在" };
  const list = Array.isArray(body) ? body : [];
  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM rule_item_event WHERE version_id = ?").run(versionId);
    const ins = db.prepare("INSERT INTO rule_item_event (version_id, scope_key, subject_id) VALUES (?, ?, ?)");
    list.forEach((entry) => {
      const sk = entry && entry.scopeKey;
      const ids = entry && Array.isArray(entry.subjectIds) ? entry.subjectIds : [];
      ids.forEach((sid) => { if (sid != null) ins.run(versionId, sk, Number(sid)); });
    });
    db.exec("COMMIT");
    return { ok: true, map: getEventMap(db, versionId) };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) {}
    return { error: "保存失败：" + (e && e.message ? e.message : String(e)) };
  }
}

/* ================================================================
 * 基础数据管理（B）：会计科目主数据 + 经济事项 CRUD
 * ================================================================ */

/* ---------- 会计科目主数据：行映射 ---------- */

module.exports = {
  RULE_FACTORS,
  activeRuleVersionId,
  cloneEventMap,
  cloneRuleVersion,
  compileBaseline,
  deleteRuleVersion,
  getEventMap,
  listRuleVersions,
  loadActiveFactors,
  migrateRuleVersions,
  nextVersionLabel,
  publishRuleVersion,
  putEventMap,
  ruleItemToDto,
  ruleVersionToDto,
  updateRuleItems,
  getRuleFactors,
};
