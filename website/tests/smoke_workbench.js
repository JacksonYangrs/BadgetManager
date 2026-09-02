/* ================================================================
 * smoke_workbench.js — 工作台差异化首页（T6b）回归测试（无浏览器）
 * 验证：① scopeTextFor 9 角色责任叙事（无 cooAnalyst 错配）
 *       ② entryCardsFor 按角色入口卡 + 视图目标
 *       ③ roleFocusQuestion 9 角色关注点问题（动态 Copilot 口径）
 *       ④ formatTipsAnswer 纯文本 → 关注点列表
 *       ⑤ renderHome 9 角色渲染零运行时异常（apiGet/apiSend 打桩）
 * 运行：node tests/smoke_workbench.js
 * ================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- 增强 DOM 桩（querySelector 返回可写元素，含 remove/closest） ---------- */
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
    this.dataset = {};
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
  fire(ev) { (this._handlers[ev] || []).forEach((f) => f({ target: this, closest: () => null })); }
  querySelector() { return new El("div"); }
  querySelectorAll() { return []; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  closest() { return null; }
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
  Promise, Set, Map,
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

try {
  load("data/data.js");
  load("core/utils.js");
  load("core/state.js");
  load("core/api.js");
  load("views/workbench.js");

  const BM = sandbox.window.BM;
  const scopeTextFor = sandbox.scopeTextFor;
  const roleFocusQuestion = sandbox.roleFocusQuestion;
  const entryCardsFor = sandbox.entryCardsFor;
  const formatTipsAnswer = sandbox.formatTipsAnswer;

  /* 打桩：workbench.js 依赖的外部渲染 + 网络层 */
  BM.renderRoleHint = function () {};
  BM.renderNotificationList = function () {};
  BM.apiGet = function () {
    return Promise.resolve({ totalBudget: 1200000, totalExec: 400000, remain: 800000, execRate: 33.3, units: 6, topOverspent: [{ cat: "IT 设备", over: 200000 }] });
  };
  BM.apiSend = function () {
    return Promise.resolve({ aiEnabled: true, answer: "第一点\n- 第二点\n* 第三点" });
  };

  console.log("【差异化① scopeText 9 角色】");
  const ROLES9 = ["admin", "ceo", "cooLead", "cooAnalyst", "legalHead", "adminHead", "companyBudgeter", "centerOwner", "expense"];
  assert("scopeTextFor 存在", typeof scopeTextFor === "function");
  const texts = {};
  ROLES9.forEach((r) => {
    const t = scopeTextFor(r);
    texts[r] = t;
    assert(`scopeTextFor(${r}) 非空`, !!t && t.length > 5);
  });
  const uniq = new Set(ROLES9.map((r) => texts[r]));
  assert("9 角色责任叙事互不相同（无兜底错配）", uniq.size === 9);
  assert("ceo 文案含『全局数据』", texts.ceo.indexOf("全局数据") >= 0);
  assert("centerOwner 文案含『归口科目』", texts.centerOwner.indexOf("归口科目") >= 0);
  assert("admin 文案含『平台运维』", texts.admin.indexOf("平台运维") >= 0);
  assert("adminHead 不再误写成 cooAnalyst 文案", texts.adminHead !== texts.cooAnalyst);

  console.log("【差异化③ entryCardsFor 入口卡】");
  const cooLeadCards = entryCardsFor("cooLead");
  assert("cooLead 2 块入口卡", cooLeadCards.length === 2);
  assert("cooLead 含编制入口 → compile", cooLeadCards.some((c) => c.view === "compile"));
  assert("cooLead 含协商入口 → collisionTune", cooLeadCards.some((c) => c.view === "collisionTune"));
  const adminCards = entryCardsFor("admin");
  assert("admin 2 块入口卡", adminCards.length === 2);
  assert("admin 含账户入口 → accounts", adminCards.some((c) => c.view === "accounts"));
  assert("admin 含基础数据入口 → basedata", adminCards.some((c) => c.view === "basedata"));
  const ceoCards = entryCardsFor("ceo");
  assert("ceo 1 块入口卡（+总览卡=2 块）", ceoCards.length === 1);
  assert("expense 无入口卡（走我负责的项目面板）", entryCardsFor("expense").length === 0);

  console.log("【差异化④ roleFocusQuestion + formatTipsAnswer】");
  assert("roleFocusQuestion 存在", typeof roleFocusQuestion === "function");
  ROLES9.forEach((r) => assert(`roleFocusQuestion(${r}) 非空`, !!roleFocusQuestion(r) && roleFocusQuestion(r).length > 5));
  const tips = formatTipsAnswer("第一点\n- 第二点\n* 第三点");
  assert("formatTipsAnswer 转成 3 条 • 列表", tips.split("<br>").length === 3 && tips.indexOf("• 第一点") === 0 && tips.indexOf("• 第二点") >= 0);
  assert("formatTipsAnswer 空串降级", formatTipsAnswer("") === "AI 未返回关注点。");

  console.log("【⑤ renderHome 9 角色渲染零异常】");
  BM.state.loggedIn = true;
  let renderErrors = 0;
  ROLES9.forEach((r) => {
    BM.state.role = r;
    const container = new El("div");
    try {
      BM.renderWorkbenchHome(container);
      assert(`renderHome(${r}) 渲染无异常`, true);
    } catch (e) {
      renderErrors++;
      assert(`renderHome(${r}) 渲染无异常`, false);
      console.error("    " + r + " → " + e.stack.split("\n").slice(0, 3).join("\n"));
    }
  });
  assert("9 角色 renderHome 全部通过", renderErrors === 0);

} catch (e) {
  failures.push("异常：" + e.stack);
  console.error(e);
}

console.log("");
if (failures.length) {
  console.log("✗ 工作台差异化冒烟失败：" + failures.length + " 项");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
} else {
  console.log("✅ 工作台差异化冒烟通过：9 角色 scopeText/入口卡/关注点/renderHome 均正常");
}
