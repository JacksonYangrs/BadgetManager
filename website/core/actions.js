/* ================================================================
 * core/actions.js — 业务动作
 * 迁移自 core/state.js（原 803 行上帝文件，2026-09-04 拆分）
 * 依赖：core/state.js、core/access.js（先于本文件加载）
 * 职责：approveDoc、adoptSuggestion/ignoreSuggestion/revertSuggestion、
 *   requestPurchase/requestPurchaseForProject、createAdjustment/approveAdjustment、
 *   planSaveRows/planSetMode/planSubmit/planApprove/planReject/finalConfirm、
 *   saveRules/RULES_LABELS/isPurchaseBlocked、
 *   saveCollision/saveRuleEngine/confirmTuneAgreement、
 *   compileSaveDraft/compileLoadDraft/compileSaveSubject、reviewRisk、submitReimburse
 * 说明：本文件不重绑 state 变量，仅读写 BM.state 属性（loadState/resetState 保证 BM.state 恒指向当前状态对象）。
 * ================================================================ */

(function () {
var BM = window.BM || {};

/* ================= 审批操作 ================= */

BM.approveDoc = function (id, decision) {
  const a = BM.state.approvals.find((x) => x.id === id);
  if (!a) return;
  a.status = decision === "approve" ? "approved" : "rejected";
  a.manualDecision = decision;
  a.manualTime = BM.today();
  BM.saveState();
};

/* ================= 建议操作 ================= */

/* 采纳建议 → 执行对应动作（预算调剂 / 生成采购单等） */
BM.adoptSuggestion = function (id) {
  const s = BM.state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "pending") return null;

  s.status = "adopted";
  s.adoptedTime = BM.today();

  const result = { suggestion: s, docs: [], transfer: null };

  if (s.id === "SUG001") {
    // 培训 → IT 调剂 30 万
    const key = "in:it";
    BM.state.transfers[key] = 300000;
    BM.state.transfers["out:training"] = 300000;
    result.transfer = {
      from: "培训费",
      to: "IT 设备",
      amount: 300000,
      approvedBy: "财务 · 李静",
      time: BM.today(),
    };
  }

  if (s.id === "SUG002") {
    // 统一供应商 → 生成采购框架协议申请单
    const doc = {
      id: BM.uid("DOC"),
      title: "办公用品年度框架采购协议",
      catName: "办公用品",
      deptName: "行政部",
      supplier: "晨光办公",
      amount: 0,
      date: BM.today(),
      kind: "contract",
      note: "AI 建议 · 统一供应商降本 8%",
    };
    BM.state.approvals.unshift(doc);
    result.docs.push(doc);
  }

  if (s.id === "SUG003") {
    // 采购周期调整 → 生成流程变更单（无金额）
    const doc = {
      id: BM.uid("DOC"),
      title: "打印纸采购周期调整（周 → 月）",
      catName: "办公用品",
      deptName: "行政部",
      supplier: "—",
      amount: 0,
      date: BM.today(),
      kind: "process",
      note: "AI 建议 · 采购周期优化",
    };
    BM.state.approvals.unshift(doc);
    result.docs.push(doc);
  }

  if (s.id === "SUG004") {
    // 已被忽略，不会走到这里
  }

  BM.saveState();
  return result;
};

BM.ignoreSuggestion = function (id) {
  const s = BM.state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "pending") return;
  s.status = "ignored";
  BM.saveState();
};

BM.revertSuggestion = function (id) {
  const s = BM.state.suggestions.find((x) => x.id === id);
  if (!s) return;
  if (s.id === "SUG001" && s.status === "adopted") {
    delete BM.state.transfers["in:it"];
    delete BM.state.transfers["out:training"];
  }
  if (s.id === "SUG002" || s.id === "SUG003") {
    BM.state.approvals = BM.state.approvals.filter((d) => !(d.note && d.note.indexOf("AI 建议") >= 0));
  }
  s.status = "pending";
  delete s.adoptedTime;
  BM.saveState();
};

/* ================= 采购发起（主线 B） ================= */

/* 员工发起采购：返回 { ok, doc, issues, transferSuggestion } */
BM.requestPurchase = function (item) {
  // 模拟：采购 10 台显示器（约 12 万）→ IT 设备
  const catId = "it";
  const remain = BM.getCatRemain(catId);
  const amount = item && item.amount ? item.amount : 120000;
  const docId = BM.uid("DOC");

  const doc = {
    id: docId,
    title: (item && item.title) || "显示器批量采购（10 台）",
    catName: "IT 设备",
    deptName: "IT 部",
    supplier: "未来数码",
    amount,
    date: BM.today(),
    kind: "purchase",
    requester: "员工 · 张伟",
  };

  if (remain >= amount) {
    // 预算充足
    doc.status = "pending";
    doc.ai = {
      verdict: "pass",
      text: `预算检查通过（IT 设备剩余 ${BM.money(remain)}）；供应商为历史供应商，价格低于市场均价 4%；金额 ${BM.money(amount)} 需部门负责人 + 财务审批。`,
    };
    BM.state.approvals.unshift(doc);
    BM.saveState();
    return { ok: true, doc, remain };
  }

  // 预算不足 → 建议先调剂
  doc.status = "pending";
  doc.ai = {
    verdict: "review",
    text: `预算检查：IT 设备可用预算不足（缺口 ${BM.money(amount - remain)}）。AI 建议先执行『培训费调剂 30 万元』，调剂完成后再审批本单。`,
  };
  BM.state.approvals.unshift(doc);
  BM.saveState();
  return { ok: false, doc, remain, transferId: "SUG001" };
};

/* ---------- 预算编制流程 ---------- */
BM.planSaveRows = function (rows) {
  BM.state.plan.rows = rows;
  BM.saveState();
};

BM.planSetMode = function (mode) {
  BM.state.plan.mode = mode;
  BM.saveState();
};

/* 提交编制（公司行政负责人提交 → 公司预算管理员汇总；汇总后 → 集团审批） */
BM.planSubmit = function () {
  const p = BM.state.plan;
  const r = BM.state.role;
  if (r === "adminHead") {
    p.status = "submitted"; // 已提交，待公司预算管理员汇总
    p.submittedBy = "公司行政负责人 · " + (BM.DEPTS.find((d) => d.id === BM.state.deptId) || {}).name;
  } else if (r === "companyBudgeter") {
    p.status = "finance_approved"; // 已汇总，待集团审批
    p.submittedBy = "公司预算管理员 · 李静";
  }
  p.submittedTime = BM.today();
  BM.saveState();
  return p;
};

BM.planApprove = function () {
  BM.state.plan.status = "approved";
  BM.saveState();
  return BM.state.plan;
};

BM.planReject = function () {
  BM.state.plan.status = "rejected";
  BM.saveState();
  return BM.state.plan;
};

/* ---------- 决算 ---------- */
BM.finalConfirm = function () {
  BM.state.finalDone = true;
  BM.saveState();
};

/* ================================================================
 * v0.3：预算调整中心（财务经理）
 * ================================================================ */

/* 创建调整申请 */
BM.createAdjustment = function (type, projectId, amount, note) {
  const adj = {
    id: BM.uid("ADJ"),
    type,
    typeName: (BM.ADJUST_TYPES.find((t) => t.id === type) || {}).name || type,
    projectId,
    amount,
    note,
    status: "pending", // pending 待审批 / approved / rejected
    createdBy: "财务经理 · 李静",
    createdTime: BM.today(),
    ai: {
      verdict: amount > 200000 ? "review" : "pass",
      text:
        amount > 200000
          ? `调整金额较大（${BM.money(amount)}），AI 建议人工复核项目剩余预算与资金安排。`
          : `调整金额 ${BM.money(amount)}，AI 已核对项目预算与执行情况，建议通过。`,
    },
  };
  BM.state.adjustments.unshift(adj);
  BM.saveState();
  return adj;
};

/* 审批调整（总经理） */
BM.approveAdjustment = function (id, decision) {
  const a = BM.state.adjustments.find((x) => x.id === id);
  if (!a || a.status !== "pending") return;
  a.status = decision === "approve" ? "approved" : "rejected";
  a.manualDecision = decision;
  a.manualTime = BM.today();
  a.manualBy = "总经理 · 张明远";
  /* 批准后生效：更新项目预算 */
  if (decision === "approve") {
    const p = BM.PROJECTS.find((x) => x.id === a.projectId);
    if (p) {
      if (a.type === "add") p.budget += a.amount;
      if (a.type === "cut") p.budget = Math.max(0, p.budget - a.amount);
      p.remain = p.budget - p.used - p.frozen;
      p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;
    }
  }
  BM.saveState();
};

/* 员工按项目发起采购（v0.3：项目级） */
BM.requestPurchaseForProject = function (projectId, item) {
  const p = BM.PROJECTS.find((x) => x.id === projectId);
  if (!p) return { ok: false };
  const amount = (item && item.amount) || 20000;
  const remain = p.budget - p.used - p.frozen;
  const doc = {
    id: BM.uid("DOC"),
    title: (item && item.title) || p.name + " · 追加采购",
    catName: (BM.CATEGORIES.find((c) => c.id === p.catId) || {}).name,
    deptName: (BM.DEPTS.find((d) => d.id === p.deptId) || {}).name,
    supplier: "未来数码",
    amount,
    date: BM.today(),
    kind: "purchase",
    requester: "员工 · 张伟",
    projectId,
    projectName: p.name,
  };
  if (remain >= amount) {
    doc.status = "pending";
    doc.ai = {
      verdict: "pass",
      text: `项目「${p.name}」预算充足（剩余 ${BM.money(remain)}），AI 建议通过。`,
    };
    BM.state.approvals.unshift(doc);
    BM.saveState();
    return { ok: true, doc, remain };
  }
  doc.status = "pending";
  doc.ai = {
    verdict: "review",
    text: `项目「${p.name}」可用预算不足（缺口 ${BM.money(amount - remain)}）。AI 建议先申请预算调整或调剂。`,
  };
  BM.state.approvals.unshift(doc);
  BM.saveState();
  return { ok: false, doc, remain, suggestAdjust: true };
};

/* ================================================================
 * v0.5：预算规则 / 编制 LLM 归类
 * ================================================================ */

/* 财务经理保存规则 */
BM.saveRules = function (rules) {
  BM.state.rules = Object.assign({}, BM.DEFAULT_RULES, rules);
  BM.saveState();
};

/* 规则文案（页面显示用） */
BM.RULES_LABELS = {
  planMode: { topdown: "自上而下（总经理分解）", bottomup: "自下而上（部门上报）" },
  trackMode: { reimburse: "实际报销为准", advance: "申请单预跟踪" },
  surplusAction: { reclaim: "期末收回", suspend: "挂起保留", carry: "结转下期" },
  allowOverBudget: { true: "允许超预算（走审批）", false: "不允许超预算（拦截+追加流程）" },
};

/* 采购是否被规则拦截：项目剩余不足时 */
BM.isPurchaseBlocked = function (remain, amount) {
  if (remain >= amount) return false;
  /* 剩余不足时：不允许超预算 → 拦截；允许超预算 → 走审批接口 */
  return BM.state.rules.allowOverBudget === false;
};

/* ================================================================
 * v0.6：碰撞/争议 + 客户规则引擎 状态保存
 * ================================================================ */

/* 保存碰撞项（说明/证据/状态） */
BM.saveCollision = function (id, patch) {
  const c = BM.state.collisions.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  BM.saveState();
};

/* 保存客户规则引擎申报值 + 偏离原因 */
BM.saveRuleEngine = function (cat, apply, reason) {
  BM.state.ruleEngine[cat] = { apply: apply, reason: reason || "" };
  BM.saveState();
};

/* ================================================================
 * v0.13：编制工作台草稿（M3）持久化
 *   TODO（后端接入）：草稿保存对应
 *     POST /api/budget-cycles/{id}/tasks/{taskId}/draft  { items, monthly, method }
 *     多口径自动生成（财务/管理/事业部）由后端聚合服务返回，前端仅展示。
 * ================================================================ */

/* 保存整份编制草稿 */
BM.compileSaveDraft = function (draft) {
  BM.state.compile.method = draft.method || {};
  BM.state.compile.items = draft.items || {};
  BM.state.compile.monthly = draft.monthly || {};
  BM.state.compile.savedAt = BM.today();
  BM.saveState();
};

/* 读取编制草稿 */
BM.compileLoadDraft = function () {
  return BM.state.compile;
};

/* 单科目保存（实时）：payload = { method, amount, monthly, reason } */
BM.compileSaveSubject = function (subject, payload) {
  const p = payload || {};
  BM.state.compile.items[subject] = {
    method: p.method,
    amount: p.amount != null ? p.amount : (BM.state.compile.items[subject] && BM.state.compile.items[subject].amount),
    reason: p.reason || (BM.state.compile.items[subject] && BM.state.compile.items[subject].reason) || "",
  };
  if (p.monthly) BM.state.compile.monthly[subject] = p.monthly;
  BM.state.compile.method[subject] = p.method || BM.state.compile.method[subject] || "history";
  BM.state.compile.savedAt = BM.today();
  BM.saveState();
};

/* ================================================================
 * v0.13：M7 风险人工复核（提示非判定，结论回流审计）
 *   TODO（后端接入）：复核结论对应
 *     POST /api/risk-screening/{id}/review  { decision, note }
 *     写入 M10 审计：谁/何时/旧值/新值/证据。
 * ================================================================ */
BM.reviewRisk = function (id, decision, note) {
  BM.state.riskReview[id] = {
    decision: decision, // 'adopt' | 'reject'
    note: note || "",
    time: BM.today(),
  };
  BM.saveState();
};

/* ================================================================
 * v0.7：M5 碰撞调参即时反馈 — 协商确认持久化
 * 将调参结果（协商确认额）回写争议项，并重新计算差异/比例、置状态。
 *   TODO（后端接入）：确认动作在后端对应
 *     POST /api/disputes/{id}/resolve  { agreedAmount, note }
 *     差异/比例由后端 CALC 服务重算，前端仅负责采集与展示。
 * ================================================================ */
BM.confirmTuneAgreement = function (id, agreedAmount, note) {
  const c = BM.state.collisions.find((x) => x.id === id);
  if (!c) return null;
  c.apply = Math.round(agreedAmount); // 协商确认额成为新申报值
  const ar = BM.applyRule(c.cat, c.lastYear);
  c.suggest = ar.ok ? ar.baseline : c.lastYear;
  c.diff = c.apply - c.suggest;
  c.diffPct = c.suggest ? Math.round((c.diff / c.suggest) * 1000) / 10 : 0;
  if (note !== undefined) c.note = note;
  c.status = "已共识";
  c.tunedAt = BM.today();
  BM.saveState();
  return c;
};

/* ================================================================
 * v0.12：报销数据接入（员工发起 → 绑定项目 → 更新预算 → 超预算检查）
 * ================================================================ */

/* 员工发起报销：绑定项目/物料 → 更新项目已用 → 检查超预算 */
BM.submitReimburse = function (opts) {
  const p = BM.PROJECTS.find((x) => x.id === opts.projectId);
  if (!p) return { ok: false, msg: "项目不存在" };
  const amount = opts.amount || 0;
  if (amount <= 0) return { ok: false, msg: "报销金额需大于 0" };

  /* 生成报销单据 */
  const doc = {
    id: BM.uid("DOC"),
    title: (opts.title || "费用报销") + "（" + (opts.item || "费用") + "）",
    catName: (BM.CATEGORIES.find((c) => c.id === p.catId) || {}).name,
    deptName: (BM.DEPTS.find((d) => d.id === p.deptId) || {}).name,
    supplier: opts.supplier || "—",
    amount,
    date: BM.today(),
    kind: "reimburse",
    requester: "员工 · 张伟",
    projectId: p.id,
    projectName: p.name,
    materialName: opts.item || null,
    status: "已入账",
  };
  BM.state.approvals.unshift(doc);

  /* 更新项目已用（追踪数据来源：报销入账） */
  p.used += amount;
  p.remain = p.budget - p.used - p.frozen;
  p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;

  /* 超预算检查 */
  const over = p.used + p.frozen > p.budget;
  const remainAfter = p.budget - p.used - p.frozen;
  BM.saveState();

  return {
    ok: true,
    doc,
    over,
    remainAfter,
    project: p,
    msg: over
      ? `⚠️ 报销已入账，但「${p.name}」已超预算 ${BM.money(Math.abs(remainAfter))}`
      : `✅ 报销已入账，更新后「${p.name}」剩余 ${BM.money(remainAfter)}`,
  };
};

window.BM = BM;
})();
