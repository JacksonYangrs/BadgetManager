/* ================================================================
 * data/rules-engine.js — 客户规则引擎 + AI 编制建议
 * 迁移自 data/data.js（原 1486 行上帝文件，2026-09-04 拆分）
 * 依赖：organization.js、budget.js、transactions.js
 * 挂载 BM.RULES/applyRule/isDeviated/RULE_OWNERS/myRules/EVENT_OWNERS/PEOPLE/aggByOwner、
 *   BENCHMARK/collisionItems(+diff)、aiSuggestion/RULE_ADVICE_MAP/budgetAdvice/adviceDeviation、
 *   BUDGET_CONTROL_METHODS/CTRL_METHOD_ASSIGN/RULE_EVENT_MAP/DUAL_TRACK
 * （buildRuleAnalysis 原顶层函数迁移为 IIFE 私有，仅供 budgetAdvice 内部调用）
 * ================================================================ */

(function () {
var BM = window.BM || {};

/* ---------- 客户规则引擎（文件1 预算逻辑提炼，V2 §5.10） ---------- */
/* requireReason: 偏离基线必须填原因（规则治理） */
BM.RULES = [
  { id: "R01", cat: "总办办公费", type: "down5",   expr: "较 2025 实际下降 5%", requireReason: true, lastBudget: 1320000, acctCode: "6602.11", lastYear: 1200000, desc: "总经办归口，刚性压降" },
  { id: "R02", cat: "食堂费用",   type: "canteen", expr: "人均成本 7 元/餐 ±3%，>7.5 须降 ≥5%", requireReason: true, lastBudget: 3960000, acctCode: "6602.12", lastYear: 3600000, desc: "按人数核定，超线压降" },
  { id: "R03", cat: "宿舍费用",   type: "dorm",    expr: "月人均<13.5 不降；13.5~18 降≥10%；≥20 降≥15%", requireReason: true, lastBudget: 2310000, acctCode: "6602.13", lastYear: 2100000, desc: "阶梯压降" },
  { id: "R04", cat: "差旅费",     type: "revenue", expr: "营收比 ≤ 千分之4，费用增幅 ≤ 营收增幅 50%", requireReason: true, lastBudget: 1980000, acctCode: "6602.14", lastYear: 1800000, desc: "挂钩营收" },
  { id: "R05", cat: "绿化费",     type: "green",   expr: "管养单价 3~3.5 降≥5%；>3.5 降≥10%", requireReason: true, lastBudget: 528000, acctCode: "6602.15", lastYear: 480000, desc: "单价挂钩" },
  { id: "R06", cat: "按实际预算类", type: "actual", expr: "据实预算，须详细说明依据", requireReason: true, lastBudget: null, acctCode: "6602.99", lastYear: null, desc: "据实申报" },
];

/* 规则基线计算：输入科目名 + 2025 实际，返回建议/基线金额 */
BM.applyRule = function (catName, lastYearActual) {
  const r = BM.RULES.find((x) => x.cat === catName);
  if (!r) return { ok: false, baseline: null };
  if (r.type === "down5") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.95) };
  if (r.type === "canteen") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.97) };
  if (r.type === "dorm")    return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.90) };
  if (r.type === "revenue") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.98) };
  if (r.type === "green")   return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.92) };
  if (r.type === "actual")  return { ok: true, type: r.type, baseline: lastYearActual };
  return { ok: false, baseline: null };
};

/* 偏离判定：|输入-基线| / 基线 > 阈值（默认 1%） */
BM.isDeviated = function (input, baseline, threshold) {
  if (!baseline) return false;
  threshold = threshold === undefined ? 0.01 : threshold;
  return Math.abs(input - baseline) / baseline > threshold;
};

/* ---------- 经济事项负责人归属（demo 分配；真实 ~390 项依赖主数据导入后按组织挂责） ---------- */
BM.RULE_OWNERS = {
  "总办办公费": "ceo",
  "食堂费用": "expense",
  "宿舍费用": "expense",
  "差旅费": "expense",
  "绿化费": "expense",
  "按实际预算类": "adminHead",
};
/* 当前角色负责的经济事项（编制页「我负责的」筛选）；无归属则回退全部 */
BM.myRules = function (roleId) {
  const r = roleId || BM.state.role;
  const mine = BM.RULES.filter((x) => BM.RULE_OWNERS[x.cat] === r);
  return mine.length ? mine : BM.RULES;
};

/* ---------- 看板 · 人员视图：经济事项 → 责任人（demo 分配，待主数据导入真实人员归属） ---------- */
BM.EVENT_OWNERS = {
  "总办办公费": "李静",
  "食堂费用": "王敏",
  "宿舍费用": "王敏",
  "差旅费": "张伟",
  "绿化费": "赵磊",
  "按实际预算类": "周芳",
};
BM.PEOPLE = ["李静", "王敏", "张伟", "赵磊", "周芳"];
/* 按责任人聚合（同一份预算数据，人员维度） */
BM.aggByOwner = function (list) {
  const map = {};
  (list || []).forEach((d) => {
    const owner = BM.EVENT_OWNERS[d.cat] || "未分配";
    if (!map[owner]) map[owner] = { owner: owner, events: 0, amount: 0 };
    map[owner].events += 1;
    map[owner].amount += (d.amount || 0);
  });
  return BM.PEOPLE.map((p) => map[p] || { owner: p, events: 0, amount: 0 });
};

/* ---------- AI 建议（正式页面：规则引擎 + AI 读取政策/往年/执行；此处确定性推导，待接 AI 网关） ---------- */
BM.aiSuggestion = function (catName) {
  const r = BM.RULES.find((x) => x.cat === catName);
  if (!r) return null;
  const ar = BM.applyRule(catName, r.lastYear);
  const base = ar.ok ? ar.baseline : (r.lastYear || 0);
  const lo = Math.round(base * 0.9);
  const hi = Math.round(base * 1.05);
  const execRate = r.lastYear ? ({ down5: 0.95, canteen: 0.97, dorm: 0.9, revenue: 0.98, green: 0.92, actual: 1 })[r.type] || 1 : null;
  return {
    lo: lo,
    hi: hi,
    mid: Math.round((lo + hi) / 2),
    policy: "预算政策：" + r.expr,
    basis: r.lastYear ? "往年预算：" + BM.money(r.lastYear) + "（2025 实际）" : "往年预算：无历史（据实申报）",
    exec: execRate != null ? "上年执行：全年执行率约 " + Math.round(execRate * 100) + "%" : "上年执行：—",
  };
};

/* ---------- 动态编制建议（松哥 2026-08-24 方法论原型）
 * 不写死规则，而是根据「这一项最适合哪条预算规则」动态给出编制建议：
 *   - 适配规则（8 类规则之一）
 *   - 该参照什么（去年实际 / 合同 / 业务量变化 / 事件拆分 …）
 *   - 建议区间（复用 aiSuggestion）
 *   - 实时偏离（编制人填的值 vs 区间）
 * 让编制人每编一项都"心里踏实"；上级再用平衡原则（规则4/5/6）做汇总平衡。
 * ---------------------------------------------------------------------- */

/* 控制方法 → 8 类规则适配元数据（method 由上级定义，见 CTRL_METHOD_ASSIGN） */
BM.RULE_ADVICE_MAP = {
  history:   { rule: "R1", ruleName: "历史基准", kind: "历史基准型",   ref: "参照近 1–3 年实际均值（优先历史实际，而非去年预算，避免基数虚高）", devHint: "检查去年是否报高，若去年实际 < 去年预算，应以实际为基数" },
  yoy:       { rule: "R1/R2", ruleName: "历史基准+趋势", kind: "趋势型", ref: "参照去年实际 × 业务量系数 × 价格系数（看 3 年 CAGR，不只看上一年）", devHint: "申报增长若超历史趋势 15 个百分点，需补充业务驱动因素" },
  fixed:     { rule: "R4", ruleName: "弹性·刚性", kind: "刚性合同型",   ref: "直接读取合同/固定额，不要按历史比例涨（房租涨 30% 若合同如此则合理）", devHint: "刚性费用不套用增长率模型，核对合同即可" },
  perCapita: { rule: "R3", ruleName: "业务驱动", kind: "业务驱动型",   ref: "参照人数 × 人均标准（人数变了才变，否则不该涨）", devHint: "预算增长 % 与人数增长 % 不匹配时，系统会质询" },
  volume:    { rule: "R3", ruleName: "业务驱动", kind: "业务驱动型",   ref: "参照业务量 × 单位成本（如差旅按营收比，业务量没涨就不该涨）", devHint: "预算增长与营收/产量增长背离时，需说明" },
  manageStd: { rule: "R4/R1", ruleName: "弹性·管理标准", kind: "管理标准型", ref: "参照上级下达的管理基线（如降 5% / 人均 7 元），属半刚性压降", devHint: "已含集团压降目标，申报高于基线须说明管理改善未达标" },
  keyEvent:  { rule: "R8", ruleName: "重大事件", kind: "事件型",       ref: "拆成 BAU（正常经营）+ Event（新增事件），只报正常部分同比", devHint: "Event 占比 > 20% 必须拆分填报并附事件说明" },
  manual:    { rule: "R1", ruleName: "据实申报", kind: "据实型",       ref: "据实申报，必须附业务依据（无历史基线，纯说明驱动）", devHint: "无历史可参照，重点在依据完整性与合理性" },
};

/* 主函数：给定经济事项 r，返回动态编制建议对象 + AI 规则应用分析 */
BM.budgetAdvice = function (r) {
  if (!r) return null;
  const method = r.method || BM.CTRL_METHOD_ASSIGN[r.cat] || "history";
  const meta = BM.RULE_ADVICE_MAP[method] || BM.RULE_ADVICE_MAP.history;
  let sug = BM.aiSuggestion(r.cat) || null;
  /* 回退基线（规则1 历史基准）：事项未匹配规则字典时，用上年实际 × 系数给区间，
   * 避免建议区间为空（原型阶段让每一项都有可参照的动态建议）。 */
  if (!sug || sug.lo == null) {
    const base = r.lastYear || r.lastBudget || 0;
    sug = { lo: Math.round(base * 0.9), hi: Math.round(base * 1.05), mid: Math.round(base * 0.975) };
  }
  /* 历史实际可得性（规则1核心：优先历史实际而非去年预算） */
  const hasActual = r.lastYear != null && r.lastYear > 0;
  const hasBudget = r.lastBudget != null && r.lastBudget > 0;
  let basisNote = "无历史数据，据实申报";
  if (hasActual && hasBudget) {
    const inflate = r.lastBudget > r.lastYear ? "（注意：去年预算高于实际，建议以实际为基数避免虚高）" : "";
    basisNote = "历史实际 " + BM.money(r.lastYear) + " / 去年预算 " + BM.money(r.lastBudget) + inflate;
  } else if (hasActual) {
    basisNote = "历史实际 " + BM.money(r.lastYear) + "（无去年预算，以实际为基数）";
  } else if (hasBudget) {
    basisNote = "去年预算 " + BM.money(r.lastBudget) + "（无实际，谨慎参照）";
  }

  /* ========== AI 规则应用分析（确定性规则引擎 + 自然语言生成） ========== */
  const analysis = buildRuleAnalysis(r, method, sug);

  return {
    method: method,
    rule: meta.rule,
    ruleName: meta.ruleName,
    kind: meta.kind,
    ref: meta.ref,
    devHint: meta.devHint,
    basisNote: basisNote,
    lo: sug.lo, hi: sug.hi, mid: sug.mid,
    analysis: analysis,
  };
};

/* 构建"AI 对预算规则在本经济事项上的应用分析" */
function buildRuleAnalysis(r, method, sug) {
  const amount = r.amount || 0;
  const lastYear = r.lastYear || 0;
  const lastBudget = r.lastBudget || 0;
  const ruleDef = BM.RULES.find((x) => x.cat === r.cat);

  /* 1. 本项数据画像 */
  const execRate = lastBudget ? Math.round((lastYear / lastBudget) * 1000) / 10 : null;
  const elasticityKey = { history: "semi", yoy: "elastic", fixed: "fixed", perCapita: "semi", volume: "elastic", manageStd: "semi", keyEvent: "event", manual: "elastic" }[method] || "elastic";
  const elasticityName = { fixed: "刚性", semi: "半刚性", elastic: "弹性", event: "项目型" }[elasticityKey];
  const elasticity = elasticityName;

  /* 2. 规则逐条应用 */
  const steps = [];

  // R1 历史基准
  if (lastYear > 0) {
    const baseLine = BM.applyRule(r.cat, lastYear);
    const base = baseLine.ok ? baseLine.baseline : Math.round(lastYear * 0.95);
    steps.push({
      rule: "R1 历史基准",
      conclusion: "以 2025 实际 " + BM.money(lastYear) + " 为基数，规则计算基线约 " + BM.money(base) + "。",
      why: lastBudget > lastYear ? "去年预算" + BM.money(lastBudget) + "高于实际，若沿用预算基数会虚高 " + Math.round((lastBudget - lastYear) / lastYear * 100) + "%。" : "历史实际可靠，优先于去年预算。",
    });
  } else {
    steps.push({ rule: "R1 历史基准", conclusion: "无历史实际，无法使用历史基准法，须据实说明。", why: "" });
  }

  // R2 趋势（单年变多年：这里只有一年，给出方向性判断）
  if (lastYear > 0 && lastBudget > 0) {
    const trend = Math.round((lastYear - lastBudget) / lastBudget * 1000) / 10;
    steps.push({
      rule: "R2 趋势",
      conclusion: "去年实际较预算" + (trend <= 0 ? "节约 " + Math.abs(trend) + "%" : "超支 " + trend + "%") + "。",
      why: trend < -5 ? "存在节约空间，今年可在此基础上压降。" : trend > 5 ? "执行偏差大，今年申报须解释原因。" : "执行相对平稳。",
    });
  }

  // R3 业务驱动
  if (["perCapita", "volume"].includes(method)) {
    steps.push({
      rule: "R3 业务驱动",
      conclusion: "本项按" + (method === "perCapita" ? "人数 × 人均标准" : "业务量 × 单位成本") + "驱动。",
      why: "预算增长应与业务指标同向；若业务指标未涨而预算涨，系统自动质询。",
    });
  }

  // R4 弹性分类
  steps.push({
    rule: "R4 弹性分类",
    conclusion: "本项归为「" + elasticityName + "」费用。",
    why: { fixed: "合同/固定驱动，不套用增长率模型。", semi: "与人数/业务量弱相关，可适度压降。", elastic: "与业务强相关，优先审核增长合理性。", event: "须拆分 BAU 与事件增量。" }[elasticityKey],
  });

  // R5 横向对标（用 BM.BENCHMARK）
  const bench = BM.BENCHMARK[r.cat];
  if (bench && lastYear > 0) {
    const vals = Object.values(bench).filter((v) => v > 0);
    const median = vals.length ? vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] : 0;
    const cmp = median ? Math.round((lastYear - median) / median * 1000) / 10 : 0;
    steps.push({
      rule: "R5 横向对标",
      conclusion: "集团同类公司该科目中位数约 " + BM.money(median) + "，本公司去年实际 " + BM.money(lastYear) + "（" + (cmp >= 0 ? "高 " + cmp : "低 " + Math.abs(cmp)) + "%）。",
      why: Math.abs(cmp) > 20 ? "偏离中位数超过 20%，今年申报建议补充横向差异说明。" : "处于同类公司合理区间。",
    });
  }

  // R6 总量约束（用建议区间占总额比例，这里总额未知，用申报额反向提示）
  steps.push({
    rule: "R6 总量约束",
    conclusion: "建议区间 " + BM.money(sug.lo) + " ~ " + BM.money(sug.hi) + " 已含规则压降/管理目标。",
    why: "超出上限须说明不可压缩因素；低于下限须确认是否漏项。",
  });

  // R7 准确性
  if (execRate != null) {
    steps.push({
      rule: "R7 预算准确性",
      conclusion: "去年执行率约 " + execRate + "%。",
      why: execRate < 85 ? "执行率偏低，本年预算可信度下调，建议从严审核。" : execRate > 105 ? "执行率超预算，基数可能偏低。" : "执行率正常，可接受。",
    });
  }

  // R8 事件拆分
  if (method === "keyEvent") {
    steps.push({
      rule: "R8 重大事件",
      conclusion: "须将总预算拆为 BAU + Event。",
      why: "Event 占比超过 20% 必须单独列示事件依据，否则同比会失真。",
    });
  }

  /* 3. 区间推导说明 */
  const rangeReasoning = lastYear > 0
    ? "建议区间 = 规则基线（" + BM.money(sug.mid) + "）× [0.9, 1.05]，覆盖正常波动与价格因素。"
    : "建议区间 = 去年预算（" + BM.money(lastBudget) + "）× [0.9, 1.05]，因无历史实际，区间偏宽。";

  /* 4. 偏离归因（基于当前申报额） */
  let deviation = null;
  if (amount > 0 && sug.lo != null) {
    if (amount > sug.hi) {
      const overPct = Math.round((amount - sug.hi) / sug.mid * 100);
      deviation = {
        status: "偏高",
        possibleCauses: [
          lastYear > 0 && amount > lastYear ? "申报额高于去年实际 " + Math.round((amount - lastYear) / lastYear * 100) + "%" : null,
          bench && lastYear > 0 ? "去年实际已高于集团中位数" : null,
          elasticity === "fixed" ? "刚性合同涨价" : null,
          method === "keyEvent" ? "含未拆分的事件增量" : null,
        ].filter(Boolean),
      };
    } else if (amount < sug.lo) {
      const underPct = Math.round((sug.lo - amount) / sug.mid * 100);
      deviation = {
        status: "偏低",
        possibleCauses: ["申报额低于建议下限，可能漏项或压降过度", lastBudget > amount ? "低于去年预算，需确认业务变化" : null].filter(Boolean),
      };
    } else {
      deviation = { status: "合理", possibleCauses: [] };
    }
  }

  /* 5. AI 追问 */
  const questions = [];
  if (method === "perCapita" || method === "volume") questions.push("请确认本年度" + (method === "perCapita" ? "人数/人均标准" : "业务量/单价") + "变化。");
  if (lastBudget > lastYear) questions.push("去年预算高于实际，请说明今年为何不能按实际基数继续压降。");
  if (deviation && deviation.status === "偏高") questions.push("申报额高于建议区间，请补充业务驱动因素或事件说明。");
  if (method === "keyEvent") questions.push("请拆分 BAU 预算与 Event 增量，并附事件清单。");
  if (questions.length === 0) questions.push("请确认上述规则假设与业务实际一致。");

  return {
    profile: {
      lastYear: lastYear, lastBudget: lastBudget, execRate: execRate,
      elasticity: elasticity, elasticityName: elasticity,
    },
    steps: steps,
    rangeReasoning: rangeReasoning,
    deviation: deviation,
    questions: questions,
  };
}

/* 实时偏离判定：编制人填的值 vs 建议区间 */
BM.adviceDeviation = function (advice, amount) {
  if (!advice || advice.lo == null) return { inRange: null, pct: null, label: "—" };
  const inRange = amount >= advice.lo && amount <= advice.hi;
  const pct = advice.mid ? Math.round((amount - advice.mid) / advice.mid * 100) : null;
  let label = "在建议区间内";
  if (amount < advice.lo) label = "低于建议区间 " + Math.round((advice.lo - amount) / (advice.mid || 1) * 100) + "%（偏低，确认是否漏项）";
  else if (amount > advice.hi) label = "高于建议区间 " + Math.round((amount - advice.hi) / (advice.mid || 1) * 100) + "%（偏高，须补依据）";
  return { inRange: inRange, pct: pct, label: label };
};

/* ---------- 预算碰撞/争议（V2 §5.2；申报值 vs 集团建议值） ---------- */
BM.collisionItems = [
  { id: "C01", cat: "总办办公费", company: "2010", apply: 1140000, lastYear: 1200000, note: "", evidence: "", status: "待协商" },
  { id: "C02", cat: "食堂费用",   company: "2010", apply: 3720000, lastYear: 3600000, note: "", evidence: "", status: "待协商" },
  { id: "C03", cat: "宿舍费用",   company: "2020", apply: 1980000, lastYear: 2100000, note: "", evidence: "", status: "待协商" },
  { id: "C04", cat: "差旅费",     company: "2010", apply: 1760000, lastYear: 1800000, note: "", evidence: "", status: "已共识" },
  { id: "C05", cat: "绿化费",     company: "2170", apply: 520000,  lastYear: 480000,  note: "", evidence: "", status: "待协商" },
];
BM.collisionItems.forEach((c) => {
  const ar = BM.applyRule(c.cat, c.lastYear);
  c.suggest = ar.ok ? ar.baseline : c.lastYear;
  c.diff = c.apply - c.suggest;
  c.diffPct = c.suggest ? Math.round((c.diff / c.suggest) * 1000) / 10 : 0;
});

/* ---------- 对标数据：多公司同科目预算（脱敏 mock，用于横向对标视角） ---------- */
BM.BENCHMARK = {
  "总办办公费": { "1000": 1320000, "2010": 1140000, "2020": 980000, "2030": 1050000, "2170": 760000, "2180": 820000, "3050": 690000, "3200": 710000 },
  "食堂费用":   { "1000": 4200000, "2010": 3720000, "2020": 3100000, "2030": 3400000, "2170": 2600000, "2180": 2800000, "3050": 2300000, "3200": 2500000 },
  "宿舍费用":   { "1000": 2400000, "2020": 1980000, "2030": 1700000, "2170": 1450000, "2180": 1560000, "3050": 1320000, "3200": 1400000 },
  "差旅费":     { "1000": 2100000, "2010": 1760000, "2020": 1500000, "2030": 1620000, "2170": 1240000, "2180": 1330000, "3050": 1120000, "3200": 1190000 },
  "绿化费":     { "1000": 560000, "2010": 520000, "2020": 440000, "2030": 470000, "2170": 360000, "2180": 390000, "3050": 330000, "3200": 350000 },
};

/* ================================================================
 * v0.13 增量（本期新增前端界面所需数据）
 *  - BM.BUDGET_CONTROL_METHODS：M3 预算控制的方法定义（自上而下定义 · 产品经理稿 §M3）
 *  金额/规则与既有 demo 同源；风险数据脱敏，仅典型子集。
 * ================================================================ */

/* ---------- M3 · 预算控制的方法（自上而下定义，非基层自选） ---------- */
/* 注意：这些方法由上面（管理层/集团/中心负责人）统一定义并挂到各经济事项上，
 *       基层只据实申报，系统按上级定义的方法生成「控制基线」并比对偏离；基层不得自选方法。 */
BM.BUDGET_CONTROL_METHODS = [
  { id: "history",   name: "历史参考", desc: "取近 1-3 年同科目实际均值，作为基线" },
  { id: "yoy",       name: "同比",     desc: "去年实际 × 同比系数（默认 +5%）" },
  { id: "fixed",     name: "固定",     desc: "取固定预算额（取整到万元）" },
  { id: "qtyPrice",  name: "数量×单价", desc: "业务数量 × 单价，逐项汇总" },
  { id: "perCapita", name: "人均标准", desc: "在编人数 × 人均标准（如食堂/宿舍）" },
  { id: "volume",    name: "业务量",   desc: "业务量 × 单位成本（如差旅按营收比）" },
  { id: "manageStd", name: "管理标准", desc: "按客户规则引擎基线（如降 5% / 人均 7 元）" },
  { id: "keyEvent",  name: "关键事件", desc: "去年实际 + 关键事件增量（扩产/新项目）" },
  { id: "manual",    name: "人工",     desc: "人工直接录入，不自动预填（需附依据）" },
];

/* 各经济事项由上面统一定义的预算控制方法（上级下发，只读，基层不可改） */
BM.CTRL_METHOD_ASSIGN = {
  vehicle:  "manageStd",   /* 车辆维修：按管理标准（规则引擎基线，降档） */
  it:       "history",     /* IT 设备：历史参考 */
  office:   "perCapita",   /* 办公用品：人均标准 */
  property: "yoy",         /* 物业费：同比 */
  training: "manageStd",   /* 培训费：管理标准 */
  travel:   "volume",      /* 差旅费：业务量驱动 */
  utility:  "fixed",       /* 水电费：固定 */
  entertain: "keyEvent",   /* 业务招待：关键事件 */
  /* 规则经济事项（客户规则字典 · 上级定义控制方法） */
  "总办办公费": "manageStd", /* 刚性压降 5% → 管理标准（规则基线） */
  "食堂费用":   "manageStd", /* 人均成本 7 元/餐 → 管理标准（规则基线） */
  "宿舍费用":   "manageStd", /* 阶梯压降 → 管理标准（规则基线） */
  "差旅费":     "volume",    /* 营收比 → 业务量驱动 */
  "绿化费":     "qtyPrice",  /* 管养单价 → 数量×单价 */
  "按实际预算类": "manual",  /* 据实申报 → 人工 */
};

/* ---------- 预算规则 → 适用经济事项 映射（规则页「规则-事项」对照表数据源）
 * 把后端生效版本的 baseline scopeKey 与全部经济事项（BM.CTRL_METHOD_ASSIGN）串联：
 *   - scopeKey：后端规则代号（down5/canteen/dorm/revenue/green/actual/volume/qtyPrice/history/manual）
 *   - typeLabel：规则类型（刚性/半刚性/弹性/项目型），用于平衡预览弹性分类对齐
 *   - events：适用经济事项名（来自 CTRL_METHOD_ASSIGN 中 method === scopeKey 的事项）
 *   - policy：政策表述（复用 BM.RULES 的 expr/desc，无则取通用说明）
 * 注意：本映射是"规则 → 事项"的**展示层串联**，不改动规则引擎计算逻辑（applyRule/budgetAdvice）。
 */
BM.RULE_EVENT_MAP = (function () {
  /* 后端权威规则字典（BM.RULES）：6 条客户规则，type 即 scopeKey，含 canteen/dorm/revenue/green */
  const GENERIC = {
    down5:    { expr: "较 2025 实际下降 5%", desc: "刚性压降", typeLabel: "半刚性" },
    canteen:  { expr: "人均成本 7 元/餐 ±3%，超线须降", desc: "按人数核定", typeLabel: "半刚性" },
    dorm:     { expr: "阶梯压降（人均越高降越多）", desc: "阶梯压降", typeLabel: "半刚性" },
    revenue:  { expr: "营收比 ≤ 千分之4，费用增幅 ≤ 营收增幅 50%", desc: "挂钩营收", typeLabel: "弹性" },
    green:    { expr: "管养单价挂钩，超线降 ≥5~10%", desc: "单价挂钩", typeLabel: "半刚性" },
    actual:   { expr: "据实预算，须详细说明依据", desc: "据实申报", typeLabel: "项目型" },
    volume:   { expr: "按业务量 × 单位成本核定", desc: "业务量驱动", typeLabel: "弹性" },
    qtyPrice: { expr: "数量 × 单价联动核定", desc: "量价联动", typeLabel: "弹性" },
    history:  { expr: "参照历史实际，同比持平", desc: "历史基准", typeLabel: "弹性" },
    manual:   { expr: "据实申报，附业务依据", desc: "人工核定", typeLabel: "项目型" },
  };
  /* 以 BM.RULES 客户规则为权威主干（保留 canteen/dorm/revenue/green 等规则真实表述） */
  const map = {};
  (BM.RULES || []).forEach((r) => {
    const g = GENERIC[r.type] || { expr: r.expr, desc: r.desc, typeLabel: "弹性" };
    map[r.type] = { scopeKey: r.type, typeLabel: g.typeLabel, policy: r.expr, desc: r.desc || "", events: [r.cat] };
  });
  /* 高层控制方法（CTRL_METHOD_ASSIGN 的 value）→ 后端规则 scopeKey 桥接。
   * 前端 method 是语义层（manageStd/perCapita/yoy/fixed/keyEvent），
   * 后端 baseline 用具体规则代号。例如：车辆维修 method=manageStd → 套 down5（降 5%）。 */
  const METHOD_TO_SCOPE = {
    manageStd: "down5", perCapita: "actual", yoy: "history", fixed: "actual",
    keyEvent: "actual", history: "history", volume: "volume", qtyPrice: "qtyPrice",
    revenue: "revenue", green: "green", canteen: "canteen", dorm: "dorm",
    actual: "actual", manual: "manual",
  };
  /* 反查：把 CTRL_METHOD_ASSIGN 全部事项挂到对应 scopeKey（去重，避免与 RULES.cat 重复） */
  /* 英文名 → 中文名：CATEGORIES 里 id/name；没有则原样显示 */
  const catNameMap = {};
  (BM.CATEGORIES || []).forEach((c) => { catNameMap[c.id] = c.name; });
  function displayName(evt) { return catNameMap[evt] || evt; }
  const assign = BM.CTRL_METHOD_ASSIGN || {};
  Object.keys(assign).forEach((evt) => {
    const scope = METHOD_TO_SCOPE[assign[evt]] || assign[evt];
    if (!map[scope]) {
      const g = GENERIC[scope] || { expr: scope, desc: "", typeLabel: "弹性" };
      map[scope] = { scopeKey: scope, typeLabel: g.typeLabel, policy: g.expr, desc: g.desc || "", events: [] };
    }
    const name = displayName(evt);
    if (map[scope].events.indexOf(name) < 0) map[scope].events.push(name);
  });
  return Object.keys(map).map((k) => map[k]);
})();

/* 单数据源·双派生视角：同一经济事项为唯一事实源（~390 经济事项，V2 §3.4.10）
 * 财务聚合视图（会计口径，按 BM.CATEGORIES 会计科目归集）vs 管理指标视图（管理口径，按职能中心归集），均派生自同一份数据。
 * TODO（V2 §8-16 / 设计稿 §8.2-2）：财务(~220) vs 管理(~390) 科目映射与差异归因规则未确认；
 *   此处仅取现有 6 个 RULES 科目作派生样例，全量 ~390 待后端/主数据接入。
 * 两条线金额由同一 lastYear 经确定性规则派生，体现「同一份数据、双派生视角（财务聚合/管理指标）」；管理线非独立填报口。 */
BM.DUAL_TRACK = BM.RULES.map(function (r) {
  const fin = r.lastYear != null ? r.lastYear : 0;
  /* 管理口径：按中心标准再降一档（样例：管理口径通常更细、更强调降本） */
  const mgt = r.lastYear != null ? Math.round(r.lastYear * 0.93) : 0;
  const center = (BM.FUNCTIONAL_CENTERS.find(function (c) { return c.subjects.indexOf(r.cat) >= 0; }) || {}).name || "—";
  const acct = (BM.CATEGORIES.find(function (c) { return c.name === r.cat; }) || {}).accountCode || "—";
  return {
    event: r.cat,
    lastYear: r.lastYear,
    finLine: { amount: fin, accountCode: acct, caliber: "财务口径（会计规则归集）" },
    mgtLine: { amount: mgt, center: center, caliber: "管理口径（职能中心归集）" },
    /* 错位双归属标签（V2 §2.0 / 设计稿 §6.4）；样例：劳动关系在 2010，预算在总部 */
    costOwnerOrg: "2010",
    budgetOwnerOrg: "HQ",
  };
});

window.BM = BM;
})();
