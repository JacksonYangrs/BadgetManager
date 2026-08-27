/* ================================================================
 * copilot-retrieval.js — 受控动态 SQL 检索层（与 LLM 解耦）
 * 职责：对 AI 生成的查询 DSL 做「白名单校验 + 参数化翻译 + 执行 + 脱敏」。
 *   - 不懂业务语义；业务语义在 AI 生成的 DSL 里。
 *   - 红线（按严格度）：①组织/行级授权（强制注入 org 过滤）
 *     ②表白名单 ③字段/操作符白名单 ④全参数化（零字符串拼接）
 *     ⑤屏蔽敏感字段（白名单本身不含 password/key/secret）⑥只读 SELECT
 *     ⑦仅展示不导出（本层不产出文件，调用方亦不提供导出）⑧个人姓名字段脱敏
 *   - 任一条不通过 → 抛 CopilotReject，由调用方回退兜底/「建议联系人工」。
 * ================================================================ */

/* 白名单业务表 + 允许列 + 组织列（orgColumn=null 表示全局参考表，不按 org 过滤） */
const TABLES = {
  unit_budget: {
    columns: ["id", "org_id", "cat", "acct_code", "amount", "monthly", "last_budget", "last_year", "method", "ai", "reduce_ratio", "reduce_amount", "note"],
    orgColumn: "org_id",
  },
  budget_execution: {
    columns: ["id", "org_id", "cat", "month", "amount"],
    orgColumn: "org_id",
  },
  budget_rule_version: {
    columns: ["id", "version", "name", "source_type", "source_ref", "effective_date", "status", "created_at", "created_by", "note"],
    orgColumn: null, // 全局政策，所有登录角色可见
  },
  budget_rule_item: {
    columns: ["id", "version_id", "category", "scope_type", "scope_key", "method", "factor", "value", "base_logic", "raw"],
    orgColumn: null,
  },
  rule_item_event: {
    columns: ["id", "version_id", "scope_key", "subject_id", "created_at"],
    orgColumn: null,
  },
  organization: {
    columns: ["id", "code", "name", "parent_id", "level", "bu_code", "type", "managed_center_id"],
    orgColumn: null, // 组织树参考，所有角色可见
  },
  policy_document: {
    columns: ["id", "version_id", "filename", "text", "created_at"],
    orgColumn: null,
  },
};

/* 红线⑧：需脱敏的个人姓名字段（按表） */
const MASK_COLUMNS = {
  budget_rule_version: new Set(["created_by"]),
};

const ALLOWED_OPS = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IN"];
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

class CopilotReject extends Error {
  constructor(reasons) {
    super("查询不合规：" + (Array.isArray(reasons) ? reasons.join("；") : reasons));
    this.reasons = reasons;
  }
}

function maskName(v) {
  if (v == null) return v;
  const s = String(v);
  if (s.length <= 1) return "***";
  return s.slice(0, 1) + "***";
}

/* 校验 DSL + 翻译为参数化 SQL（不执行） */
function validateAndBuild(dsl, allowedOrgIds) {
  const errors = [];
  dsl = dsl || {};
  const tables = Array.isArray(dsl.tables) ? dsl.tables : [];
  if (tables.length !== 1) errors.push("只允许单表查询（当前表数：" + tables.length + "）");
  const table = tables[0];
  const meta = table && TABLES[table];
  if (!meta) errors.push("表不在白名单：" + (table || "空"));

  let fields = Array.isArray(dsl.fields) && dsl.fields.length ? dsl.fields : ["*"];
  if (fields.includes("*")) fields = meta ? meta.columns.slice() : [];
  for (const f of fields) {
    if (!meta || !meta.columns.includes(f)) errors.push("字段不在白名单：" + (table || "?") + "." + f);
  }

  const wheres = [];
  const params = [];
  for (const flt of (dsl.filters || [])) {
    const field = flt && flt.field;
    const op = flt && flt.op ? String(flt.op).toUpperCase() : null;
    const value = flt && flt.value;
    if (!meta || !meta.columns.includes(field)) errors.push("过滤字段不在白名单：" + field);
    if (!ALLOWED_OPS.includes(op)) errors.push("操作符不在白名单：" + (flt && flt.op));
    if (op === "IN") {
      if (!Array.isArray(value) || !value.length) errors.push("IN 需非空数组");
      else { wheres.push(field + " IN (" + value.map(() => "?").join(",") + ")"); value.forEach((v) => params.push(v)); }
    } else if (op === "LIKE") {
      wheres.push(field + " LIKE ?");
      params.push("%" + String(value == null ? "" : value) + "%");
    } else if (op) {
      wheres.push(field + " " + op + " ?");
      params.push(value);
    }
  }

  // 红线①：组织/行级授权——强制注入（即便 AI 没写，或写了越权 org 也会被交集覆盖）
  if (meta && meta.orgColumn && Array.isArray(allowedOrgIds) && allowedOrgIds.length) {
    wheres.push(meta.orgColumn + " IN (" + allowedOrgIds.map(() => "?").join(",") + ")");
    allowedOrgIds.forEach((v) => params.push(v));
  }

  const groupBy = (dsl.groupBy || []).filter((c) => meta && meta.columns.includes(c));
  const orderBy = (dsl.orderBy || [])
    .filter((o) => o && meta && meta.columns.includes(o.field))
    .map((o) => o.field + " " + (String(o.dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC"));

  let limit = Number(dsl.limit);
  if (!isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  if (errors.length) throw new CopilotReject(errors);

  const sql =
    "SELECT " + fields.join(", ") +
    " FROM " + table +
    (wheres.length ? " WHERE " + wheres.join(" AND ") : "") +
    (groupBy.length ? " GROUP BY " + groupBy.join(", ") : "") +
    (orderBy.length ? " ORDER BY " + orderBy.join(", ") : "") +
    " LIMIT " + limit;

  return { sql, params, table, meta };
}

/* 脱敏（红线⑧）：对标记列做星号化 */
function maskRows(rows, table) {
  const maskSet = MASK_COLUMNS[table];
  if (!maskSet || !Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const out = Object.assign({}, row);
    for (const col of maskSet) {
      if (col in out) out[col] = maskName(out[col]);
    }
    return out;
  });
}

/* 校验 + 执行 + 脱敏（对外主入口） */
function runQuery(db, dsl, allowedOrgIds) {
  const { sql, params, table } = validateAndBuild(dsl, allowedOrgIds);
  const rows = db.prepare(sql).all(...params); // 参数化，零字符串拼接
  return maskRows(rows, table);
}

module.exports = {
  TABLES, MASK_COLUMNS, ALLOWED_OPS,
  CopilotReject, maskName,
  validateAndBuild, maskRows, runQuery,
};
