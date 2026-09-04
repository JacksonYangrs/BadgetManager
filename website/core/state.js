/* ================================================================
 * core/state.js — 状态核心（唯一持有 state 闭包变量）
 * 迁移自 core/state.js（原 803 行上帝文件，2026-09-04 拆分）
 * 依赖：data/*（先于本文件加载）
 * 职责：工具 uid/pct/todayStr、defaultPlanState/defaultState、state 闭包变量、
 *   loadState/saveState/resetState + 初始化（BM.state 赋值 + loadState() 立即执行）
 * 说明：本文件保留 state 闭包变量与 BM.state 双写；
 *   access.js / actions.js 统一改用 BM.state（loadState/resetState 保证 BM.state 恒指向当前状态对象）。
 * ================================================================ */

(function () {
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

window.BM = BM;
})();
