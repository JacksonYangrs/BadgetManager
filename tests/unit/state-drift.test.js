/* ================================================================
 * state-drift.test.js — Suite F · state.js 跨端共享纯函数漂移护栏
 * 背景：desktop website/core/state.js 与 mobile core/state.js 是两个
 *   不同应用域（视图 key / 数据模型 / 登录模型均不同），不应盲目合并
 *   （合并会破坏 mobile 导航）。但两者 copy-paste 了同一套纯格式化函数
 *   （money/fmtMoney/pct），是最易静默漂移的共享面。本 suite 用隔离 vm
 *   沙箱加载 mobile state.js，与 desktop 版本逐一对拍，锁死一致性。
 * ================================================================ */
const { BM: desktopBM, suite, check } = require("./harness");
const assert = require("assert");
const vm = require("vm");
const fs = require("fs");
const path = require("path");

function loadMobileStateSandbox() {
  const stubs = {
    DEMO_DATE: "2026-09-15",
    SUMMARY: { totalBudget: 0 },
    buildTopDownSuggestion: () => ({}),
    DEPTS: [], APPROVALS: [], SUGGESTIONS: [], DEFAULT_RULES: {},
    CATEGORIES: [], PROJECTS: [], MATERIALS: [], DOCS: [], ROLES: {},
    APPROVAL_RULES: [], SUGGESTED_QUESTIONS: [], RISKS: [], ADJUST_TYPES: [],
    projectInfo: () => ({}), scopedProjects: () => [],
  };
  const ctx = {
    window: { BM: Object.assign({}, stubs) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    console, Math, JSON, Date, Object, Array, String, Number,
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  const code = fs.readFileSync(path.resolve(__dirname, "../../website/mobile/core/state.js"), "utf8");
  vm.runInContext(code, ctx, { filename: "mobile/core/state.js" });
  return ctx.window.BM;
}

suite("Suite F · state.js 跨端共享纯函数漂移护栏（desktop vs mobile）", () => {
  const mob = loadMobileStateSandbox();
  const samples = [0, 1, 999, 12345, 10000, 1234567, 123456789, -500, 99999999];
  samples.forEach((n) => {
    check("BM.money(" + n + ") 两端一致", () => assert.strictEqual(desktopBM.money(n), mob.money(n)));
    check("BM.fmtMoney(" + n + ") 两端一致", () => assert.strictEqual(desktopBM.fmtMoney(n), mob.fmtMoney(n)));
    check("BM.pct(" + (n / 1000000) + ") 两端一致", () => assert.strictEqual(desktopBM.pct(n / 1000000), mob.pct(n / 1000000)));
  });
  check("两端均导出 uid（函数）", () => {
    assert.strictEqual(typeof desktopBM.uid, "function");
    assert.strictEqual(typeof mob.uid, "function");
  });
  check("mobile state.js 加载后 BM.state 就绪（defaultState 成功）", () => {
    assert.ok(mob.state && typeof mob.state === "object");
  });
});
