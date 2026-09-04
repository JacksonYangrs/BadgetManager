/* ================================================================
 * smoke_roleswitch.js — 角色切换器接线回归测试（无浏览器）
 * 验证 F1 修复：roleSwitch.js 可加载 + BM.switchRole 轻量切换
 * （演示通道重建 user.roles、写回参数、刷新标签/导航）零运行时异常。
 * 运行：node tests/smoke_roleswitch.js
 * ================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- 增强 DOM 桩（appendChild 回填 parentNode，供 roleSwitch 参数行显隐用） ---------- */
const idMap = {};
class El {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this._handlers = {};
    this.style = {};
    this._innerHTML = "";
    this._id = "";
    this.value = "";
    this.checked = false;
    this.parentNode = null;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute() {}
  set className(v) { this._cls = v; }
  get className() { return this._cls || ""; }
  set innerHTML(v) {
    this._innerHTML = v;
    if (this.tag === "select") {
      const m = String(v).match(/<option[^>]*value="([^"]*)"/);
      if (m) this.value = m[1];
    }
  }
  get innerHTML() { return this._innerHTML; }
  set id(v) { this._id = v; if (v) idMap[v] = this; }
  get id() { return this._id; }
  set textContent(v) { this._text = v; }
  get textContent() { return this._text || ""; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); }
  fire(ev) { (this._handlers[ev] || []).forEach((f) => f({})); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
const documentStub = {
  createElement: (t) => new El(t),
  getElementById: (id) => idMap[id] || null,
  querySelector: () => new El("div"),
  addEventListener: () => {},
  body: new El("body"),
};

/* ---------- 运行沙箱 ---------- */
const sandbox = {
  window: {},
  document: documentStub,
  localStorage: (function () { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })(),
  console,
  Math, JSON, Date, Object, Array, String, Number, parseFloat, parseInt, isNaN,
  setTimeout: () => 0, clearTimeout: () => {}, addEventListener: () => {},
  location: { hash: "", search: "" },
  URLSearchParams,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

let failures = [];
function assert(name, cond) {
  if (cond) { console.log("  ✓ " + name); }
  else { console.log("  ✗ " + name); failures.push(name); }
}

/* 预置顶部栏/内容区/弹层元素，使 refreshQuicknav/refreshRoleLabel/renderRoleSwitch 可达 */
new El("div").id = "quicknav";
new El("span").id = "roleLabel";
new El("section").id = "viewPanel";
new El("div").id = "modalRoot";

try {
  load("data/organization.js");
  load("data/budget.js");
  load("data/transactions.js");
  load("data/rules-engine.js");
  load("data/kanban.js");
  load("core/utils.js");
  load("core/state.js");
  load("core/access.js");
  load("core/actions.js");
  load("core/api.js");
  load("views/login.js");
  load("views/roleSwitch.js");
  load("app.js");

  const BM = sandbox.window.BM;
  /* app.js 的 VIEWS 引用 renderXxx（晚绑定，仅 openView 特定视图时调用）；这里只走 wb-home */
  BM.renderWorkbenchHome = function () {};
  BM.renderDashboard = BM.renderDetails = BM.renderApproval = function () {};
  BM.toast = function () {};

  console.log("角色字典收敛到 9 个 role code：");
  assert("BM.ROLES 恰为 9 个角色", Object.keys(BM.ROLES).length === 9);

  /* 演示通道登录 ceo */
  BM.login("ceo");
  assert("登录后 state.role=ceo", BM.state.role === "ceo");

  /* 轻量切换：ceo → expense（基层费用责任岗） */
  BM.switchRole("expense", { centerId: "it", expenseType: "canteen", scopeCompany: "2010" });
  assert("switchRole 后 state.role=expense", BM.state.role === "expense");
  assert("switchRole 后 user.roles[0].code=expense（演示通道重建 user）", BM.state.user.roles[0].code === "expense");
  assert("switchRole 写回 expenseType=canteen", BM.state.expenseType === "canteen");
  assert("switchRole 写回 centerId=it", BM.state.centerId === "it");
  assert("switchRole 写回 scopeCompany=2010", BM.state.scopeCompany === "2010");

  /* 导航随新角色重算（expense 不含 accounts/basedata/balance/ai-config） */
  const views = BM.roleViews().join(",");
  assert("expense 角色导航 = wb-home,compile,kanban,rules", views === "wb-home,compile,kanban,rules");

  /* 顶部角色标签反映当前激活角色 */
  assert("roleLabel 文本含新角色名", (idMap["roleLabel"].textContent || "").indexOf(BM.ROLES.expense.name) >= 0);

  /* 切换器面板可打开（演示通道直接渲染，无 apiGet 依赖） */
  BM.renderRoleSwitch();
  assert("renderRoleSwitch 打开面板（modalRoot 挂载 modal-mask）", idMap["modalRoot"].children.length > 0);

  /* 非法角色不破坏状态 */
  BM.switchRole("nope", null);
  assert("非法角色被忽略，role 保持 expense", BM.state.role === "expense");
} catch (e) {
  failures.push("异常：" + e.stack);
  console.error(e);
}

console.log("");
if (failures.length) {
  console.log("✗ 角色切换器冒烟失败：" + failures.length + " 项");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
} else {
  console.log("✅ 角色切换器冒烟通过：roleSwitch 加载 + switchRole 轻量切换均正常");
}
