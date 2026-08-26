/** events module (auto-extracted from db.js) */
const { decomposeMonthly } = require("../pure-calc");
const { aiSuggestion } = require("./ai-budget-decision");
const { getSubject } = require("./subjects");
const { compileBaseline } = require("./rules");

const SEEDS = [
  { cat: "总办办公费", acct_code: "6602.11", type: "down5",   last_budget: 1320000, last_year: 1200000, method: "manageStd" },
  { cat: "食堂费用",   acct_code: "6602.12", type: "canteen", last_budget: 3960000, last_year: 3600000, method: "manageStd" },
  { cat: "宿舍费用",   acct_code: "6602.13", type: "dorm",    last_budget: 2310000, last_year: 2100000, method: "manageStd" },
  { cat: "差旅费",     acct_code: "6602.14", type: "revenue", last_budget: 1980000, last_year: 1800000, method: "volume" },
  { cat: "绿化费",     acct_code: "6602.15", type: "green",   last_budget: 528000,  last_year: 480000,  method: "qtyPrice" },
  { cat: "按实际预算类", acct_code: "6602.99", type: "actual", last_budget: null,   last_year: null,    method: "manual" },
];

/* ---------- 初始化 ---------- */

function rowToEvent(row) {
  if (!row) return null;
  const lastBudget = row.last_budget != null ? row.last_budget : null;
  const lastYear = row.last_year != null ? row.last_year : null;
  return {
    id: row.id,
    cat: row.cat,
    acctCode: row.acct_code,
    center: row.center != null ? row.center : null,
    amount: row.amount,
    monthly: row.monthly ? JSON.parse(row.monthly) : decomposeMonthly(row.amount),
    lastBudget,
    lastYear,
    deviation: lastBudget != null && lastYear != null ? lastYear - lastBudget : null,
    method: row.method,
    subjectId: row.subject_id != null ? row.subject_id : null,
    ai: row.ai ? JSON.parse(row.ai) : null,
    sortNo: row.sort_no,
  };
}

function listEvents(db) {
  return db.prepare("SELECT * FROM economic_event ORDER BY sort_no").all().map(rowToEvent);
}

function getEvent(db, id) {
  return rowToEvent(db.prepare("SELECT * FROM economic_event WHERE id = ?").get(id));
}

function updateAmount(db, id, amount) {
  const row = db.prepare("SELECT * FROM economic_event WHERE id = ?").get(id);
  if (!row) return null;
  const v = Math.max(0, Math.round(Number(amount) || 0));
  db.prepare("UPDATE economic_event SET amount = ?, monthly = ? WHERE id = ?").run(v, JSON.stringify(decomposeMonthly(v)), id);
  return getEvent(db, id);
}

function updateMonthly(db, id, monthly) {
  if (!Array.isArray(monthly) || monthly.length !== 12) return { error: "monthly 必须为 12 元数组" };
  const cur = getEvent(db, id);
  if (!cur) return null;
  const vals = monthly.map((x) => Math.max(0, Math.round(Number(x) || 0)));
  const sum = vals.reduce((a, b) => a + b, 0);
  /* 守恒不变量：月度拆分合计必须与年度额一致（设计文档要求年度额与月度可复算、可守恒） */
  if (sum !== (cur.amount || 0)) return { error: "月度拆分合计(" + sum + ")与年度额(" + (cur.amount || 0) + ")不一致，请核对" };
  db.prepare("UPDATE economic_event SET monthly = ? WHERE id = ?").run(JSON.stringify(vals), id);
  return getEvent(db, id);
}

/* ---------- 上级部门汇总：组织结构 + 单位预算（2026-08-23 模块二） ---------- */
/* organization：单位树（下级单位数量按组织结构自动确定，不写死）
 * unit_budget：单位 × 经济事项 的预算（amount/last_budget/last_year/monthly）
 *   + reduce_ratio/reduce_amount（压降处理，管理线两维度之一）
 *   + note（注释 = 原因分析，保存到数据库） */

function createEvent(db, body) {
  const cat = String(body.cat || "").trim();
  if (!cat) return { error: "经济事项名称不能为空" };
  const dup = db.prepare("SELECT id FROM economic_event WHERE cat = ?").get(cat);
  if (dup) return { error: "经济事项名称已存在（cat 唯一）" };
  const method = body.method ? String(body.method).trim() : null;
  const center = body.center ? String(body.center).trim() : null;
  const amount = Math.max(0, Math.round(Number(body.amount) || 0));
  const subjectId = body.subjectId != null ? Number(body.subjectId) : null;
  const lastYear = body.lastYear != null ? Math.round(Number(body.lastYear)) : null;
  const lastBudget = body.lastBudget != null ? Math.round(Number(body.lastBudget)) : null;
  const sortNo = body.sortNo != null && Number.isFinite(body.sortNo) ? Number(body.sortNo) : 0;
  const acctCode = body.acctCode ? String(body.acctCode).trim() : (subjectId ? (getSubject(db, subjectId) || {}).code : null);
  const r = db.prepare(
    "INSERT INTO economic_event (cat, acct_code, center, amount, monthly, last_budget, last_year, method, ai, sort_no, subject_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(cat, acctCode, center, amount, JSON.stringify(decomposeMonthly(amount)), lastBudget, lastYear, method, JSON.stringify(aiSuggestion(cat, method, lastYear || 0)), sortNo, subjectId);
  return getEvent(db, r.lastInsertRowid);
}

function updateEvent(db, id, body) {
  const cur = getEvent(db, id);
  if (!cur) return null;
  const cat = body.cat != null ? String(body.cat).trim() : cur.cat;
  if (cat !== cur.cat) {
    const dup = db.prepare("SELECT id FROM economic_event WHERE cat = ? AND id != ?").get(cat, id);
    if (dup) return { error: "经济事项名称已存在（cat 唯一）" };
  }
  const center = body.center !== undefined ? (body.center ? String(body.center).trim() : null) : cur.center;
  const method = body.method !== undefined ? (body.method ? String(body.method).trim() : null) : cur.method;
  const subjectId = body.subjectId !== undefined ? (body.subjectId != null ? Number(body.subjectId) : null) : cur.subjectId;
  const acctCode = body.acctCode !== undefined ? (body.acctCode ? String(body.acctCode).trim() : null)
    : (subjectId && !cur.acctCode ? (getSubject(db, subjectId) || {}).code : cur.acctCode);
  const lastYear = body.lastYear !== undefined ? (body.lastYear != null ? Math.round(Number(body.lastYear)) : null) : cur.lastYear;
  const lastBudget = body.lastBudget !== undefined ? (body.lastBudget != null ? Math.round(Number(body.lastBudget)) : null) : cur.lastBudget;
  const sortNo = body.sortNo !== undefined && Number.isFinite(body.sortNo) ? Number(body.sortNo) : cur.sortNo;
  // amount 不在此处改（沿用 PUT amount）；若传了 amount 则同步重建月度
  let amount = cur.amount;
  let monthly = cur.monthly;
  if (body.amount != null) {
    amount = Math.max(0, Math.round(Number(body.amount) || 0));
    monthly = decomposeMonthly(amount);
  }
  db.prepare(
    "UPDATE economic_event SET cat=?, acct_code=?, center=?, amount=?, monthly=?, last_budget=?, last_year=?, method=?, sort_no=?, subject_id=? WHERE id=?"
  ).run(cat, acctCode, center, amount, JSON.stringify(monthly), lastBudget, lastYear, method, sortNo, subjectId, id);
  return getEvent(db, id);
}

function deleteEvent(db, id) {
  const cur = getEvent(db, id);
  if (!cur) return { error: "未找到经济事项" };
  db.prepare("DELETE FROM economic_event WHERE id = ?").run(id);
  return { ok: true, id };
}

/* 种子：首次初始化时把样例经济事项写入（RULE_FACTORS 此时尚未加载，走硬编码因子口径） */
function seedEvents(db) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM economic_event").get().c;
  if (count !== 0) return count;
  const ins = db.prepare(
    "INSERT INTO economic_event (cat, acct_code, amount, monthly, last_budget, last_year, method, ai, sort_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  SEEDS.forEach((s, i) => {
    const base = compileBaseline(s.method, s.type, s.last_year);
    ins.run(s.cat, s.acct_code, base, JSON.stringify(decomposeMonthly(base)), s.last_budget, s.last_year, s.method, JSON.stringify(aiSuggestion(s.cat, s.type, s.last_year)), i);
  });
  return SEEDS.length;
}

module.exports = {
  SEEDS,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  rowToEvent,
  seedEvents,
  updateAmount,
  updateEvent,
  updateMonthly,
};
