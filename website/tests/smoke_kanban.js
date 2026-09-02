/* ================================================================
 * smoke_kanban.js — 预算看板（kanban）渲染冒烟测试（无浏览器）
 * 复用 smoke_dom.js 的轻量 DOM 桩，真实执行 BM.renderKanban，
 * 覆盖两种角色：ceo（集团层，含横向对标面板）与 expense（基层，对标锁定）。
 * 运行：node tests/smoke_kanban.js
 * ================================================================ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute() {} // SVG 图表属性（桩，仅保证不抛错）
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
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); }
  /* 桩：querySelector 返回同类元素桩（真实浏览器按选择器返回，桩里保证可链式 addEventListener） */
  querySelector() { return new El(this.tag); }
  querySelectorAll() { return []; }
}
const documentStub = {
  createElement: (t) => new El(t),
  createElementNS: (ns, t) => new El(t), // dashboard 预测图用 SVG
  getElementById: (id) => idMap[id] || null,
  addEventListener: () => {},
};

const sandbox = {
  window: {},
  document: documentStub,
  localStorage: (function () { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; })(),
  console, Math, JSON, Date, Object, Array, String, Number, parseFloat, parseInt, isNaN,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

let errs = [];
try {
  load("data/data.js");
  load("core/utils.js");
  load("core/state.js");
  load("core/engine.js");
  load("core/calc.js");
  load("views/details.js");   // track 依赖 BM.filterDetails
  load("views/projects.js");  // dashboard 依赖 BM.renderProjView
  load("views/dashboard.js"); // 看板·总揽
  load("views/benchmark.js"); // 看板·总揽·对标（仅上级）
  load("views/track.js");     // 看板·执行进展
  load("views/final.js");     // 看板·执行进展·年度决算
  load("views/risk-view.js"); // 看板·偏差预警
  load("views/monthly-split.js"); // 月度拆解二级页（双堆叠条）
  load("views/kanban.js");
  sandbox.window.BM.renderRoleHint = function () {};
  sandbox.window.BM.toast = function () {};
  sandbox.window.BM.state.loggedIn = true;
} catch (e) {
  errs.push("加载阶段异常：" + e.stack);
}

const BM = sandbox.window.BM;

/* 角色 1：ceo（集团层）→ 看板含横向对标面板 */
try {
  BM.state.role = "ceo";
  const c1 = new El("div");
  BM.renderKanban(c1);
  if (!c1.children.length) throw new Error("看板未生成内容");
  console.log("✓ renderKanban(ceo) 渲染无异常（应含对标面板）");
} catch (e) {
  errs.push("renderKanban(ceo) 异常：" + e.stack);
}

/* 角色 2：expense（基层）→ 对标面板应锁定（不渲染 renderBenchmark） */
try {
  BM.state.role = "expense";
  const c2 = new El("div");
  BM.renderKanban(c2);
  console.log("✓ renderKanban(expense) 渲染无异常（对标应锁定）");
} catch (e) {
  errs.push("renderKanban(expense) 异常：" + e.stack);
}

/* 权限谓词复核 */
try {
  const can = BM.canViewBenchmark;
  if (can("ceo") !== true || can("expense") !== false || can("cooAnalyst") !== true) {
    throw new Error("canViewBenchmark 权限谓词不符：" + [can("ceo"), can("expense"), can("cooAnalyst")].join(","));
  }
  console.log("✓ canViewBenchmark 权限谓词正确（ceo/cooAnalyst=可见，expense=不可见）");
} catch (e) {
  errs.push("canViewBenchmark 异常：" + e.stack);
}

/* 导航集合复核：基础 3 功能 + 首页；组织架构已收敛进「基础数据」第 3 Tab，不再作为独立菜单（模块三） */
try {
  const v = BM.roleViews("expense").join(",");
  if (v !== "wb-home,compile,kanban,rules") throw new Error("roleViews 集合不符：" + v);
  console.log("✓ roleViews 已收敛为 wb-home,compile,kanban,rules（无独立组织架构入口）");
  const a = BM.roleViews("admin").join(",");
  if (a !== "wb-home,compile,kanban,rules,accounts,ai-config,basedata") throw new Error("admin roleViews 不符：" + a);
  console.log("✓ admin roleViews 含 accounts 账户管理 + basedata 基础数据");
} catch (e) {
  errs.push("roleViews 异常：" + e.stack);
}

/* 月度拆解二级页渲染（双堆叠条） */
try {
  BM.state.role = "expense";
  BM.state.monthlySplit = { cat: "食堂费用", total: 3492000, ratio: BM.baseMonthlyRatio.slice() };
  const mc = new El("div");
  BM.renderMonthlySplit(mc);
  if (!mc.children.length) throw new Error("月度拆解未生成内容");
  console.log("✓ renderMonthlySplit 渲染无异常（双堆叠条 + 12 月明细）");
} catch (e) {
  errs.push("renderMonthlySplit 异常：" + e.stack);
}

if (errs.length) {
  console.log("\n❌ 发现 " + errs.length + " 处问题：");
  errs.forEach((e) => console.log("  - " + e));
  process.exit(1);
} else {
  console.log("\n✅ 看板冒烟通过：kanban 渲染 / 权限谓词 / 导航收敛均正常");
}
