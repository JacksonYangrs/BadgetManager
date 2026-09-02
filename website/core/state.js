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
    status: "draft", // draft 编制中 / submitted 已提交（待公司预算管理员汇总） / finance_approved 已汇总（待集团 CEO 审批） / approved 已批准 / rejected
    totalBudget: total,
    rows: rows, // { deptId: amount }
    submittedBy: null,
    submittedTime: null,
  };
}

function defaultState() {
  return {
    role: "ceo", // 默认主角色（未登录 / 深链未指定时）
    deptId: "admin", // 部门经理所属部门
    loggedIn: false, // 是否已登录（v0.2：先登录再进入）
    /* 模块三：真实登录用户（后端认证）。user = {id, username, realName, org, roles[]}，token = 会话令牌 */
    user: null,
    token: null,
    approvals: JSON.parse(JSON.stringify(BM.APPROVALS)),
    suggestions: JSON.parse(JSON.stringify(BM.SUGGESTIONS)),
    // 已执行的调剂：{ catId: 追加金额 }
    transfers: {},
    // 已执行的采购：{ docId }
    executedDocs: {},
    plan: defaultPlanState(), // 预算编制
    finalDone: false, // 决算是否已确认
    adjustments: [], // 预算调整申请（财务经理发起 / 审批）
    rules: JSON.parse(JSON.stringify(BM.DEFAULT_RULES)), // 预算规划中的规则（财务经理可改）
    chatHistory: [], // [{role:'user'|'ai', text?, card?}]
    /* v0.6：组织范围（组织切换器，默认厦门三安 2010） */
    orgScope: "2010", // 单公司 code / "all" 集团
    /* v0.6：碰撞/争议（可编辑副本，申报值/说明/证据/状态持久化） */
    collisions: JSON.parse(JSON.stringify(BM.collisionItems)),
    /* v0.6：客户规则引擎——编制申报值 + 偏离原因 */
    ruleEngine: {}, // { [cat]: { apply, reason } }
    /* v0.13：编制工作台草稿（M3 九法 + 月度分解） */
    compile: {
      method: {},    // { [subject]: methodId }
      items: {},     // { [subject]: { amount, reason, method } }
      monthly: {},   // { [subject]: [12 月金额] }
      savedAt: null, // 草稿保存时间
    },
    /* v0.13：M7 风险人工复核结论留痕 */
    riskReview: {},  // { [riskId]: { decision: 'adopt'|'reject', note, time } }
    /* 阶段一：真实角色参数（深链 ?as=centerOwner&center= / ?as=expense&etype=） */
    centerId: "hr",        // 归口责任人当前归口的职能中心
    expenseType: "canteen",// 基层费用责任岗当前负责的费用类型
    scopeCompany: "2010",  // 法人公司角色当前所属公司（mock 默认厦门三安）
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
/* money / fmtMoney / el / esc 已收敛到 core/utils.js（先于本文件加载） */
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
/* 演示/快捷通道：不经过后端认证，直接以指定角色进入（?as= 参数、开发期演示）。
 * 构造一个本地 user 对象，让 roleViews 等按用户角色逻辑一致工作。 */
BM.login = function (roleId, deptId) {
  state.role = roleId;
  state.deptId = deptId || "admin";
  const r = BM.ROLES[roleId] || {};
  state.user = {
    id: 0,
    username: "demo:" + roleId,
    realName: r.title || r.name || roleId,
    org: null,
    roles: [{ code: roleId, name: r.name || roleId, desc: r.desc || "", views: ["wb-home", "compile", "kanban", "rules"], scope: r.scope || "all" }],
  };
  state.token = null;
  state.loggedIn = true;
  saveState();
};

/* 认证与统一请求层（apiLogin / apiFetch / apiGet / apiSend / handleSessionExpired / logout）
 * 已抽取到 core/api.js（共享内核，桌面端与移动端复用），保持单一真源。 */

/* 当前角色信息 */
BM.curRole = function () {
  return BM.ROLES[state.role] || BM.ROLES.ceo;
};

/* ---------- 可见页面（按角色） ---------- */
/* v0.4：采购项目并入预算总览双视图，不再单独菜单
 * 阶段一：扩展真实角色视图集合（映射文档 §3）。视图 key 复用现有 14 视图；
 *   masterData/归口责任工作台/压降下达/协商谈判区/auditTrail/copilot 为待建（Stage 1 不实现）。
 * 导航收敛（2026-08-23 Sponsor 定稿，2026-08-24 移除组织架构菜单项）：全角色仅 3 个核心功能 + 工作台首页：
 *   1. 预算编制（compile） 2. 预算跟踪（kanban） 3. 预算规划（rules，规则为其内容）。
 *   费控导入（importView）不作为菜单项，改为「预算跟踪」页右上角按钮弹出的二级子页面。
 *   系统管理员（admin）额外：预算工作人员（accounts）。
 *   组织架构图保留在「基础数据」页第 3 个 Tab（可编辑，admin/总经办），不再作为独立菜单项。
 * 模块三（2026-08-23）：真实登录用户按其角色 views 白名单取并集；演示通道（无 user）回退默认集合。 */
/* 导航固定顺序（ roleViews 返回的数组按此排序，确保「预算调整」紧跟「预算编制」之后）。 */
const NAV_ORDER = ["wb-home", "dashboard", "compile", "balance", "kanban", "rules", "track", "final", "adjust", "basedata", "accounts", "ai-config", "benchmark", "collision", "collisionTune", "importView", "riskView"];

BM.roleViews = function (roleId) {
  /* 汇总平衡：仅集团管理层可见（能看 balance）。
   * 上级集合与 canViewBenchmark 一致：ceo/cooLead/cooAnalyst。 */
  const UPPER = ["ceo", "cooLead", "cooAnalyst"];
  /* 基础数据维护角色（真实登录与演示通道共用，提升到函数作用域供下方两分支引用） */
  const BD_ROLES = ["admin", "cooAnalyst", "cooLead", "centerOwner"];
  /* 真实登录：取该用户全部角色的视图并集（views 来自后端 role 表，含 basedata 迁移），
   * 并兜底基础视图集合 BASE，确保 compile/kanban/rules 始终可见（与演示通道行为一致）。 */
  if (state.user && state.user.roles && state.user.roles.length && !roleId) {
    const BASE = ["wb-home", "compile", "kanban", "rules"];
    const set = new Set(BASE);
    state.user.roles.forEach((r) => (r.views || []).forEach((v) => set.add(v)));
    if (state.user.roles.some((r) => BD_ROLES.includes(r.code))) set.add("basedata");
    if (state.user.roles.some((r) => r.code === "admin")) set.add("accounts");
    if (state.user.roles.some((r) => ["admin", "cooAnalyst"].includes(r.code))) set.add("ai-config");
    if (state.user.roles.some((r) => UPPER.includes(r.code))) set.add("balance");
    return Array.from(set).sort((a, b) => NAV_ORDER.indexOf(a) - NAV_ORDER.indexOf(b));
  }
  /* 演示通道 / 显式指定角色：按角色 code 回退（与后端 role.views 对齐）。
   * importView（费控导入）不作为菜单项（见上方注释），仅经「预算跟踪」页按钮二级弹窗进入，故不入 BASE。 */
  const rid = roleId || state.role;
  const extra = BD_ROLES.includes(rid) ? ["basedata"] : [];
  if (UPPER.includes(rid) && rid !== "admin") {
    const arr = ["wb-home", "compile", "balance", "kanban", "rules"].concat(extra);
    if (rid === "cooAnalyst") arr.push("ai-config");
    return arr;
  }
  if (rid === "admin") return ["wb-home", "compile", "kanban", "rules", "accounts", "ai-config"].concat(extra);
  return ["wb-home", "compile", "kanban", "rules"].concat(extra);
};

/* 基础数据维护权限（前端闸门，与后端 requireBaseDataEditor 对齐）：
 * 管理员 / 总经办预算管理员 / 总经办负责人 / 职能中心归口责任人 可编辑。 */
BM.canEditBaseData = function () {
  const BD = ["admin", "cooAnalyst", "cooLead", "centerOwner"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => BD.includes(r.code));
  }
  return BD.includes(BM.state.role);
};

/* 预算工作人员（用户账户）维护权限闸门：管理员 / 总经办 / 归口责任人 / 集团 CEO（与后端 requireAccountsEditor 对齐） */
BM.canEditAccounts = function () {
  const AC = ["admin", "cooAnalyst", "cooLead", "centerOwner", "ceo"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => AC.includes(r.code));
  }
  return AC.includes(BM.state.role);
};

/* 组织架构维护权限（前端闸门，与后端 requireOrgEditor 对齐）：
 * 管理员 / 总经办负责人 / 总经办预算管理员 可编辑；财务经理 / 归口责任人仅查看。 */
BM.canEditOrg = function () {
  const ORG = ["admin", "cooLead", "cooAnalyst"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => ORG.includes(r.code));
  }
  return ORG.includes(BM.state.role);
};

/* 横向对标（benchmark）可见性：仅集团层（直接上级）可见；同级（兄弟单位）/ 下级不得查看。
 * 对应 Sponsor 约束「横向比较 功能只能给更高一级的领导或部门」。看板·总揽面板据此显隐对标子面板。 */
BM.canViewBenchmark = function (roleId) {
  const r = roleId || state.role;
  return r === "ceo" || r === "cooLead" || r === "cooAnalyst";
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
  rules: "预算规划",
  basedata: "基础数据",
  accounts: "预算工作人员",
  "ai-config": "AI 配置",
  benchmark: "对标",
  collision: "碰撞",
  collisionTune: "碰撞调参",
  compile: "预算编制",
  balance: "预算调整",
  kanban: "预算跟踪",
  importView: "费控导入",
  riskView: "AI 风险",
};

/* ---------- 数据范围过滤 ---------- */
/* 当前角色可见的部门 id 集合（null = 全部；范围统一由 BM.scopedData 承担） */
BM.scopeDeptIds = function () {
  /* 数据范围走 BM.scopedData（按公司/中心/本人项目），部门维度返回 null（全局）作为保守默认。 */
  return null;
};

/* 可见单据：范围过滤 */
BM.scopedDocs = function () {
  const depts = BM.scopeDeptIds();
  if (!depts) return BM.DOCS;
  return BM.DOCS.filter((d) => depts.indexOf(d.deptId) >= 0);
};

/* ================================================================
 * 阶段一：数据范围描述（V2 §2.2 权限原则）
 * 返回 { level, companyId, centerId, expenseType, subjectFilter }
 *   group=集团全量；company=本公司+下属；center=归口科目跨公司；self=仅本人项目
 * 供 dashboard 维度切换 / compile 双轨 / 各视图按角色裁剪数据使用。
 * ================================================================ */
BM.scopedData = function () {
  const r = state.role;
  const level = (BM.SCOPE_LEVELS && BM.SCOPE_LEVELS[r]) || "group";
  const out = { level: level, companyId: null, centerId: null, expenseType: null, subjectFilter: null };
  if (level === "company") {
    out.companyId = state.scopeCompany || "2010";
  } else if (level === "center") {
    out.centerId = state.centerId || "hr";
    out.center = (BM.FUNCTIONAL_CENTERS || []).find((c) => c.id === out.centerId);
    out.subjectFilter = out.center ? out.center.subjects : null;
  } else if (level === "self") {
    out.expenseType = state.expenseType || "canteen";
    const et = (BM.EXPENSE_TYPES || []).find((x) => x.id === out.expenseType);
    out.subjectFilter = et ? et.subjects : null;
  }
  return out;
};

/* 可见审批单：按角色范围过滤
 * 集团层=全量；法人公司层=本公司（TODO 多公司隔离，mock 暂全量）；
 * 归口=仅归口科目（TODO 按 subjectFilter 过滤 catName）；基层=本人发起。 */
BM.scopedApprovals = function () {
  const r = state.role;
  if (r === "ceo" || r === "cooLead" || r === "cooAnalyst") return state.approvals;
  if (r === "legalHead" || r === "adminHead" || r === "companyBudgeter") {
    /* TODO（V2 §8-14）：法人公司数据是否可被横向查看未确认；mock 暂全量，后续按 scopeCompany 过滤 */
    return state.approvals;
  }
  if (r === "centerOwner") {
    const subs = BM.scopedData().subjectFilter || [];
    if (!subs.length) return state.approvals;
    return state.approvals.filter((a) => subs.indexOf(a.catName) >= 0);
  }
  if (r === "expense") {
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

/* 提交编制（公司行政负责人提交 → 公司预算管理员汇总；汇总后 → 集团审批） */
BM.planSubmit = function () {
  const p = state.plan;
  const r = state.role;
  if (r === "adminHead") {
    p.status = "submitted"; // 已提交，待公司预算管理员汇总
    p.submittedBy = "公司行政负责人 · " + (BM.DEPTS.find((d) => d.id === state.deptId) || {}).name;
  } else if (r === "companyBudgeter") {
    p.status = "finance_approved"; // 已汇总，待集团审批
    p.submittedBy = "公司预算管理员 · 李静";
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
 * v0.5：预算规则 / 编制 LLM 归类
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
 * v0.6：碰撞/争议 + 客户规则引擎 状态保存
 * ================================================================ */

/* 保存碰撞项（说明/证据/状态） */
BM.saveCollision = function (id, patch) {
  const c = state.collisions.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  saveState();
};

/* 保存客户规则引擎申报值 + 偏离原因 */
BM.saveRuleEngine = function (cat, apply, reason) {
  state.ruleEngine[cat] = { apply: apply, reason: reason || "" };
  saveState();
};

/* ================================================================
 * v0.13：编制工作台草稿（M3）持久化
 *   TODO（后端接入）：草稿保存对应
 *     POST /api/budget-cycles/{id}/tasks/{taskId}/draft  { items, monthly, method }
 *     多口径自动生成（财务/管理/事业部）由后端聚合服务返回，前端仅展示。
 * ================================================================ */

/* 保存整份编制草稿 */
BM.compileSaveDraft = function (draft) {
  state.compile.method = draft.method || {};
  state.compile.items = draft.items || {};
  state.compile.monthly = draft.monthly || {};
  state.compile.savedAt = BM.today();
  saveState();
};

/* 读取编制草稿 */
BM.compileLoadDraft = function () {
  return state.compile;
};

/* 单科目保存（实时）：payload = { method, amount, monthly, reason } */
BM.compileSaveSubject = function (subject, payload) {
  const p = payload || {};
  state.compile.items[subject] = {
    method: p.method,
    amount: p.amount != null ? p.amount : (state.compile.items[subject] && state.compile.items[subject].amount),
    reason: p.reason || (state.compile.items[subject] && state.compile.items[subject].reason) || "",
  };
  if (p.monthly) state.compile.monthly[subject] = p.monthly;
  state.compile.method[subject] = p.method || state.compile.method[subject] || "history";
  state.compile.savedAt = BM.today();
  saveState();
};

/* ================================================================
 * v0.13：M7 风险人工复核（提示非判定，结论回流审计）
 *   TODO（后端接入）：复核结论对应
 *     POST /api/risk-screening/{id}/review  { decision, note }
 *     写入 M10 审计：谁/何时/旧值/新值/证据。
 * ================================================================ */
BM.reviewRisk = function (id, decision, note) {
  state.riskReview[id] = {
    decision: decision, // 'adopt' | 'reject'
    note: note || "",
    time: BM.today(),
  };
  saveState();
};


/* ================================================================
 * v0.7：M5 碰撞调参即时反馈 — 协商确认持久化
 * 将调参结果（协商确认额）回写争议项，并重新计算差异/比例、置状态。
 *   TODO（后端接入）：确认动作在后端对应
 *     POST /api/disputes/{id}/resolve  { agreedAmount, note }
 *     差异/比例由后端 CALC 服务重算，前端仅负责采集与展示。
 * ================================================================ */
BM.confirmTuneAgreement = function (id, agreedAmount, note) {
  const c = state.collisions.find((x) => x.id === id);
  if (!c) return null;
  c.apply = Math.round(agreedAmount); // 协商确认额成为新申报值
  const ar = BM.applyRule(c.cat, c.lastYear);
  c.suggest = ar.ok ? ar.baseline : c.lastYear;
  c.diff = c.apply - c.suggest;
  c.diffPct = c.suggest ? Math.round((c.diff / c.suggest) * 1000) / 10 : 0;
  if (note !== undefined) c.note = note;
  c.status = "已共识";
  c.tunedAt = BM.today();
  saveState();
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
