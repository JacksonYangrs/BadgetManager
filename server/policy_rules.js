/* ================================================================
 * policy_rules.js — 预算政策 → 年度预算规则生成模块（独立模块）
 * 与 server.js 解耦：仅通过 buildPolicyRules(dbm).attach(app, db) 挂载路由。
 * 职责：基于当前 active 规则版本，按政策因子生成下一年度草案规则（版本化）。
 * 当前为生成/建议层（不直接覆盖 active 版本），经人复核后可调用 publishRuleVersion 生效。
 * ================================================================ */
const { buildAuth } = require("./middleware/auth");

function buildPolicyRules(dbm) {
  /* 政策因子兜底（与前端 BM.CTRL_FACTORS / DES-0005 口径待对齐） */
  const FACTOR_BY_METHOD = { down5: 0.95, canteen: 1, dorm: 1, revenue: 1, green: 1, actual: 1, history: 1, qtyPrice: 1, volume: 1 };

  /* 生成下一年度草案：沿用 active 版本各条目，按政策因子推演基线 */
  function generate(db, opts) {
    opts = opts || {};
    const versions = dbm.listRuleVersions ? dbm.listRuleVersions(db) : [];
    const active = versions.find((v) => v.status === "active") || versions[0];
    if (!active) return { error: "无可用规则版本，请先建立预算规划" };
    const year = opts.year || (new Date().getFullYear() + 1);
    const items = (active.items || []).map((it) => {
      const factor = it.factor != null ? Number(it.factor) : (FACTOR_BY_METHOD[it.method] != null ? FACTOR_BY_METHOD[it.method] : 1);
      const base = Number(it.value) || 0;
      const proposedBaseline = Math.round(base * factor);
      return {
        category: it.category,
        scopeKey: it.scope_key,
        method: it.method,
        factor: factor,
        prevBaseline: base,
        proposedBaseline: proposedBaseline,
        delta: proposedBaseline - base,
        rationale: "沿用「" + active.version + "」基线 × 政策因子 " + factor,
      };
    });
    return {
      ok: true,
      year: year,
      sourceVersion: active.version,
      name: opts.name || ("基于 " + active.version + " 的 " + year + " 年草案"),
      note: opts.note || "",
      items: items,
    };
  }

  function attach(app, db) {
    const { auth, requireFinance } = buildAuth(dbm, db);
    /* 生成下一年度规则草案（不直接生效，返回供人复核） */
    app.post("/api/policy/generate", auth, requireFinance, (req, res) => {
      const out = generate(db, req.body || {});
      if (out.error) return res.status(400).json(out);
      res.json(out);
    });

    /* 预览：不落库，仅返回推演结果 */
    app.get("/api/policy/preview", auth, (req, res) => {
      const out = generate(db, { year: req.query.year ? parseInt(req.query.year, 10) : undefined });
      if (out.error) return res.status(400).json(out);
      res.json(out);
    });
  }

  return { generate, attach };
}

module.exports = buildPolicyRules;
