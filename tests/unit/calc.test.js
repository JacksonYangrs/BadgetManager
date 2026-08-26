/* ================================================================
 * calc.test.js — Suite A：BM.calc 确定性内核（补充 website/tests/test_calc.js）
 * 聚焦边界值 / 异常分支 / 夹紧 / 共识阈值 / 对标分布 等尚未覆盖的点。
 * 运行：node tests/unit/run.js  （由 run.js 自动加载）
 * ================================================================ */
const assert = require("assert");
const { BM, check, suite, reset } = require("./harness");
const calc = BM.calc;

suite("Suite A · calc.js 边界/异常分支扩展", () => {

  /* ---- tuneNegotiation 边界与夹紧 ---- */
  check("零值输入：baseline/apply/ratio 全 0", () => {
    const r = calc.tuneNegotiation({ baseline: 0, apply: 0, reductionRatio: 0, benchmark: [] });
    assert.strictEqual(r.cut, 0);
    assert.strictEqual(r.agreed, 0);
    assert.strictEqual(r.diffApply, 0);
    assert.strictEqual(r.accepted, true); // 差异 0% <= 5%
    assert.strictEqual(r.position, 0.5); // bmMax=bmMin=0 → 0.5
  });

  check("负值输入被夹紧为 0", () => {
    const r = calc.tuneNegotiation({ baseline: -5, apply: -5, reductionRatio: -1, benchmark: [] });
    assert.strictEqual(r.baseline, 0);
    assert.strictEqual(r.apply, 0);
    assert.strictEqual(r.ratio, 0);
    assert.strictEqual(r.cut, 0);
    assert.strictEqual(r.agreed, 0);
  });

  check("超大值：ratio=1 → 确认额=0", () => {
    const r = calc.tuneNegotiation({ baseline: 1e9, apply: 1e9, reductionRatio: 1, benchmark: [] });
    assert.strictEqual(r.cut, 1e9);
    assert.strictEqual(r.agreed, 0);
  });

  check("共识阈值边界：差异恰好 5% → 可共识；5.01% → 不可", () => {
    const a = calc.tuneNegotiation({ baseline: 100, apply: 105, reductionRatio: 0, benchmark: [], acceptThreshold: 0.05 });
    assert.strictEqual(a.diffAgreedPct, 0.05);
    assert.strictEqual(a.accepted, true);
    const b = calc.tuneNegotiation({ baseline: 100, apply: 106, reductionRatio: 0, benchmark: [], acceptThreshold: 0.05 });
    assert.strictEqual(b.diffAgreedPct, 0.06);
    assert.strictEqual(b.accepted, false);
  });

  check("对标位置夹紧：确认额越界 → 0 或 1", () => {
    const lo = calc.tuneNegotiation({ baseline: 150, apply: 50, reductionRatio: 0, benchmark: [100, 200] });
    assert.strictEqual(lo.position, 0); // agreed(50) < bmMin(100)
    const hi = calc.tuneNegotiation({ baseline: 150, apply: 300, reductionRatio: 0, benchmark: [100, 200] });
    assert.strictEqual(hi.position, 1); // agreed(300) > bmMax(200)
  });

  check("对标均值偏离符号：高于均值→正，低于→负", () => {
    const r = calc.tuneNegotiation({ baseline: 150, apply: 200, reductionRatio: 0, benchmark: [100, 200] });
    // bmAvg=150, agreed=200 → devFromAvg = (200-150)/150
    assert.ok(Math.abs(r.devFromAvg - 50 / 150) < 1e-9);
    assert.ok(r.devFromAvg > 0);
  });

  check("单元素对标样本：min=max → position 0.5", () => {
    const r = calc.tuneNegotiation({ baseline: 5, apply: 5, reductionRatio: 0, benchmark: [5] });
    assert.strictEqual(r.bmAvg, 5);
    assert.strictEqual(r.bmMin, 5);
    assert.strictEqual(r.bmMax, 5);
    assert.strictEqual(r.position, 0.5);
  });

  /* ---- tuneBounds ---- */
  check("tuneBounds · baseline=0 边界", () => {
    const b = calc.tuneBounds(0);
    assert.strictEqual(b.applyMin, 0);
    assert.strictEqual(b.applyMax, 0);
    assert.strictEqual(b.applyStep, 1000); // max(1000, 0)
    assert.strictEqual(b.ratioMax, 0.3);
  });

  check("tuneBounds · baseline=2,000,000", () => {
    const b = calc.tuneBounds(2000000);
    assert.strictEqual(b.applyMin, 1200000);
    assert.strictEqual(b.applyMax, 2800000);
    assert.strictEqual(b.applyStep, 20000); // round(2,000,000*0.01)
  });

  /* ---- compileByMethod 缺参/边界 ---- */
  check("compileByMethod · history 缺 lastYear → 0", () => {
    assert.strictEqual(calc.compileByMethod({ method: "history" }).amount, 0);
  });

  check("compileByMethod · yoy 默认增长 1.05", () => {
    assert.strictEqual(calc.compileByMethod({ method: "yoy", lastYear: 1000000 }).amount, 1050000);
  });

  check("compileByMethod · fixed 取整到万元（最近 10000）边界", () => {
    // 注：万元 = 10000；公式 round(lastYear/10000)*10000
    assert.strictEqual(calc.compileByMethod({ method: "fixed", lastYear: 14999 }).amount, 10000);
    assert.strictEqual(calc.compileByMethod({ method: "fixed", lastYear: 15000 }).amount, 20000);
    assert.strictEqual(calc.compileByMethod({ method: "fixed", lastYear: 9999 }).amount, 10000);
  });

  check("compileByMethod · manual 缺 manualAmount → 0", () => {
    assert.strictEqual(calc.compileByMethod({ method: "manual" }).amount, 0);
  });

  check("compileByMethod · 未知方法 → 0 + 未定义说明", () => {
    const r = calc.compileByMethod({ method: "nope" });
    assert.strictEqual(r.amount, 0);
    assert.ok(r.note.indexOf("未定义") >= 0);
  });

  /* ---- decomposeMonthly ---- */
  check("decomposeMonthly · annual=0 → 全 0", () => {
    const m = calc.decomposeMonthly(0);
    assert.strictEqual(m.length, 12);
    assert.strictEqual(m.reduce((a, b) => a + b, 0), 0);
    assert.ok(m.every((x) => x === 0));
  });

  check("decomposeMonthly · 负数年度额仍和=年度额（确定性）", () => {
    const m = calc.decomposeMonthly(-5000);
    assert.strictEqual(m.length, 12);
    assert.strictEqual(m.reduce((a, b) => a + b, 0), -5000);
  });

  check("decomposeMonthly · 权重长度≠12 → 回退默认", () => {
    const m = calc.decomposeMonthly(1200000, [1, 1, 1, 1, 1, 1]); // 6 项
    assert.strictEqual(m.length, 12);
    assert.strictEqual(m.reduce((a, b) => a + b, 0), 1200000);
  });

  check("decomposeMonthly · 等权 → 每月相等", () => {
    const m = calc.decomposeMonthly(1200000, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.ok(m.every((x) => x === 100000));
  });

  /* ---- applyReduction ---- */
  check("applyReduction · 负比率夹紧→返回基线", () => {
    assert.strictEqual(calc.applyReduction(1000000, -0.5), 1000000);
  });
  check("applyReduction · 半压降 & 负值基线夹 0", () => {
    assert.strictEqual(calc.applyReduction(1000000, 0.5), 500000);
    assert.strictEqual(calc.applyReduction(-5000, 0.1), 0);
  });

  /* ---- riskLevel ---- */
  check("riskLevel · confidence=null 视作 0", () => {
    assert.strictEqual(calc.riskLevel(null, 0.2), "中"); // 0>=0.8?否；0>=0.1?是 → 中
  });
  check("riskLevel · 高置信小偏离 → 中（置信优先）", () => {
    assert.strictEqual(calc.riskLevel(0.85, 0.05), "中");
  });
  check("riskLevel · 高置信+超阈值偏离 → 高", () => {
    assert.strictEqual(calc.riskLevel(0.85, 0.10), "高");
  });
  check("riskLevel · 低置信小偏离 → 低", () => {
    assert.strictEqual(calc.riskLevel(0.6, 0.03), "低");
  });

  /* ---- riskSummary ---- */
  check("riskSummary · 空列表安全", () => {
    const s = calc.riskSummary([]);
    assert.strictEqual(s.count, 0);
    assert.deepStrictEqual(s.byLevel, { 高: 0, 中: 0, 低: 0 });
    assert.strictEqual(s.saveTotal, 0);
  });
  check("riskSummary · 建议额>基线 → 负可压降合计", () => {
    const list = [{ baseline: 100, suggestAmount: 120, confidence: 0.5 }];
    const s = calc.riskSummary(list);
    assert.strictEqual(s.count, 1);
    assert.strictEqual(s.byLevel["中"], 1); // dev 0.2>=0.1 → 中
    assert.strictEqual(s.saveTotal, -20); // (100-120)
  });

});
