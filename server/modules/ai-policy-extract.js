/** ai-policy-extract module (auto-extracted from db.js) */
const aiConfig = require("./ai-config");
const aiGateway = require("./ai-gateway");

/* ================================================================
 * 政策文本 → 规则草案抽取
 *  - 设计：AI 经 prompt 抽取结构化字段（scopeKey/pct/logic/hint），后端校验 + 路由 A/B；
 *    AI 不直接写库、不拼 SQL、不碰明文密钥。
 *  - 红线：AI 未配置 / 调用失败 / 返回非法 → 一律回退确定性正则兜底，页面永不报错。
 *  - 路由 A（调参数）：scopeKey 命中 active 版本现有规则卡词典 → 更新 factor。
 *  - 路由 B（造新卡）：scopeKey 未命中 → 标记为 isNew，由人核对后发布为全新规则卡。
 * ================================================================ */

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

/* ---------- 确定性正则兜底（行为不变） ---------- */
function extractRegex(text) {
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
      isNew: false,
    });
  }
  if (/据实/.test(text) && !proposals.some((p) => p.scopeKey === "actual"))
    proposals.push({ hint: "据实类科目", pct: 0, factor: 1.0, logic: "据实申报", scopeKey: "actual", isNew: false });
  return proposals;
}

/* ---------- 现有规则卡词典（active 版本的 DISTINCT scope_key） ---------- */
function knownScopeKeys(db) {
  if (!db) return new Set(HINT_SCOPE.map(([, k]) => k));
  try {
    const row = db.prepare("SELECT id FROM budget_rule_version WHERE status = 'active' LIMIT 1").get();
    if (row) {
      const rows = db.prepare("SELECT DISTINCT scope_key FROM budget_rule_item WHERE version_id = ?").all(row.id);
      const s = new Set(rows.map((r) => r.scope_key).filter(Boolean));
      if (s.size) return s;
    }
  } catch (e) { /* 表不存在等 → 用内置枚举兜底 */ }
  return new Set(HINT_SCOPE.map(([, k]) => k));
}

/* ---------- AI 抽取（仅抽取，后端校验 + 路由） ---------- */
const SYSTEM_PROMPT = `你是预算政策抽取器。请从政策文本中抽取「预算压降/调整事项」。

只输出一个 JSON 对象，格式严格为：
{"proposals":[{"scopeKey":字符串,"pct":数字,"logic":字符串,"hint":字符串}]}

字段说明：
- scopeKey：该事项对应的预算规则卡键。若属于已知科目请用已知键之一：canteen(食堂/餐饮)、dorm(宿舍/住宿)、down5(办公/行政/管理费)、revenue(收入/营收/销售)、green(绿化/环境/园林)、volume(业务量/产量)、qtyPrice(量价/单价)、history(历史/持平)、manual(手工/核定)、actual(据实/实报)；若文本出现全新的事项类别，用简洁英文新词作为 scopeKey。
- pct：下降/压降百分比（数字，如 5 表示下降5%）。若是「据实/持平/不降」则 pct 为 0。
- logic：一句话依据（中文）。
- hint：原文中触发该事项的关键词。

不要输出 JSON 对象以外的任何内容。`;

async function extractWithAI(text, creds, db) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
  const content = await deps().aiGateway.chatCompletion({
    provider: creds.provider, apiKey: creds.apiKey, model: creds.model,
    messages, jsonMode: true,
  });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // 兼容：模型偶尔返回裸数组而非对象
    const arrMatch = content.match(/\[[\s\S]*\]/);
    if (arrMatch) { try { parsed = { proposals: JSON.parse(arrMatch[0]) }; } catch (_) { parsed = null; } }
    if (!parsed) throw new Error("AI 返回非 JSON");
  }
  const list = Array.isArray(parsed) ? parsed : parsed.proposals;
  if (!Array.isArray(list)) throw new Error("AI 返回缺少 proposals 数组");

  const known = knownScopeKeys(db);
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const scopeKey = typeof item.scopeKey === "string" ? item.scopeKey.trim() : "";
    const pct = Number(item.pct);
    // 后端校验：scopeKey 必为字符串、pct 必须为 0–100 数值，否则丢弃该条目
    if (!scopeKey || !isFinite(pct) || pct < 0 || pct > 100) continue;
    const factor = Math.round((1 - pct / 100) * 1000) / 1000;
    out.push({
      hint: typeof item.hint === "string" ? item.hint : scopeKey,
      pct,
      factor,
      logic: typeof item.logic === "string" ? item.logic : ("较现行下降 " + pct + "%"),
      scopeKey,
      isNew: !known.has(scopeKey), // 路由 B：未命中现有词典 → 造新卡
    });
  }
  if (!out.length) throw new Error("AI 未抽取到有效事项");
  return out;
}

/* ---------- 统一入口（async，内置回退） ---------- */
async function extractRuleProposals(db, text) {
  const creds = deps().aiConfig.getActiveCredentials(db);
  if (creds) {
    try {
      const ai = await extractWithAI(text, creds, db);
      if (ai && ai.length) return ai;
    } catch (e) {
      // AI 失败/空 → 回退正则，绝不抛给前端
    }
  }
  return extractRegex(text);
}

/* ---------- 依赖注入（测试用，可注入假 chatCompletion / getActiveCredentials） ---------- */
let _deps = null;
function __setDeps(d) { _deps = d; }
function deps() {
  return _deps || { aiConfig, aiGateway };
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
  extractRegex,
  hintToScope,
  knownScopeKeys,
  savePolicyDocument,
  __setDeps,
};
