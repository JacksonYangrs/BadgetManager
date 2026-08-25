/* ================================================================
 * db.js — 经济事项编制模块 · SQLite 数据库层（Node 22 内置 node:sqlite）
 * 表 economic_event：与编制主表 8 列一一对应
 *   id / cat(经济事项) / acct_code(会计科目) / amount(本年度预算值)
 *   monthly(JSON 12 元月度拆分) / last_budget(上年预算) / last_year(上年决算)
 *   method(预算控制方法·上级定义) / ai(JSON 建议) / sort_no
 * 偏差 = 上年决算 − 上年预算（查询时计算，不落库）
 * 纯函数（decomposeMonthly / aiSuggestion / compileBaseline）与前端口径一致。
 * 启动需 node --experimental-sqlite（Node ≥22.5）。
 * ================================================================ */
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const crypto = require("crypto");

const DB_FILE = path.join(__dirname, "economic_event.db");

/* ---------- 确定性纯函数（与 website/data、core/calc 口径一致） ---------- */
const BASE_MONTHLY_RATIO = [0.07, 0.06, 0.08, 0.07, 0.08, 0.09, 0.08, 0.09, 0.1, 0.09, 0.1, 0.09]; /* 和 = 1.00 */

function decomposeMonthly(total) {
  const base = BASE_MONTHLY_RATIO.map((p) => Math.round((total || 0) * p));
  const sum = base.reduce((a, b) => a + b, 0);
  base[11] += (total || 0) - sum; /* 尾差冲正，和 = 总额 */
  return base;
}

/* 规则基线：与 BM.applyRule / BM.calc.compileByMethod 一致（按 type）。
 * 基线因子来自 active 预算规则版本的 baseline 条目（DB 驱动），无版本时回退硬编码。 */
const HARDCODED_FACTORS = { down5: 0.95, canteen: 0.97, dorm: 0.90, revenue: 0.98, green: 0.92, actual: 1.0, volume: 0.98, qtyPrice: 0.92, history: 1.0, manual: 1.0 };
let RULE_FACTORS = null; /* 由 loadActiveFactors 加载，发布新版本后刷新 */

function applyRuleBase(type, lastYear) {
  const ly = lastYear || 0;
  const f = (RULE_FACTORS && RULE_FACTORS[type] != null) ? RULE_FACTORS[type]
    : (HARDCODED_FACTORS[type] != null ? HARDCODED_FACTORS[type] : 1);
  return Math.round(ly * f);
}

function loadActiveFactors(db) {
  const row = db.prepare("SELECT id FROM budget_rule_version WHERE status = 'active' LIMIT 1").get();
  if (!row) { RULE_FACTORS = null; return; }
  const rows = db.prepare("SELECT scope_key, factor FROM budget_rule_item WHERE version_id = ? AND category = 'baseline' AND scope_type = 'type'").all(row.id);
  const m = {};
  rows.forEach((r) => { m[r.scope_key] = r.factor; });
  RULE_FACTORS = m;
}

/* 控制基线：按上级定义方法 */
function compileBaseline(method, type, lastYear) {
  const ly = lastYear || 0;
  if (method === "manageStd") return applyRuleBase(type, ly);
  if (method === "volume") return Math.round(ly * 0.98);
  if (method === "qtyPrice") return Math.round(ly * 0.92);
  if (method === "history" || method === "manual") return ly;
  return applyRuleBase(type, ly);
}

/* AI 建议：lo/hi/mid + 依据（与前端 BM.aiSuggestion 一致） */
function aiSuggestion(cat, type, lastYear) {
  const base = compileBaseline("manageStd", type, lastYear);
  const lo = Math.round(base * 0.9);
  const hi = Math.round(base * 1.05);
  const mid = Math.round((lo + hi) / 2);
  const execRate = lastYear != null ? ({ down5: 0.95, canteen: 0.97, dorm: 0.9, revenue: 0.98, green: 0.92, actual: 1 })[type] || 1 : null;
  return {
    lo, hi, mid,
    policy: "预算政策：规则基线（" + (lastYear != null ? Math.round(((base / lastYear) - 1) * 1000) / 10 + "% 相对上年" : "据实申报") + "）",
    basis: lastYear != null ? "往年预算：" + lastYear + "（上年决算）" : "往年预算：无历史",
    exec: execRate != null ? "上年执行：执行率约 " + Math.round(execRate * 100) + "%" : "上年执行：—",
  };
}

/* ---------- 种子数据（客户规则字典 · 6 个经济事项样例，全量 ~390 待主数据导入） ---------- */
const SEEDS = [
  { cat: "总办办公费", acct_code: "6602.11", type: "down5",   last_budget: 1320000, last_year: 1200000, method: "manageStd" },
  { cat: "食堂费用",   acct_code: "6602.12", type: "canteen", last_budget: 3960000, last_year: 3600000, method: "manageStd" },
  { cat: "宿舍费用",   acct_code: "6602.13", type: "dorm",    last_budget: 2310000, last_year: 2100000, method: "manageStd" },
  { cat: "差旅费",     acct_code: "6602.14", type: "revenue", last_budget: 1980000, last_year: 1800000, method: "volume" },
  { cat: "绿化费",     acct_code: "6602.15", type: "green",   last_budget: 528000,  last_year: 480000,  method: "qtyPrice" },
  { cat: "按实际预算类", acct_code: "6602.99", type: "actual", last_budget: null,   last_year: null,    method: "manual" },
];

/* ---------- 初始化 ---------- */
function init() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS economic_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cat TEXT NOT NULL UNIQUE,
      acct_code TEXT,
      center TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      monthly TEXT,
      last_budget INTEGER,
      last_year INTEGER,
      method TEXT,
      ai TEXT,
      sort_no INTEGER
    );
  `);
  try { db.exec("ALTER TABLE economic_event ADD COLUMN center TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE economic_event ADD COLUMN subject_id INTEGER"); } catch (e) {}

  /* 会计科目主数据表（B-基础数据管理） */
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT,
      cat TEXT,
      center TEXT,
      method TEXT,
      control_logic TEXT,
      parent_id INTEGER,
      sort_no INTEGER
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS c FROM economic_event").get().c;
  if (count === 0) {
    const ins = db.prepare(
      "INSERT INTO economic_event (cat, acct_code, amount, monthly, last_budget, last_year, method, ai, sort_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    SEEDS.forEach((s, i) => {
      const base = compileBaseline(s.method, s.type, s.last_year);
      ins.run(s.cat, s.acct_code, base, JSON.stringify(decomposeMonthly(base)), s.last_budget, s.last_year, s.method, JSON.stringify(aiSuggestion(s.cat, s.type, s.last_year)), i);
    });
  }

  /* 基础数据管理（B）：从经济事项 acct_code 去重迁移会计科目主数据 + 回填 subject_id（幂等） */
  migrateSubjects(db);

  /* 预算规则版本化（D4）：建表 + 初始版本 v2026.0 + 加载 active 因子（驱动基线计算） */
  migrateRuleVersions(db);
  loadActiveFactors(db);

  return db;
}

/* ---------- 查询 / 更新 ---------- */
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
  const vals = monthly.map((x) => Math.max(0, Math.round(Number(x) || 0)));
  db.prepare("UPDATE economic_event SET monthly = ? WHERE id = ?").run(JSON.stringify(vals), id);
  return getEvent(db, id);
}

/* ---------- 上级部门汇总：组织结构 + 单位预算（2026-08-23 模块二） ---------- */
/* organization：单位树（下级单位数量按组织结构自动确定，不写死）
 * unit_budget：单位 × 经济事项 的预算（amount/last_budget/last_year/monthly）
 *   + reduce_ratio/reduce_amount（压降处理，管理线两维度之一）
 *   + note（注释 = 原因分析，保存到数据库） */
const ORG_SEEDS = [
  { id: 1, code: "HQ",   name: "总部（上级部门）", parent_id: null },
  { id: 2, code: "2010", name: "一公司（2010）", parent_id: 1 },
  { id: 3, code: "2020", name: "二公司（2020）", parent_id: 1 },
  { id: 4, code: "2170", name: "三公司（2170）", parent_id: 1 },
  { id: 5, code: "3050", name: "四公司（3050）", parent_id: 1 },
];
/* 单位规模系数：模拟不同体量单位各自填报的结果 */
const UNIT_FACTOR = { "2010": 1.0, "2020": 0.9, "2170": 0.75, "3050": 0.65 };

function initUnits(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS organization (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    parent_id INTEGER,
    level TEXT
  );
  CREATE TABLE IF NOT EXISTS unit_budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    cat TEXT NOT NULL,
    acct_code TEXT,
    amount INTEGER NOT NULL DEFAULT 0,
    monthly TEXT,
    last_budget INTEGER,
    last_year INTEGER,
    method TEXT,
    ai TEXT,
    reduce_ratio REAL,
    reduce_amount INTEGER,
    note TEXT,
    UNIQUE(org_id, cat)
  );`);
  /* 组织 / 单位预算数据由 scripts/import_excel_data.py 全量导入（真实客户主数据）。
   * 此处仅做最小兜底：organization 无 HQ 时插入总部节点，避免 user/org 引用悬空。 */
  if (!db.prepare("SELECT id FROM organization WHERE code = 'HQ'").get()) {
    db.prepare("INSERT INTO organization (id, code, name, parent_id, level) VALUES (1, 'HQ', '总部（上级部门）', NULL, 'group')").run();
  }
  /* 公司→事业部(BU) 归属字段（2026-08-25 看板真实数据 A+B）：可在基础数据→组织结构编辑 */
  try { db.exec("ALTER TABLE organization ADD COLUMN bu_code TEXT"); } catch (e) {}
}

function listOrgs(db) {
  return db.prepare("SELECT id, code, name, parent_id, level FROM organization ORDER BY id").all();
}

/* 上级部门的下级单位（组织结构自动确定：parent_id = HQ） */
function listChildUnits(db, parentCode) {
  const p = db.prepare("SELECT id FROM organization WHERE code = ?").get(parentCode || "HQ");
  if (!p) return [];
  return db.prepare("SELECT id, code, name FROM organization WHERE parent_id = ? ORDER BY id").all(p.id);
}

/* ---------- 组织结构 可编辑 CRUD（2026-08-24 C1 / D2） ---------- */
function getOrg(db, id) {
  return db.prepare("SELECT id, code, name, parent_id, level, type, managed_center_id AS managedCenterId, bu_code AS buCode FROM organization WHERE id = ?").get(id) || null;
}

/* 公司→事业部(BU) 映射推断（初始值，可在基础数据→组织结构编辑纠偏）
 * 规则：按公司编码段/名称关键词归到 17 个 BU 之一；命中不到归 null（手动补）。 */
const BU_CODES = ["BU-00","BU-01","BU-02","BU-03","BU-05","BU-06","BU-08","BU-09","BU-10","BU-11","BU-12","BU-13","BU-15","BU-16","BU-17","BU-97"];
function inferBuCode(code, name) {
  const c = String(code || "");
  const n = String(name || "");
  // 海外/香港系（朗明纳斯/Luminus/WIPAC/威派克/香港三安）→ BU-16 香港三安
  if (/Luminus|朗明纳斯|WIPAC|威派克|香港三安|Hunan San/.test(n) || /^2060|^2070|^2080|^2090|^2120|^5070|^5080|^71/.test(c)) return "BU-16";
  if (/^10/.test(c)) return "BU-00";            // 股份总部 1000
  if (/^20/.test(c)) {                            // 20xx 系列：光电/半导体传统线
    if (/集成|集成电路|IC|领翔/.test(n)) return "BU-10"; // LDI/集成电路
    if (/气体/.test(n)) return "BU-03";          // 特种应用（气体）
    if (/半导体/.test(n)) return "BU-01";        // 氮化镓/半导体
    return "BU-01";
  }
  if (/^21/.test(c) || /^22/.test(c)) {           // 光通讯
    if (/光通讯|光电子|信息通讯|先进/.test(n)) return "BU-09";
    return "BU-09";
  }
  if (/^30/.test(c)) {                            // 30xx 系列：集成电路/半导体基地
    if (/集成|半导体|泉州|湖南/.test(n)) return "BU-10";
    if (/北电|新材料/.test(n)) return "BU-06";   // 电力电子（化合物半导体材料）
    return "BU-10";
  }
  if (/^31/.test(c) || /^32/.test(c)) {           // 湖南/重庆半导体
    if (/重庆/.test(n)) return "BU-06";
    return "BU-01";
  }
  if (/^50/.test(c)) {                            // 安瑞光电（车灯/光电）
    if (/香港灯条|灯条/.test(n)) return "BU-97";
    return "BU-08";                               // 安瑞
  }
  if (/^90/.test(c)) return "BU-13";              // 泉州三安公共部门/安徽三首
  return null;
}

/* 幂等填充 bu_code：仅当 organization.bu_code 全为空时推断写入（不覆盖手动编辑值） */
function seedBuCodes(db) {
  const filled = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE bu_code IS NOT NULL AND bu_code != ''").get().c;
  if (filled > 0) return filled;
  const rows = db.prepare("SELECT id, code, name FROM organization WHERE type IN ('unit','company','dept')").all();
  const upd = db.prepare("UPDATE organization SET bu_code = ? WHERE id = ?");
  let n = 0;
  rows.forEach((r) => {
    const bu = inferBuCode(r.code, r.name);
    if (bu) { upd.run(bu, r.id); n++; }
  });
  return n;
}

/* 环检测：ancestorId 是否为 nodeId 的祖先（含自身） */
function isOrgAncestor(db, ancestorId, nodeId) {
  const seen = new Set();
  let cur = getOrg(db, nodeId);
  while (cur && cur.parent_id != null) {
    if (seen.has(cur.id)) break; // 环保护
    seen.add(cur.id);
    if (cur.parent_id === ancestorId) return true;
    cur = getOrg(db, cur.parent_id);
  }
  return false;
}

/* 按 parent_id 从根重算全部组织 level：深度 0=group,1=company,>=2=dept */
function recomputeOrgLevels(db) {
  const all = db.prepare("SELECT id, parent_id FROM organization").all();
  const byId = {};
  all.forEach((o) => (byId[o.id] = o));
  const depthOf = (id, seen) => {
    const o = byId[id];
    if (!o || o.parent_id == null) return 0;
    if (seen.has(id)) return 0; // 环保护
    seen.add(id);
    return 1 + depthOf(o.parent_id, seen);
  };
  const upd = db.prepare("UPDATE organization SET level = ? WHERE id = ?");
  all.forEach((o) => {
    const d = depthOf(o.id, new Set());
    upd.run(d === 0 ? "group" : d === 1 ? "company" : "dept", o.id);
  });
}

/* 校验 managedCenterId：必须指向 type='center' 的节点（且非自身） */
function resolveManagedCenter(db, managedCenterId, selfId) {
  if (managedCenterId == null) return { id: null };
  const mc = Number(managedCenterId);
  const node = getOrg(db, mc);
  if (!node) return { error: "归属管理中心不存在" };
  if (node.type !== "center") return { error: "归属对象必须是管理中心（type=center）" };
  if (selfId != null && node.id === selfId) return { error: "不能将自身设为归属管理中心" };
  return { id: mc };
}

function createOrg(db, body) {
  const code = String(body.code || "").trim();
  if (!code) return { error: "组织编码不能为空" };
  if (db.prepare("SELECT id FROM organization WHERE code = ?").get(code)) return { error: "组织编码已存在" };
  let parentId = body.parentId != null ? Number(body.parentId) : null;
  if (parentId != null && !getOrg(db, parentId)) return { error: "上级组织不存在" };
  const type = body.type && ["group", "unit", "dept", "center"].includes(body.type) ? body.type : "unit";
  const mc = resolveManagedCenter(db, body.managedCenterId, null);
  if (mc.error) return mc;
  const name = String(body.name || code).trim();
  const buCode = body.buCode != null ? String(body.buCode || "").trim() || null : null;
  db.prepare("INSERT INTO organization (code, name, parent_id, level, type, managed_center_id, bu_code) VALUES (?, ?, ?, 'company', ?, ?, ?)")
    .run(code, name, parentId, type, mc.id, buCode);
  const id = db.prepare("SELECT last_insert_rowid() AS id").get().id;
  recomputeOrgLevels(db);
  return getOrg(db, id);
}

function updateOrg(db, id, body) {
  const cur = getOrg(db, id);
  if (!cur) return null;
  const name = body.name != null ? String(body.name).trim() : cur.name;
  let parentId = body.parentId !== undefined ? (body.parentId != null ? Number(body.parentId) : null) : cur.parent_id;
  if (parentId != null) {
    if (parentId === id) return { error: "上级组织不能是自身" };
    if (isOrgAncestor(db, id, parentId)) return { error: "不能挂到自身下级之下（会形成环）" };
    if (!getOrg(db, parentId)) return { error: "上级组织不存在" };
  }
  const type = body.type && ["group", "unit", "dept", "center"].includes(body.type) ? body.type : cur.type;
  let managedCenterId = cur.managedCenterId;
  if (body.managedCenterId !== undefined) {
    const mc = resolveManagedCenter(db, body.managedCenterId, id);
    if (mc.error) return mc;
    managedCenterId = mc.id;
  }
  let buCode = cur.buCode;
  if (body.buCode !== undefined) buCode = body.buCode != null ? String(body.buCode || "").trim() || null : null;
  db.prepare("UPDATE organization SET name = ?, parent_id = ?, type = ?, managed_center_id = ?, bu_code = ? WHERE id = ?")
    .run(name, parentId, type, managedCenterId, buCode, id);
  recomputeOrgLevels(db);
  return getOrg(db, id);
}

function deleteOrg(db, id) {
  const cur = getOrg(db, id);
  if (!cur) return { error: "未找到组织" };
  const child = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE parent_id = ?").get(id);
  if (child && child.c > 0) return { error: "该组织下仍有 " + child.c + " 个子组织，无法删除（请先迁移或删除子组织）" };
  const ub = db.prepare("SELECT COUNT(*) AS c FROM unit_budget WHERE org_id = ?").get(id);
  if (ub && ub.c > 0) return { error: "该组织下仍有 " + ub.c + " 条单位预算数据，无法删除（预算不允许悬空）" };
  const us = db.prepare("SELECT COUNT(*) AS c FROM user WHERE org_id = ?").get(id);
  if (us && us.c > 0) return { error: "该组织下仍有 " + us.c + " 名人员，无法删除（请先调整人员归属）" };
  const dep = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE managed_center_id = ?").get(id);
  if (dep && dep.c > 0) return { error: "该管理中心下仍有 " + dep.c + " 个部门/单位归口，无法删除（请先调整归口关系）" };
  db.prepare("DELETE FROM organization WHERE id = ?").run(id);
  return { ok: true, id };
}

function ubRowToEvent(row) {
  if (!row) return null;
  const lb = row.last_budget != null ? row.last_budget : null;
  const ly = row.last_year != null ? row.last_year : null;
  const amt = row.amount != null ? row.amount : 0;
  const reduce = row.reduce_amount != null ? row.reduce_amount : (row.reduce_ratio != null ? Math.round(amt * row.reduce_ratio) : null);
  return {
    id: row.id, orgId: row.org_id, cat: row.cat, acctCode: row.acct_code,
    amount: amt,
    monthly: row.monthly ? JSON.parse(row.monthly) : decomposeMonthly(amt),
    lastBudget: lb, lastYear: ly,
    deviation: lb != null && ly != null ? ly - lb : null,
    method: row.method, ai: row.ai ? JSON.parse(row.ai) : null,
    reduceRatio: row.reduce_ratio, reduceAmount: row.reduce_amount, reduced: reduce,
    note: row.note || "",
  };
}

function listUnitBudgets(db, orgCode) {
  const org = db.prepare("SELECT id FROM organization WHERE code = ?").get(orgCode);
  if (!org) return [];
  return db.prepare("SELECT * FROM unit_budget WHERE org_id = ? ORDER BY id").all(org.id).map(ubRowToEvent);
}

/* 按事项汇总多单位（管理线：部门级预算汇总）
 * 返回每项含：年预算 amount、12 月预算分布 monthly[]、上年实际 lastYear、
 * 当期 months 执行累计 exec（来自 budget_execution，无则按 lastYear×占比推算）。 */
function summaryByCat(db, orgCodes, months) {
  const ms = months && months.length ? months : [1,2,3,4,5,6,7,8,9,10,11,12];
  const orgIds = [];
  orgCodes.forEach((code) => {
    const o = db.prepare("SELECT id FROM organization WHERE code = ?").get(code);
    if (o) orgIds.push(o.id);
  });
  if (!orgIds.length) return [];
  const ph = orgIds.map(() => "?").join(",");
  const rows = db.prepare(`SELECT cat, acct_code, amount, monthly, last_year FROM unit_budget WHERE org_id IN (${ph})`).all(...orgIds);
  const map = {};
  rows.forEach((r) => {
    if (!map[r.cat]) map[r.cat] = { cat: r.cat, acctCode: r.acct_code, units: 0, amount: 0, lastYear: 0, monthly: new Array(12).fill(0) };
    const m = map[r.cat];
    m.units += 1;
    m.amount += (r.amount || 0);
    m.lastYear += (r.last_year || 0);
    let ratio = [];
    try { ratio = r.monthly ? JSON.parse(r.monthly) : []; } catch (e) { ratio = []; }
    for (let i = 0; i < 12; i++) m.monthly[i] += (Number(ratio[i]) || 0);
  });
  /* 执行：从 budget_execution 按 cat + months 聚合 */
  const cats = Object.keys(map);
  if (cats.length) {
    const catPh = cats.map(() => "?").join(",");
    const msPh = ms.map(() => "?").join(",");
    const exRows = db.prepare(`SELECT cat, month, SUM(amount) AS amt FROM budget_execution WHERE org_id IN (${ph}) AND cat IN (${catPh}) AND month IN (${msPh}) GROUP BY cat, month`).all(...orgIds, ...cats, ...ms);
    const exMap = {};
    exRows.forEach((e) => { exMap[e.cat] = (exMap[e.cat] || 0) + (e.amt || 0); });
    cats.forEach((c) => {
      let exec = exMap[c] || 0;
      if (!exec && map[c].lastYear) {
        /* 回退 A 推算：lastYear × 当期 months 占比（基于月度预算分布） */
        const total = map[c].monthly.reduce((a, b) => a + b, 0);
        const periodSum = ms.reduce((a, mo) => a + (map[c].monthly[mo - 1] || 0), 0);
        exec = total > 0 ? Math.round((map[c].lastYear * periodSum) / total) : Math.round(map[c].lastYear * ms.length / 12);
      }
      map[c].exec = exec;
      map[c].execEstimated = !exMap[c] && map[c].lastYear > 0;
    });
  }
  return cats.map((k) => {
    const m = map[k];
    m.deviation = m.lastYear ? m.lastYear - m.amount : null;
    m.vsLastYear = m.lastYear ? Math.round(((m.amount - m.lastYear) / m.lastYear) * 1000) / 10 : null;
    return m;
  });
}

function updateUnitBudgetReduction(db, id, { reduceRatio, reduceAmount, note }) {
  const row = db.prepare("SELECT * FROM unit_budget WHERE id = ?").get(id);
  if (!row) return null;
  const amt = row.amount;
  let rRatio = null, rAmount = null;
  if (reduceAmount != null) {
    rAmount = Math.max(0, Math.round(Number(reduceAmount) || 0));
    rRatio = amt ? Math.round((rAmount / amt) * 1000) / 1000 : 0;
  } else if (reduceRatio != null) {
    rRatio = Math.max(0, Math.min(0.9, Number(reduceRatio) || 0));
    rAmount = Math.round(amt * rRatio);
  }
  db.prepare("UPDATE unit_budget SET reduce_ratio = ?, reduce_amount = ?, note = ? WHERE id = ?").run(rRatio, rAmount, note != null ? String(note) : row.note, id);
  return ubRowToEvent(db.prepare("SELECT * FROM unit_budget WHERE id = ?").get(id));
}

/* ================================================================
 * 逐月执行流水（B 路径 · 2026-08-24）
 *   budget_execution(org_id, cat, month, amount)
 *   种子：用 unit_budget.last_year（真实上年实际）× 该 cat 月度占比 确定性摊到 12 月。
 *   根于真实，非编造；接口预留 Excel 导入直接 upsert 替换。
 * ================================================================ */
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
  migrateOrgTypeAndCenters(db);

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
  seedNotifications(db);
}

/* ---------- 组织扩展迁移（D1）：type / managed_center_id + 11 管理中心种子 ---------- */
/* organization 原有列 level（group/company/dept）。本次新增业务分类 type：
 *   group=总部 / unit=二级单位(原 level=company) / dept=三级部门(原 level=dept) / center=管理中心
 * managed_center_id：unit/dept 归属的管理中心 id（一对多，1 中心管 N 部门）。 */
const MANAGE_CENTERS = [
  { code: "MC-01", name: "职能中心" },
  { code: "MC-02", name: "行政服务中心" },
  { code: "MC-03", name: "生产管理中心" },
  { code: "MC-04", name: "设备动力中心" },
  { code: "MC-05", name: "质量管控中心" },
  { code: "MC-06", name: "技术研发中心" },
  { code: "MC-07", name: "供应链中心" },
  { code: "MC-08", name: "市场营销中心" },
  { code: "MC-09", name: "财务共享中心" },
  { code: "MC-10", name: "人力资源中心" },
  { code: "MC-11", name: "信息化中心" },
];

function migrateOrgTypeAndCenters(db) {
  const cols = db.prepare("PRAGMA table_info(organization)").all().map((c) => c.name);
  if (!cols.includes("type")) db.exec("ALTER TABLE organization ADD COLUMN type TEXT");
  if (!cols.includes("managed_center_id")) db.exec("ALTER TABLE organization ADD COLUMN managed_center_id INTEGER");

  /* 回填 type（幂等）：company→unit，dept→dept，group→group */
  db.prepare("UPDATE organization SET type = 'unit' WHERE level = 'company' AND (type IS NULL OR type = '')").run();
  db.prepare("UPDATE organization SET type = 'dept' WHERE level = 'dept' AND (type IS NULL OR type = '')").run();
  db.prepare("UPDATE organization SET type = 'group' WHERE level = 'group' AND (type IS NULL OR type = '')").run();

  /* 种子 11 管理中心（挂 HQ 下，type='center'），幂等 */
  const hq = db.prepare("SELECT id FROM organization WHERE code = 'HQ'").get();
  if (hq) {
    const exists = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE type = 'center'").get().c;
    if (exists === 0) {
      const ins = db.prepare("INSERT INTO organization (code, name, parent_id, level, type) VALUES (?, ?, ?, 'company', 'center')");
      MANAGE_CENTERS.forEach((c) => ins.run(c.code, c.name, hq.id));
      console.log("[migrate] 插入 11 个管理中心节点");
    }
    recomputeOrgLevels(db);
  }
}

/* ---------- 认证 ---------- */
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
function buildOrgTree(db) {
  const all = db.prepare("SELECT id, code, name, parent_id, level, type, managed_center_id AS managedCenterId, bu_code AS buCode FROM organization ORDER BY id").all();
  const map = {};
  all.forEach((o) => (map[o.id] = Object.assign({}, o, { children: [] })));
  const roots = [];
  all.forEach((o) => {
    if (o.parent_id && map[o.parent_id]) map[o.parent_id].children.push(map[o.id]);
    else roots.push(map[o.id]);
  });
  return roots;
}

/* 某组织节点下的人员（含角色） */
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
const GRASSROOTS = new Set(["expense", "staff"]);
const UPPER_ROLES = new Set(["admin", "ceo", "boss", "cooLead", "cooAnalyst", "finance", "buHead", "legalHead", "adminHead", "companyBudgeter", "centerOwner", "manager"]);

function isGrassroots(roles) {
  return roles.length > 0 && roles.every((r) => GRASSROOTS.has(r));
}

/* 消息是否对当前用户可见 */
function notifVisibleTo(n, roles, userId) {
  /* 个人定向：只给指定用户 */
  if (n.user_id != null) return n.user_id === userId;
  /* 广播：角色范围 */
  if (n.role_scope && n.role_scope !== "all") {
    const scopes = n.role_scope.split(",").map((s) => s.trim());
    if (!roles.some((r) => scopes.includes(r))) return false;
  }
  /* 基层排他：组织 / 账户 / 汇总类对基层不可见 */
  if (isGrassroots(roles) && ["org", "account", "summary"].includes(n.type)) return false;
  return true;
}

function notifRowToDto(row) {
  return {
    id: row.id, type: row.type, title: row.title, body: row.body,
    view: row.view, refId: row.ref_id, priority: row.priority,
    read: !!row.read, createdAt: row.created_at,
  };
}

function seedNotifications(db) {
  if (db.prepare("SELECT COUNT(*) AS c FROM notification").get().c > 0) return;
  const ins = db.prepare(
    "INSERT INTO notification (user_id, role_scope, org_scope, type, title, body, view, ref_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const uid = (un) => { const r = db.prepare("SELECT id FROM user WHERE username = ?").get(un); return r ? r.id : null; };
  const seeds = [
    [null, "all", null, "compile", "2026 年度预算编制工作已启动", "请各预算编制人于 9 月 30 日前完成编制提交，逾期将影响集团汇总。", "compile", null, "normal"],
    [null, "all", null, "compile", "预算编制模板（V2）已发布", "请使用最新版《2026 年费控系统预算数据收集模板》填报，旧模板作废。", "compile", null, "normal"],
    [null, "finance,manager,buHead,ceo", null, "execution", "总办·食堂费用 执行预警", "本年累计执行已达年度预算 92%，请关注并控制后续支出。", "kanban", null, "danger"],
    [null, "finance,buHead,ceo", null, "deviation", "8 项经济事项预算偏差超 5%", "偏差事项待财务复核确认，请在预算系统中逐条核对。", "kanban", null, "danger"],
    [null, "finance,buHead,ceo", null, "summary", "厦门市三安光电科技有限公司 预算汇总完成", "该公司预算汇总已编制完成，请上级审核并下达压降目标。", "unitInbox", null, "normal"],
    [null, "admin", null, "org", "组织架构更新", "新增安徽科技事业部，相关预算归口部门已同步至组织树。", "org", null, "normal"],
    [null, "admin", null, "account", "账户与角色变更", "新增 2 名预算编制人账号，权限已分配。", "accounts", null, "normal"],
    [uid("wangmin"), null, null, "execution", "您负责的 2010 公司·宿舍费用 执行预警", "请于本周内说明超支原因并提交整改计划。", "kanban", null, "danger"],
    [null, "centerOwner", null, "compile", "IT 职能中心归口科目编制指南", "IT 归口科目编制口径已下发，请中心归口责任人按指南填报。", "compile", null, "normal"],
  ];
  seeds.forEach((s) => ins.run(...s));
  console.log("[seed] notification 种子写入 " + seeds.length + " 条");
}

function listNotifications(db, user, opts) {
  opts = opts || {};
  const roles = (user.roles || []).map((r) => r.code);
  const rows = db.prepare("SELECT * FROM notification ORDER BY created_at DESC, id DESC").all();
  let items = rows.filter((n) => notifVisibleTo(n, roles, user.id)).map(notifRowToDto);
  const unread = items.filter((i) => !i.read).length;
  if (opts.unreadOnly) items = items.filter((i) => !i.read);
  return { items, unread };
}

function markNotificationRead(db, id, user) {
  const roles = (user.roles || []).map((r) => r.code);
  const n = db.prepare("SELECT * FROM notification WHERE id = ?").get(Number(id));
  if (!n) return null;
  if (!notifVisibleTo(n, roles, user.id)) return null;
  db.prepare("UPDATE notification SET read = 1 WHERE id = ?").run(Number(id));
  return notifRowToDto(db.prepare("SELECT * FROM notification WHERE id = ?").get(Number(id)));
}

function markAllNotificationsRead(db, user) {
  const roles = (user.roles || []).map((r) => r.code);
  const rows = db.prepare("SELECT * FROM notification").all();
  let cnt = 0;
  rows.forEach((n) => {
    if (notifVisibleTo(n, roles, user.id) && !n.read) {
      db.prepare("UPDATE notification SET read = 1 WHERE id = ?").run(n.id);
      cnt++;
    }
  });
  return cnt;
}

function createNotification(db, body, user) {
  const { user_id, role_scope, org_scope, type, title, body: b, view, ref_id, priority } = body || {};
  if (!title || !type) return { error: "缺少 title 或 type" };
  const r = db.prepare(
    "INSERT INTO notification (user_id, role_scope, org_scope, type, title, body, view, ref_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    user_id != null ? Number(user_id) : null,
    role_scope || null, org_scope || null, type, title, b || null, view || null,
    ref_id != null ? String(ref_id) : null, priority || "normal"
  );
  return notifRowToDto(db.prepare("SELECT * FROM notification WHERE id = ?").get(r.lastInsertRowid));
}

/* ================================================================
 * 预算规则版本化管理（D4：混合生成 · 数据库可配置）
 *  - budget_rule_version：版本集（draft / active / archived）
 *  - budget_rule_item：版本下规则条目（baseline 控制基线比例 / flow 财务流程规则）
 *  - 初始版本 v2026.0 由硬编码 applyRuleBase 映射 + 财务流程默认规则迁移而来
 *  - 发布新版本后 loadActiveFactors 刷新，compileBaseline / aiSuggestion 全系统同步
 * ================================================================ */
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
const HINT_SCOPE = [
  ["食堂", "canteen"], ["餐饮", "canteen"], ["饭堂", "canteen"],
  ["宿舍", "dorm"], ["住宿", "dorm"],
  ["办公", "down5"], ["行政", "down5"], ["管理费", "down5"],
  ["收入", "revenue"], ["营收", "revenue"], ["销售", "revenue"],
  ["绿化", "green"], ["环境", "green"], ["园林", "green"],
  ["业务量", "volume"], ["产量", "volume"],
  ["量价", "qtyPrice"], ["单价", "qtyPrice"],
  ["历史", "history"], ["持平", "history"],
  ["手工", "manual"], ["核定", "manual"],
  ["据实", "actual"], ["实报", "actual"],
];
function hintToScope(hint) {
  if (!hint) return null;
  for (const [kw, key] of HINT_SCOPE) {
    if (hint.indexOf(kw) >= 0) return key;
  }
  return null;
}
function extractRuleProposals(db, text) {
  const proposals = [];
  if (!text) return proposals;
  const re = /([一-龥A-Za-z·]+?)\s*(下调|下降|降低|降)\s*(\d+(?:\.\d+)?)\s*%/g;
  let m;
  while ((m = re.exec(text))) {
    const hint = m[1];
    const pct = parseFloat(m[3]);
    proposals.push({
      hint, pct,
      factor: Math.round((1 - pct / 100) * 1000) / 1000,
      logic: "较现行下降 " + pct + "%",
      scopeKey: hintToScope(hint),
    });
  }
  if (/据实/.test(text) && !proposals.some((p) => p.scopeKey === "actual"))
    proposals.push({ hint: "据实类科目", pct: 0, factor: 1.0, logic: "据实申报", scopeKey: "actual" });
  return proposals;
}

/* ================================================================
 * 规则版本删除 + 适用经济事项映射（2026-08-25 预算规则三 Tab 重构）
 *  - deleteRuleVersion：active 不可删（保证系统始终 1 个生效版本），其余事务删除
 *  - getEventMap / putEventMap：按规则卡（scopeKey）关联 account_subject 主数据，落库
 * ================================================================ */

/* 删除版本：active 拦截；draft/archived 事务删除版本行 + 其预算条目 + 关联映射 */
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
function savePolicyDocument(db, body) {
  const versionId = body && body.versionId != null ? Number(body.versionId) : null;
  const filename = (body && body.filename) || "";
  const text = (body && body.text) || "";
  if (!filename && !text) return { error: "缺少文件内容" };
  const id = db.prepare(
    "INSERT INTO policy_document (version_id, filename, text) VALUES (?, ?, ?)"
  ).run(versionId, filename, text).lastInsertRowid;
  return { id, versionId, filename };
}

/* 返回某版本的「规则卡 → 关联科目」映射 [{scopeKey, subjectIds:[...]}] */
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

module.exports = {
  init, listEvents, getEvent, updateAmount, updateMonthly, DB_FILE,
  initUnits, listOrgs, listChildUnits, listUnitBudgets, summaryByCat, updateUnitBudgetReduction,
  initExecutions, seedExecutions, listExecutions, upsertExecution,
  getOrg, createOrg, updateOrg, deleteOrg, buildOrgTree, inferBuCode, seedBuCodes,
  initAuth, loginUser, getUserByToken, logoutSession, listRoles, buildOrgTree, listOrgUsers,
  listUsers, createUser, updateUser, hashPassword, verifyPassword,
  seedNotifications, listNotifications, markNotificationRead, markAllNotificationsRead, createNotification,
  migrateRuleVersions, listRuleVersions, cloneRuleVersion, updateRuleItems, publishRuleVersion, extractRuleProposals,
  deleteRuleVersion, getEventMap, putEventMap, savePolicyDocument,
  migrateSubjects, rowToSubject, listSubjects, getSubject, createSubject, updateSubject, deleteSubject,
  createEvent, updateEvent, deleteEvent,
  getOrg, createOrg, updateOrg, deleteOrg, migrateOrgTypeAndCenters, MANAGE_CENTERS,
};
