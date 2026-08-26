/** ai-policy-extract module (auto-extracted from db.js) */


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

module.exports = {
  HINT_SCOPE,
  extractRuleProposals,
  hintToScope,
  savePolicyDocument,
};
