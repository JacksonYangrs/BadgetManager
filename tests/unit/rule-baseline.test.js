/* ================================================================
 * rule-baseline.test.js — Suite E · 规则基线口径一致性（前后端契约）
 * 后端：server/pure-rule.js 的 compileBaseline / aiSuggestion
 *        （server/db.js 转发，注入 DB 驱动的 RULE_FACTORS；默认回退 HARDCODED_FACTORS）
 * 前端：website/data/data.js 的 BM.applyRule
 *       website/core/calc.js 的 BM.calc.compileByMethod（manageStd 取 manageBaseline）
 * 锁定的合同：
 *   1) 每个规则类型 type 的前端基线因子 == 后端 HARDCODED_FACTORS（down5 0.95 … actual 1.0）
 *   2) 后端 aiSuggestion 的 lo/hi/mid 由 baseline 派生（lo=base*0.9, hi=base*1.05）
 *   3) 前端 compileByMethod(manageStd, baseline) 不改动基线（amount === baseline）
 * 纯函数，无需 node:sqlite；与 Suite D 共同构成「前/后/移动三端合同口径」防线。
 * ================================================================ */
const { BM, suite, check } = require("./harness");
const assert = require("assert");
const path = require("path");
const { compileBaseline, aiSuggestion, HARDCODED_FACTORS } = require(path.resolve(__dirname, "../../server/pure-rule"));

function feBaseline(rule) {
  const r = BM.applyRule(rule.cat, rule.lastYear);
  return r.ok ? r.baseline : null;
}

suite("Suite E · 规则基线口径一致性（前端 BM.applyRule / compileByMethod vs 后端 compileBaseline / aiSuggestion）", () => {
  /* 1) 逐规则（有历史）：前端基线 == 后端 manageStd 基线（因子锁） */
  BM.RULES.forEach((rule) => {
    if (rule.lastYear == null) return; /* 无历史（据实类）跳过：见 #5 文档化约定 */
    check("规则[" + rule.cat + "] 前端基线 == 后端 manageStd 基线", () => {
      const fe = feBaseline(rule);
      const be = compileBaseline("manageStd", rule.type, rule.lastYear);
      assert.strictEqual(fe, be, rule.cat + " 基线不一致：前端 " + fe + " / 后端 " + be);
    });
  });

  /* 2) 后端 aiSuggestion 的 lo/hi/mid 由 baseline 确定性派生 */
  BM.RULES.forEach((rule) => {
    if (rule.lastYear == null) return;
    check("AI 建议[" + rule.cat + "] lo/hi/mid 由基线派生", () => {
      const base = compileBaseline("manageStd", rule.type, rule.lastYear);
      const ai = aiSuggestion(rule.cat, rule.type, rule.lastYear);
      assert.strictEqual(ai.lo, Math.round(base * 0.9));
      assert.strictEqual(ai.hi, Math.round(base * 1.05));
      assert.strictEqual(ai.mid, Math.round((ai.lo + ai.hi) / 2));
    });
  });

  /* 3) 前端 compileByMethod(manageStd) 原样采用基线（不二次折算） */
  BM.RULES.forEach((rule) => {
    if (rule.lastYear == null) return; /* 无历史（据实类）跳过：见 #5 文档化约定 */
    check("compileByMethod(manageStd) 原样采用基线[" + rule.cat + "]", () => {
      const fe = feBaseline(rule);
      const amt = BM.calc.compileByMethod({ method: "manageStd", manageBaseline: fe }).amount;
      assert.strictEqual(amt, fe);
    });
  });

  /* 4) 因子表锁：前端 applyRule 的 6 类因子与后端 HARDCODED_FACTORS 逐项相等（防静默漂移） */
  const EXPECT = { down5: 0.95, canteen: 0.97, dorm: 0.90, revenue: 0.98, green: 0.92, actual: 1.0 };
  Object.keys(EXPECT).forEach((type) => {
    check("因子[" + type + "] 前端 == 后端 HARDCODED_FACTORS", () => {
      assert.strictEqual(HARDCODED_FACTORS[type], EXPECT[type]);
      // 用 applyRule 反推：构造同名 lastYear=1000000 验证因子生效
      const cat = (BM.RULES.find((r) => r.type === type) || {}).cat;
      if (cat) assert.strictEqual(BM.applyRule(cat, 1000000).baseline, Math.round(1000000 * EXPECT[type]));
    });
  });

  /* 5) 无历史基线约定（据实类 lastYear=null）：前端返回 null（无基线），
   *    后端经 createEvent 实际调用时传入 lastYear||0 回退为 0（占位）。
   *    二者都表示「无基线」，差异是占位 0 vs null，非因子漂移，显式记录以免误报。 */
  check("据实类(无历史) 前端基线为 null（无基线）", () => {
    assert.strictEqual(BM.applyRule("按实际预算类", null).baseline, null);
  });
  check("据实类(无历史) 后端基线回退 0（占位，与 createEvent 的 lastYear||0 一致）", () => {
    assert.strictEqual(compileBaseline("manageStd", "actual", null), 0);
  });
});
