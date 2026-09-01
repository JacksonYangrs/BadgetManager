/** budget-compile module (auto-extracted from db.js) */
const { decomposeMonthly } = require("../pure-calc");

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

/* 单位预算数据标记：org_id → 记录数（收件箱无数据灰标用，2026-09-01） */
function orgBudgetFlags(db) {
  const m = {};
  db.prepare("SELECT org_id, COUNT(*) AS n FROM unit_budget GROUP BY org_id").all()
    .forEach((r) => { m[r.org_id] = r.n; });
  return m;
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

module.exports = {
  listUnitBudgets,
  orgBudgetFlags,
  summaryByCat,
  ubRowToEvent,
  updateUnitBudgetReduction,
};
