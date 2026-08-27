/* ================================================================
 * copilot.js — Copilot 问答编排（受控动态 SQL + 回灌作答）
 * 流程：问题 → AI 生成查询 DSL（jsonMode）→ copilot-retrieval 白名单校验+参数化执行
 *       → 拿到脱敏数据 → 回灌 AI 组织自然语言 answer + evidence。
 * 依赖注入（__setDeps）便于测试：可注入假 chatCompletion / getActiveCredentials。
 * 红线⑦导出、⑧姓名脱敏在 prompt 与检索层双重约束。
 * ================================================================ */
const aiConfig = require("./ai-config");
const aiGateway = require("./ai-gateway");
const retrieval = require("./copilot-retrieval");

const TABLE_WHITELIST_HINT = Object.keys(retrieval.TABLES).join(", ");

const DSL_SYSTEM = `你是预算数据查询助手。根据用户问题，生成结构化查询 DSL（JSON 对象）。
只能引用以下白名单表：${TABLE_WHITELIST_HINT}。
输出严格格式：
{"tables":[表名],"fields":[列名],"filters":[{"field":列,"op":"= | > | < | >= | <= | != | LIKE | IN","value":值或数组}],"groupBy":[列],"orderBy":[{"field":列,"dir":"asc | desc"}],"limit":数字}
规则：① 只允许单表；② fields/op 必须在白名单内；③ 不要输出 SQL 字符串；④ 若问题无需查数据（如闲聊），返回 {"tables":[],"fields":[],"filters":[],"limit":0}。

业务术语映射（必须遵守）：
- 「去年 / 上年 / 决算的去年实际」→ 查 unit_budget 表，读 last_year 列（上年实际执行年值）；「去年预算」→ 读 last_budget 列。filters 用 cat LIKE 匹配科目名（如"食堂"→{"field":"cat","op":"LIKE","value":"食堂"}）。
- 「今年 / 本年 / 年度执行 / 已执行」→ 查 budget_execution 表（当年 1-12 月执行流水，month 列为 1-12 数字，无年份列，不可表达"去年"）。
- 「决算 / 预算执行情况」默认指 budget_execution 按 cat 分组汇总金额（fields 含 cat、month、amount；可用 groupBy:["cat"]）。
- 「预算 / 预算额 / 申报」→ unit_budget 表，读 amount 列（本年度预算）。
- 科目名（食堂、宿舍、办公、差旅、绿化、物业等）一律用 cat LIKE 过滤，不建新字段。
- 单位/部门名（如"股份""氮化镓"）→ 先查 organization 表 name LIKE 定位 id，再用该 id 过滤目标表 org_id（跨表时用两次 DSL 调用，不要 join）。

只输出 JSON，不要其他任何内容。`;

const ANSWER_SYSTEM = `你是预算 Copilot。基于已脱敏的查询结果，用简体中文回答用户问题。
严格要求：① 不得输出任何真实个人姓名，涉及个人一律用「此人」或星号代替；
② 不得建议或协助导出数据（不提 Excel / CSV / 复制整表 / 下载）；
③ 只基于给定数据作答，不得编造；
④ 若数据为空，说明未查到相关信息，并建议联系人工核对。`;

let _deps = null;
function __setDeps(d) { _deps = d; }
function deps() { return _deps || { aiConfig, aiGateway }; }

async function generateDSL(question, creds) {
  const content = await deps().aiGateway.chatCompletion({
    provider: creds.provider, apiKey: creds.apiKey, model: creds.model, baseUrl: creds.baseUrl,
    messages: [{ role: "system", content: DSL_SYSTEM }, { role: "user", content: question }],
    jsonMode: true,
  });
  try {
    return JSON.parse(content);
  } catch (e) {
    const arrMatch = content.match(/\{[\s\S]*\}/);
    if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch (_) {} }
    throw new Error("AI 未返回合法 DSL");
  }
}

async function organizeAnswer(question, rows, creds) {
  const dataText = JSON.stringify(rows).slice(0, 4000);
  const content = await deps().aiGateway.chatCompletion({
    provider: creds.provider, apiKey: creds.apiKey, model: creds.model, baseUrl: creds.baseUrl,
    messages: [
      { role: "system", content: ANSWER_SYSTEM },
      { role: "user", content: "问题：" + question + "\n\n查询结果（已脱敏）：\n" + dataText + "\n\n请给出自然语言回答：" },
    ],
  });
  return typeof content === "string" ? content : String(content || "");
}

/* 主入口：返回 { answer, evidence }；异常由调用方捕获回退 */
async function askCopilot(db, { question, allowedOrgIds, creds }) {
  const dsl = await generateDSL(question, creds);
  if (!dsl || !Array.isArray(dsl.tables) || dsl.tables.length === 0) {
    // 无需查数 → 直接让 LLM 基于通用知识作答（仍受脱敏/不导出约束）
    return { answer: await organizeAnswer(question, [], creds), evidence: [] };
  }
  const rows = retrieval.runQuery(db, dsl, allowedOrgIds); // 校验+执行+脱敏
  const answer = await organizeAnswer(question, rows, creds);
  return { answer, evidence: rows.slice(0, 50) };
}

module.exports = { askCopilot, generateDSL, organizeAnswer, __setDeps, TABLE_WHITELIST_HINT };
