/* ================================================================
 * calc.js — 确定性计算内核（M5 碰撞调参 / 通用压降协商）
 * 设计约束（产品设计稿 V1 §3.0.4 / D3 原则）：
 *   - 金额 / 比率 / 压降 / 对标 一律由确定性计算给出，AI 不输出最终金额。
 *   - 本文件为「纯函数」，无随机、无 Date、无 DOM，可直接被 Node 单测。
 *   - 一期先前端本地模拟；生产环境基线/建议值由后端 CALC 服务返回，
 *     本文件的公式即为前后端共享的合同口径（见下方 TODO 标注）。
 * ================================================================ */

/* 兼容 Node（单测）与浏览器（window.BM） */
var BM = (typeof window !== "undefined" ? window.BM : global.BM = global.BM || {});

BM.calc = BM.calc || {};

/* ----------------------------------------------------------------
 * tuneNegotiation — 碰撞协商「即时反馈」核心计算
 * 入参：
 *   baseline        {number}  集团建议值（规则基线，确定性，来自后端 CALC）
 *   apply           {number}  子公司申报额（滑块可调）
 *   reductionRatio  {number}  压降比率 0~1（滑块可调，如 0.1 = 压降 10%）
 *   benchmark       {number[]} 同类公司同科目预算数组（用于横向对标）
 *   acceptThreshold {number}  达成「可共识」的差异阈值（默认 0.05 = 5%）
 * 返回：全部派生结果（确定性）
 * ---------------------------------------------------------------- */
BM.calc.tuneNegotiation = function (p) {
  var baseline = Math.max(0, Math.round(p.baseline || 0));
  var apply = Math.max(0, Math.round(p.apply || 0));
  var ratio = Math.min(1, Math.max(0, p.reductionRatio || 0));
  var threshold = p.acceptThreshold == null ? 0.05 : p.acceptThreshold;

  /* 压降幅度（金额）与协商确认额（确定性推导，无分支随机） */
  var cut = Math.round(apply * ratio);
  var agreed = apply - cut;

  /* 申报 vs 建议 的差异（压降前） */
  var diffApply = apply - baseline;
  var diffApplyPct = baseline ? diffApply / baseline : 0;

  /* 协商确认 vs 建议 的差异（压降后） */
  var diffAgreed = agreed - baseline;
  var diffAgreedPct = baseline ? diffAgreed / baseline : 0;

  /* 可压降空间：申报超出建议的部分，即总部最多可压的额度（申报不超建议则为 0） */
  var reducible = Math.max(apply - baseline, 0);

  /* ---- 同类对标（横向分布 + 百分位 + 偏离均值） ---- */
  var bm = (p.benchmark || []).slice().sort(function (a, b) { return a - b; });
  var bmAvg = bm.length ? bm.reduce(function (a, b) { return a + b; }, 0) / bm.length : 0;
  var bmMin = bm.length ? bm[0] : 0;
  var bmMax = bm.length ? bm[bm.length - 1] : 0;
  /* 协商确认额在 [bmMin, bmMax] 上的相对位置 0~1（用于分布条打点） */
  var position = bmMax > bmMin ? (agreed - bmMin) / (bmMax - bmMin) : 0.5;
  position = Math.min(1, Math.max(0, position));
  var devFromAvg = bmAvg ? (agreed - bmAvg) / bmAvg : 0;

  /* 是否达成「可共识」：协商后差异比例落在阈值内 */
  var accepted = Math.abs(diffAgreedPct) <= threshold;

  return {
    baseline: baseline,
    apply: apply,
    ratio: ratio,
    cut: cut,
    agreed: agreed,
    diffApply: diffApply,
    diffApplyPct: diffApplyPct,
    diffAgreed: diffAgreed,
    diffAgreedPct: diffAgreedPct,
    reducible: reducible,
    bmAvg: bmAvg,
    bmMin: bmMin,
    bmMax: bmMax,
    position: position,
    devFromAvg: devFromAvg,
    accepted: accepted,
  };
};

/* ----------------------------------------------------------------
 * 滑块取值边界（确定性，供 UI 初始化范围）
 * 入参 baseline，返回 apply/ratio/cut 的合理取值区间
 * ---------------------------------------------------------------- */
BM.calc.tuneBounds = function (baseline) {
  baseline = Math.max(0, Math.round(baseline || 0));
  return {
    applyMin: Math.round(baseline * 0.6),
    applyMax: Math.round(baseline * 1.4),
    applyStep: Math.max(1000, Math.round(baseline * 0.01)),
    ratioMin: 0,
    ratioMax: 0.3,
    ratioStep: 0.005,
  };
};

/* ----------------------------------------------------------------
 * compileByMethod — M3 预算控制的方法（自上而下定义）→ 确定性年度控制基线
 * 入参 p：
 *   method        预算控制方法 id（见 BM.BUDGET_CONTROL_METHODS，由上级定义挂到各经济事项）
 *   lastYear      去年实际（历史参考/同比/关键事件基准）
 *   growth        同比系数（默认 1.05）
 *   qty/price     数量×单价
 *   headcount/perCapita  人均标准（人数×人均）
 *   volume/unitCost       业务量（业务量×单位成本）
 *   manageBaseline        管理标准（规则引擎基线）
 *   eventDelta    关键事件增量
 *   manualAmount  人工录入额
 * 返回：{ amount, note }（确定性，纯函数）
 * ---------------------------------------------------------------- */
BM.calc.compileByMethod = function (p) {
  p = p || {};
  var method = p.method;
  var round = function (n) { return Math.round(n || 0); };

  if (method === "history") {
    return { amount: round(p.lastYear), note: "历史参考：取去年实际 " + round(p.lastYear) };
  }
  if (method === "yoy") {
    var g = p.growth == null ? 1.05 : p.growth;
    return { amount: round((p.lastYear || 0) * g), note: "同比：去年实际 × " + (g * 100).toFixed(0) + "%" };
  }
  if (method === "fixed") {
    /* 取整到万元 */
    var f = Math.round((p.lastYear || 0) / 10000) * 10000;
    return { amount: f, note: "固定：取整到万元 = " + f };
  }
  if (method === "qtyPrice") {
    var q = p.qty || 0, pr = p.price || 0;
    return { amount: round(q * pr), note: "数量×单价：" + q + " × " + pr };
  }
  if (method === "perCapita") {
    var h = p.headcount || 0, pc = p.perCapita || 0;
    return { amount: round(h * pc), note: "人均标准：" + h + " 人 × " + pc };
  }
  if (method === "volume") {
    var v = p.volume || 0, uc = p.unitCost || 0;
    return { amount: round(v * uc), note: "业务量：" + v + " × " + uc };
  }
  if (method === "manageStd") {
    return { amount: round(p.manageBaseline), note: "管理标准：规则基线 " + round(p.manageBaseline) };
  }
  if (method === "keyEvent") {
    var delta = p.eventDelta || 0;
    return { amount: round((p.lastYear || 0) + delta), note: "关键事件：去年实际 + 增量 " + delta };
  }
  if (method === "manual") {
    return { amount: round(p.manualAmount), note: "人工录入：" + round(p.manualAmount) };
  }
  return { amount: 0, note: "未定义预算控制方法" };
};

/* ----------------------------------------------------------------
 * decomposeMonthly — 年度额按权重分解到 12 个月（确定性）
 * 入参：annual（年度总额），weights（12 个权重，缺省用季节性默认）
 * 返回：长度 12 的整数数组，和 = annual（残差补到最后一个月，确定性）
 * ---------------------------------------------------------------- */
BM.calc.decomposeMonthly = function (annual, weights) {
  annual = Math.round(annual || 0);
  var w = (weights && weights.length === 12) ? weights.slice() : [1.1, 0.9, 1.0, 1.0, 1.05, 1.1, 0.85, 0.9, 1.15, 1.1, 1.05, 0.8];
  var sum = w.reduce(function (a, b) { return a + b; }, 0) || 1;
  var months = w.map(function (x) { return Math.floor((annual * x) / sum); });
  var used = months.reduce(function (a, b) { return a + b; }, 0);
  months[11] += annual - used; /* 残差补 12 月，保证总和精确等于 annual */
  return months;
};

/* ----------------------------------------------------------------
 * applyReduction — 压降：基线 ×(1 - 比率)（确定性）
 * 入参：baseline（基线金额），ratio（0~1）
 * ---------------------------------------------------------------- */
BM.calc.applyReduction = function (baseline, ratio) {
  baseline = Math.max(0, Math.round(baseline || 0));
  ratio = Math.min(1, Math.max(0, ratio || 0));
  return Math.round(baseline * (1 - ratio));
};

/* ----------------------------------------------------------------
 * riskLevel — 由置信度与金额偏离推导风险等级（确定性，可解释）
 * 入参：confidence（0~1），deviationPct（建议额相对基线偏离比例绝对值）
 * 返回：'高' | '中' | '低'
 * ---------------------------------------------------------------- */
BM.calc.riskLevel = function (confidence, deviationPct) {
  confidence = confidence == null ? 0 : confidence;
  var dev = Math.abs(deviationPct || 0);
  if (confidence >= 0.8 && dev >= 0.1) return "高";
  if (confidence >= 0.7 || dev >= 0.1) return "中";
  return "低";
};

/* ----------------------------------------------------------------
 * riskSummary — M7 风险筛查汇总（确定性统计）
 * 入参：list（BM.RISK_SCREENING 数组）
 * 返回：按等级计数 + 建议压降总额（建议额之和 - 基线之和的差额绝对值）
 * ---------------------------------------------------------------- */
BM.calc.riskSummary = function (list) {
  list = list || [];
  var cnt = { 高: 0, 中: 0, 低: 0 };
  var saveTotal = 0;
  list.forEach(function (r) {
    var dev = r.baseline ? (r.suggestAmount - r.baseline) / r.baseline : 0;
    var level = BM.calc.riskLevel(r.confidence, dev);
    cnt[level] = (cnt[level] || 0) + 1;
    saveTotal += (r.baseline || 0) - (r.suggestAmount || 0); /* 建议下调 → 正数=可压降 */
  });
  return { count: list.length, byLevel: cnt, saveTotal: Math.round(saveTotal) };
};

/* Node 单测导出 */
if (typeof module !== "undefined" && module.exports) {
  module.exports = BM.calc;
}

if (typeof window !== "undefined") window.BM = BM;
