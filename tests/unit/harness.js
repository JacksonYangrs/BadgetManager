/* ================================================================
 * harness.js — 在 Node 下模拟浏览器环境，加载前端确定性内核供单测 require。
 * 不修改任何应用文件、不触网、不写真实 localStorage（仅内存桩）。
 * ================================================================ */

const path = require("path");

/* ---------- 浏览器全局桩 ---------- */
global.window = { BM: {} };

const _store = {};
global.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: () => { for (const k in _store) delete _store[k]; },
};
global.fetch = () => Promise.reject(new Error("unit test: network disabled"));
global.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  addEventListener() {},
  body: { appendChild() {} },
};

/* ---------- 加载顺序：data → utils → calc → state → access → actions → engine ---------- */
const ROOT = path.resolve(__dirname, "../../website");
require(path.join(ROOT, "data/organization.js"));
require(path.join(ROOT, "data/budget.js"));
require(path.join(ROOT, "data/transactions.js"));
require(path.join(ROOT, "data/rules-engine.js"));
require(path.join(ROOT, "data/kanban.js"));
require(path.join(ROOT, "core/utils.js"));     // BM.el / esc / money / fmtMoney（共享工具内核）
require(path.join(ROOT, "core/calc.js"));       // BM.calc.*
require(path.join(ROOT, "core/state.js"));      // 状态核心 + BM.state / loadState / saveState / resetState
require(path.join(ROOT, "core/access.js"));     // BM.getCat* / roleViews / scoped* ...
require(path.join(ROOT, "core/actions.js"));    // BM.approveDoc / requestPurchase / ...
require(path.join(ROOT, "core/engine.js"));     // BM.engineReply

const BM = global.window.BM;

/* ---------- 共享计数（模块缓存，所有测试文件共享同一 tally） ---------- */
const tally = { pass: 0, fail: 0, suites: [] };

function check(name, fn) {
  try {
    fn();
    tally.pass++;
    console.log("    ✓ " + name);
  } catch (e) {
    tally.fail++;
    console.log("    ✗ " + name + "  →  " + e.message);
  }
}

function suite(name, fn) {
  const p0 = tally.pass, f0 = tally.fail;
  console.log("\n  ▸ " + name);
  try { fn(); } catch (e) { console.log("    ! suite crashed: " + e.message); }
  const p = tally.pass - p0, f = tally.fail - f0;
  tally.suites.push({ name, pass: p, fail: f, ran: p + f });
}

function reset() { BM.resetState(); }

module.exports = { BM, check, suite, reset, tally };
