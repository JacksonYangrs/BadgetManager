/* ================================================================
 * state.js — 状态管理与本地持久化
 * 管理：审批单、AI 建议、预算调剂（追加预算）、重置 Demo
 * ================================================================ */

var BM = window.BM || {};
const LS_KEY = "bm-demo-state-v1";

/* ---------- 工具 ---------- */
function uid(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 9999);
}

function pct(n) {
  return Math.round(n * 10) / 10 + "%";
}

function todayStr() {
  return BM.DEMO_DATE;
}

/* ---------- 状态对象 ---------- */
function defaultPlanState() {
  /* 编制：自上而下建议（按当前总预算分配） */
  const total = BM.SUMMARY.totalBudget;
  const topdown = BM.buildTopDownSuggestion(total);
  const rows = {};
  BM.DEPTS.forEach((d) => (rows[d.id] = topdown[d.id] || 0));
  return {
    mode: "topdown", // topdown 自上而下 / bottomup 自下而上
    status: "draft", // draft 编制中 / submitted 已提交（待财务汇总） / finance_approved 财务已汇总（待总经理批） / approved 已批准 / rejected
    totalBudget: total,
    rows: rows, // { deptId: amount }
    submittedBy: null,
    submittedTime: null,
  };
}

function defaultState() {
  return {
    role: "boss", // boss 总经理 / manager 部门经理 / staff 员工 / finance 财务管理员
    deptId: "admin", // 部门经理所属部门
    loggedIn: false, // 是否已登录（v0.2：先登录再进入）
    approvals: JSON.parse(JSON.stringify(BM.APPROVALS)),
    suggestions: JSON.parse(JSON.stringify(BM.SUGGESTIONS)),
    // 已执行的调剂：{ catId: 追加金额 }
    transfers: {},
    // 已执行的采购：{ docId }
    executedDocs: {},
    plan: defaultPlanState(), // 预算编制
    finalDone: false, // 决算是否已确认
    adjustments: [], // 预算调整申请（财务经理发起 / 审批）
    rules: JSON.parse(JSON.stringify(BM.DEFAULT_RULES)), // 财务规则（财务经理可改）
    chatHistory: [], // [{role:'user'|'ai', text?, card?}]
  };
}

let state = null;

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = Object.assign(defaultState(), JSON.parse(raw));
      BM.state = state;
      return;
    }
  } catch (e) {
    /* ignore */
  }
  state = defaultState();
  BM.state = state;
}

function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
}

function resetState() {
  state = defaultState();
  BM.state = state;
  saveState();
  return state;
}

BM.state = state;
BM.loadState = loadState;
loadState(); // 立即初始化，确保任何调用路径 state 就绪
BM.saveState = saveState;
BM.resetState = resetState;
/* money / fmtMoney / el / esc 已收敛到 ../core/utils.js（先于本文件加载） */
BM.pct = pct;
BM.uid = uid;
BM.today = todayStr;

/* ================= 预算访问（考虑调剂） ================= */

/* 返回科目当前可用预算（原预算 + 调入 - 调出） */
BM.getCatBudget = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  if (!cat) return 0;
  let adj = 0;
  Object.keys(state.transfers).forEach((k) => {
    if (k.startsWith("in:" + catId)) adj += state.transfers[k];
    if (k.startsWith("out:" + catId)) adj -= state.transfers[k];
  });
  return cat.budget + adj;
};

BM.getCatUsed = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.used : 0;
};

BM.getCatFrozen = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.frozen : 0;
};

BM.getCatRemain = function (catId) {
  return BM.getCatBudget(catId) - BM.getCatUsed(catId) - BM.getCatFrozen(catId);
};

BM.getCatExecRate = function (catId) {
  const b = BM.getCatBudget(catId);
  return b ? Math.round((BM.getCatUsed(catId) / b) * 1000) / 10 : 0;
};

/* ================= 审批操作 ================= */

BM.approveDoc = function (id, decision) {
  const a = state.approvals.find((x) => x.id === id);
  if (!a) return;
  a.status = decision === "approve" ? "approved" : "rejected";
  a.manualDecision = decision;
  a.manualTime = todayStr();
  saveState();
};

/* ================= 建议操作 ================= */

/* 采纳建议 → 执行对应动作（预算调剂 / 生成采购单等） */
BM.adoptSuggestion = function (id) {
  const s = state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "pending") return null;

  s.status = "adopted";
  s.adoptedTime = todayStr();

  const result = { suggestion: s, docs: [], transfer: null };

  if (s.id === "SUG001") {
    // 培训 → IT 调剂 30 万
    const key = "in:it";
    state.transfers[key] = 300000;
    state.transfers["out:training"] = 300000;
    result.transfer = {
      from: "培训费",
      to: "IT 设备",
      amount: 300000,
      approvedBy: "财务 · 李静",
      time: todayStr(),
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
      date: todayStr(),
      kind: "contract",
      note: "AI 建议 · 统一供应商降本 8%",
    };
    state.approvals.unshift(doc);
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
      date: todayStr(),
      kind: "process",
      note: "AI 建议 · 采购周期优化",
    };
    state.approvals.unshift(doc);
    result.docs.push(doc);
  }

  if (s.id === "SUG004") {
    // 已被忽略，不会走到这里
  }

  saveState();
  return result;
};

BM.ignoreSuggestion = function (id) {
  const s = state.suggestions.find((x) => x.id === id);
  if (!s || s.status !== "pending") return;
  s.status = "ignored";
  saveState();
};

BM.revertSuggestion = function (id) {
  const s = state.suggestions.find((x) => x.id === id);
  if (!s) return;
  if (s.id === "SUG001" && s.status === "adopted") {
    delete state.transfers["in:it"];
    delete state.transfers["out:training"];
  }
  if (s.id === "SUG002" || s.id === "SUG003") {
    state.approvals = state.approvals.filter((d) => !(d.note && d.note.indexOf("AI 建议") >= 0));
  }
  s.status = "pending";
  delete s.adoptedTime;
  saveState();
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
    date: todayStr(),
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
    state.approvals.unshift(doc);
    saveState();
    return { ok: true, doc, remain };
  }

  // 预算不足 → 建议先调剂
  doc.status = "pending";
  doc.ai = {
    verdict: "review",
    text: `预算检查：IT 设备可用预算不足（缺口 ${BM.money(amount - remain)}）。AI 建议先执行『培训费调剂 30 万元』，调剂完成后再审批本单。`,
  };
  state.approvals.unshift(doc);
  saveState();
  return { ok: false, doc, remain, transferId: "SUG001" };
};

/* ================= 审批链计算 ================= */
BM.getApprovalChain = function (amount) {
  const rule = BM.APPROVAL_RULES.find((r) => amount <= r.max);
  return rule ? rule.chain : BM.APPROVAL_RULES[BM.APPROVAL_RULES.length - 1].chain;
};

/* ================================================================
 * v0.2：角色 / 权限 / 编制 / 决算
 * ================================================================ */

/* ---------- 登录 ---------- */
BM.login = function (roleId, deptId) {
  state.role = roleId;
  state.deptId = deptId || "admin";
  state.loggedIn = true;
  saveState();
};

/* logout / apiLogin / apiFetch / apiGet / apiSend / handleSessionExpired
 * 由 ../core/api.js（共享内核）提供，此处不重复定义，保持单一真源。 */

/* 当前角色信息 */
BM.curRole = function () {
  return BM.ROLES[state.role] || BM.ROLES.boss;
};

/* ---------- 可见页面（按角色） ---------- */
/* v0.4：采购项目并入预算总览双视图，不再单独菜单 */
BM.roleViews = function (roleId) {
  const r = roleId || state.role;
  if (r === "boss") {
    return ["wb-home", "dashboard", "approval", "decisions", "plan", "track", "adjust", "final"];
  }
  if (r === "finance") {
    return ["wb-home", "dashboard", "approval", "decisions", "plan", "track", "adjust", "rules", "final"];
  }
  if (r === "manager") {
    return ["wb-home", "dashboard", "approval", "plan", "track"];
  }
  // staff：首页 + 预算总览 + 预算编制（按本人负责项目）+ 我的申请
  return ["wb-home", "dashboard", "plan", "approval"];
};

/* 导航标签 */
BM.NAV_LABELS = {
  "wb-home": "工作台首页",
  dashboard: "预算总览",
  /* details 已移除（v0.6） */
  approval: "审批中心",
  decisions: "决策中心",
  plan: "预算编制",
  track: "预算追踪",
  final: "决算",
  adjust: "预算调整",
  rules: "预算规则",
};

/* ---------- 数据范围过滤 ---------- */
/* 当前角色可见的部门 id 集合（null = 全部） */
BM.scopeDeptIds = function () {
  const r = state.role;
  if (r === "boss" || r === "finance") return null; // 全部
  if (r === "manager") return [state.deptId]; // 本部门
  if (r === "staff") return ["it"]; // 员工所在部门（张伟 IT 部）
  return null;
};

/* 可见单据：范围过滤 */
BM.scopedDocs = function () {
  const depts = BM.scopeDeptIds();
  if (!depts) return BM.DOCS;
  return BM.DOCS.filter((d) => depts.indexOf(d.deptId) >= 0);
};

/* 可见审批单：boss/finance 全部；manager 本部门；staff 本人发起 */
BM.scopedApprovals = function () {
  const r = state.role;
  if (r === "boss" || r === "finance") return state.approvals;
  if (r === "manager") {
    const deptName = (BM.DEPTS.find((d) => d.id === state.deptId) || {}).name;
    return state.approvals.filter((a) => a.deptName === deptName || !a.deptName);
  }
  if (r === "staff") {
    return state.approvals.filter((a) => a.requester);
  }
  return state.approvals;
};

/* ---------- 预算编制流程 ---------- */
BM.planSaveRows = function (rows) {
  state.plan.rows = rows;
  saveState();
};

BM.planSetMode = function (mode) {
  state.plan.mode = mode;
  saveState();
};

/* 提交编制（部门经理提交 → 财务汇总；财务汇总 → 总经理批） */
BM.planSubmit = function () {
  const p = state.plan;
  const r = state.role;
  if (r === "manager") {
    p.status = "submitted"; // 已提交，待财务汇总
    p.submittedBy = "部门经理 · " + (BM.DEPTS.find((d) => d.id === state.deptId) || {}).name;
  } else if (r === "finance") {
    p.status = "finance_approved"; // 财务已汇总，待总经理批
    p.submittedBy = "财务管理员 · 李静";
  }
  p.submittedTime = todayStr();
  saveState();
  return p;
};

BM.planApprove = function () {
  state.plan.status = "approved";
  saveState();
  return state.plan;
};

BM.planReject = function () {
  state.plan.status = "rejected";
  saveState();
  return state.plan;
};

/* ---------- 决算 ---------- */
BM.finalConfirm = function () {
  state.finalDone = true;
  saveState();
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
    createdTime: todayStr(),
    ai: {
      verdict: amount > 200000 ? "review" : "pass",
      text:
        amount > 200000
          ? `调整金额较大（${BM.money(amount)}），AI 建议人工复核项目剩余预算与资金安排。`
          : `调整金额 ${BM.money(amount)}，AI 已核对项目预算与执行情况，建议通过。`,
    },
  };
  state.adjustments.unshift(adj);
  saveState();
  return adj;
};

/* 审批调整（总经理） */
BM.approveAdjustment = function (id, decision) {
  const a = state.adjustments.find((x) => x.id === id);
  if (!a || a.status !== "pending") return;
  a.status = decision === "approve" ? "approved" : "rejected";
  a.manualDecision = decision;
  a.manualTime = todayStr();
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
  saveState();
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
    date: todayStr(),
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
    state.approvals.unshift(doc);
    saveState();
    return { ok: true, doc, remain };
  }
  doc.status = "pending";
  doc.ai = {
    verdict: "review",
    text: `项目「${p.name}」可用预算不足（缺口 ${BM.money(amount - remain)}）。AI 建议先申请预算调整或调剂。`,
  };
  state.approvals.unshift(doc);
  saveState();
  return { ok: false, doc, remain, suggestAdjust: true };
};

/* ================================================================
 * v0.5：财务规则 / 编制 LLM 归类
 * ================================================================ */

/* 财务经理保存规则 */
BM.saveRules = function (rules) {
  state.rules = Object.assign({}, BM.DEFAULT_RULES, rules);
  saveState();
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
  return state.rules.allowOverBudget === false;
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
    date: todayStr(),
    kind: "reimburse",
    requester: "员工 · 张伟",
    projectId: p.id,
    projectName: p.name,
    materialName: opts.item || null,
    status: "已入账",
  };
  state.approvals.unshift(doc);

  /* 更新项目已用（追踪数据来源：报销入账） */
  p.used += amount;
  p.remain = p.budget - p.used - p.frozen;
  p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;

  /* 超预算检查 */
  const over = p.used + p.frozen > p.budget;
  const remainAfter = p.budget - p.used - p.frozen;
  saveState();

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
