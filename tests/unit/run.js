/* ================================================================
 * run.js — 单元测试聚合运行器
 * 用法：node tests/unit/run.js
 * 各测试文件在 require 时即执行其 suite（共享 harness 的 tally）。
 * ================================================================ */
const { tally } = require("./harness");

require("./calc.test.js");
require("./state.test.js");
require("./engine.test.js");
require("./backend-consistency.test.js");
require("./state-drift.test.js");
require("./rule-baseline.test.js");

console.log("\n────────────────────────────────────────");
console.log("单元测试执行汇总");
console.log("────────────────────────────────────────");
tally.suites.forEach((s) => {
  const mark = s.fail ? "✗" : "✓";
  console.log("  " + mark + " " + s.name + "  (" + s.pass + " 通过 / " + s.fail + " 失败 / 共 " + s.ran + ")");
});
console.log("────────────────────────────────────────");
console.log("合计：" + tally.pass + " 通过 / " + tally.fail + " 失败");
console.log("────────────────────────────────────────");

process.exit(tally.fail ? 1 : 0);
