/* ================================================================
 * test_calc.js — BM.calc.tuneNegotiation 确定性单测（Node 运行）
 * 运行：node website/tests/test_calc.js
 * 验证：金额 / 比率 / 压降 / 对标 计算确定性、边界正确、可复现。
 * ================================================================ */
const assert = require("assert");
const calc = require("../core/calc.js");

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log("  ✓ " + name); }
  catch (e) { fail++; console.log("  ✗ " + name + " → " + e.message); }
}

console.log("BM.calc.tuneNegotiation 单测");

/* 1. 基本压降：申报 120 万，基线 114 万，压降 10% → 确认 108 万 */
check("基本压降计算", () => {
  const r = calc.tuneNegotiation({ baseline: 1140000, apply: 1200000, reductionRatio: 0.1, benchmark: [1100000, 1140000, 980000] });
  assert.strictEqual(r.cut, 120000);
  assert.strictEqual(r.agreed, 1080000);
  assert.strictEqual(r.diffApply, 60000);
  assert.ok(Math.abs(r.diffApplyPct - 60000 / 1140000) < 1e-9);
});

/* 2. 确定性：同入参两次结果完全一致 */
check("确定性（可复现）", () => {
  const a = calc.tuneNegotiation({ baseline: 1140000, apply: 1200000, reductionRatio: 0.1, benchmark: [1, 2, 3] });
  const b = calc.tuneNegotiation({ baseline: 1140000, apply: 1200000, reductionRatio: 0.1, benchmark: [1, 2, 3] });
  assert.deepStrictEqual(a, b);
});

/* 3. 比率边界：ratio>1 被夹到 1，<0 夹到 0 */
check("压降比率边界夹紧", () => {
  const r = calc.tuneNegotiation({ baseline: 100, apply: 200, reductionRatio: 5, benchmark: [] });
  assert.strictEqual(r.ratio, 1);
  assert.strictEqual(r.cut, 200);
  assert.strictEqual(r.agreed, 0);
  const r2 = calc.tuneNegotiation({ baseline: 100, apply: 200, reductionRatio: -1, benchmark: [] });
  assert.strictEqual(r2.ratio, 0);
  assert.strictEqual(r2.agreed, 200);
});

/* 4. 可压降空间：申报不超建议 → 0 */
check("可压降空间=0（申报未超建议）", () => {
  const r = calc.tuneNegotiation({ baseline: 1140000, apply: 1000000, reductionRatio: 0.1, benchmark: [] });
  assert.strictEqual(r.reducible, 0);
  assert.strictEqual(r.diffApply, -140000);
});

/* 5. 共识判定：协商后差异比例 ≤ 5% → accepted */
check("共识判定阈值", () => {
  /* 基线 100，确认 104 → 差异 4% → 可共识 */
  const r = calc.tuneNegotiation({ baseline: 100, apply: 100, reductionRatio: 0, benchmark: [], acceptThreshold: 0.05 });
  /* 申报=基线，确认=基线，差异 0% */
  assert.strictEqual(r.accepted, true);
  /* 基线 100，确认 110 → 10% → 不共识 */
  const r2 = calc.tuneNegotiation({ baseline: 100, apply: 110, reductionRatio: 0, benchmark: [], acceptThreshold: 0.05 });
  assert.strictEqual(r2.accepted, false);
});

/* 6. 对标分位与均值 */
check("对标分位/均值", () => {
  const bm = [200, 400, 600, 800, 1000];
  const r = calc.tuneNegotiation({ baseline: 600, apply: 600, reductionRatio: 0, benchmark: bm });
  assert.strictEqual(r.bmAvg, 600);
  assert.strictEqual(r.bmMin, 200);
  assert.strictEqual(r.bmMax, 1000);
  /* agreed=600 → 位置 (600-200)/(1000-200)=0.5 */
  assert.ok(Math.abs(r.position - 0.5) < 1e-9);
});

/* 7. 空对标样本不报错 */
check("空对标样本安全", () => {
  const r = calc.tuneNegotiation({ baseline: 100, apply: 120, reductionRatio: 0.1, benchmark: [] });
  assert.strictEqual(r.bmAvg, 0);
  assert.strictEqual(r.position, 0.5);
});

/* 8. tuneBounds 边界合理 */
check("tuneBounds 边界", () => {
  const b = calc.tuneBounds(1000000);
  assert.strictEqual(b.applyMin, 600000);
  assert.strictEqual(b.applyMax, 1400000);
  assert.ok(b.applyStep > 0);
  assert.strictEqual(b.ratioMax, 0.3);
});

/* ================================================================
 * 阶段一目标一 新增：编制/分解/压降/风险 确定性单测
 * ================================================================ */

console.log("\nBM.calc 编制/分解/压降/风险 单测");

/* 9. 九法编制 — 各方法返回确定性金额与说明 */
check("compileByMethod · 历史/同比/固定", () => {
  const h = calc.compileByMethod({ method: "history", lastYear: 1000000 });
  assert.strictEqual(h.amount, 1000000);
  const y = calc.compileByMethod({ method: "yoy", lastYear: 1000000, growth: 1.05 });
  assert.strictEqual(y.amount, 1050000);
  const f = calc.compileByMethod({ method: "fixed", lastYear: 1004900 });
  assert.strictEqual(f.amount, 1000000); /* 取整到万元 */
  const m = calc.compileByMethod({ method: "manual", manualAmount: 1234567 });
  assert.strictEqual(m.amount, 1234567);
});

check("compileByMethod · 数量×单价/人均/业务量/管理标准/关键事件", () => {
  assert.strictEqual(calc.compileByMethod({ method: "qtyPrice", qty: 100, price: 50 }).amount, 5000);
  assert.strictEqual(calc.compileByMethod({ method: "perCapita", headcount: 50, perCapita: 200 }).amount, 10000);
  assert.strictEqual(calc.compileByMethod({ method: "volume", volume: 30, unitCost: 8000 }).amount, 240000);
  assert.strictEqual(calc.compileByMethod({ method: "manageStd", manageBaseline: 760000 }).amount, 760000);
  assert.strictEqual(calc.compileByMethod({ method: "keyEvent", lastYear: 500000, eventDelta: 40000 }).amount, 540000);
});

check("compileByMethod · 未选方法返回 0", () => {
  assert.strictEqual(calc.compileByMethod({}).amount, 0);
});

/* 10. 月度分解 — 12 项且和严格等于年度额（确定性） */
check("decomposeMonthly · 和=年度额", () => {
  const a = 1200000;
  const months = calc.decomposeMonthly(a);
  assert.strictEqual(months.length, 12);
  assert.strictEqual(months.reduce((x, y) => x + y, 0), a);
});

check("decomposeMonthly · 确定性可复现 + 自定义权重", () => {
  const w = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const m1 = calc.decomposeMonthly(1200000, w);
  const m2 = calc.decomposeMonthly(1200000, w);
  assert.deepStrictEqual(m1, m2);
  /* 等权 → 每月 100000 */
  assert.ok(m1.every((x) => x === 100000));
});

/* 11. 压降：基线 ×(1-比率) */
check("applyReduction · 基本与边界", () => {
  assert.strictEqual(calc.applyReduction(1000000, 0.1), 900000);
  assert.strictEqual(calc.applyReduction(1000000, 0), 1000000);
  assert.strictEqual(calc.applyReduction(1000000, 1), 0);
  assert.strictEqual(calc.applyReduction(1000000, 2), 0); /* 比率>1 夹紧 */
  assert.strictEqual(calc.applyReduction(-5000, 0.1), 0); /* 负值夹 0 */
});

/* 12. 风险等级判定（确定性、可解释） */
check("riskLevel · 高/中/低", () => {
  assert.strictEqual(calc.riskLevel(0.9, 0.2), "高"); /* 高置信 + 大偏离 */
  assert.strictEqual(calc.riskLevel(0.75, 0.05), "中"); /* 中置信 */
  assert.strictEqual(calc.riskLevel(0.6, 0.12), "中"); /* 大偏离 */
  assert.strictEqual(calc.riskLevel(0.6, 0.03), "低"); /* 低置信 + 小偏离 */
  assert.strictEqual(calc.riskLevel(0.85, 0.05), "中"); /* 高置信但偏离小 → 仍中（置信优先） */
});

/* 13. 风险汇总（确定性统计） */
check("riskSummary · 计数与可压降合计", () => {
  const list = [
    { baseline: 1000000, suggestAmount: 900000, confidence: 0.9 }, /* 高 */
    { baseline: 500000, suggestAmount: 460000, confidence: 0.72 }, /* 中 */
    { baseline: 300000, suggestAmount: 300000, confidence: 0.5 },  /* 低 */
  ];
  const s = calc.riskSummary(list);
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.byLevel["高"], 1);
  assert.strictEqual(s.byLevel["中"], 1);
  assert.strictEqual(s.byLevel["低"], 1);
  assert.strictEqual(s.saveTotal, 140000); /* (100-90)+(50-46)+(30-30)=14万 */
});

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
