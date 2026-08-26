/* ================================================================
 * backend-consistency.test.js — Suite D：前后端计算口径一致性契约（真实执行）
 * 直接 require 后端无副作用纯函数模块 server/pure-calc.js 与前端内核，
 * 真实执行两端 decomposeMonthly 并比对：
 *   1) 前端 BM.MONTHLY_WEIGHTS 与后端 MONTHLY_WEIGHTS 字面量一致；
 *   2) 同一年度额下逐月分布一致；
 *   3) 多组输入 + 自定义权重下两端仍一致；
 *   4) 移动端 index.html 已引用桌面 calc.js（统一内核，防第三份实现漂移）。
 * 修复前（前端相对权重 vs 后端百分比）两端分布不一致 → 预期 FAIL；
 * 修复后两端共用同一份 MONTHLY_WEIGHTS → 全绿。CI 锁死口径漂移。
 * ================================================================ */
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { BM, check, suite } = require("./harness");
const { MONTHLY_WEIGHTS: backendWeights, decomposeMonthly: backendDecompose } = require("../../server/pure-calc");

suite("Suite D · 前后端 decomposeMonthly 口径一致性（真实跨端校验）", () => {

  check("前端/后端共享同一份 MONTHLY_WEIGHTS 字面量", () => {
    assert.deepStrictEqual(
      BM.MONTHLY_WEIGHTS,
      backendWeights,
      "\n  前端 BM.MONTHLY_WEIGHTS: " + JSON.stringify(BM.MONTHLY_WEIGHTS) +
      "\n  后端 MONTHLY_WEIGHTS:    " + JSON.stringify(backendWeights)
    );
  });

  check("decomposeMonthly 输出逐月一致（同一年度额）", () => {
    const annual = 1200000;
    const fm = BM.calc.decomposeMonthly(annual); // 真实前端内核
    const bk = backendDecompose(annual);          // 真实后端纯函数
    assert.deepStrictEqual(
      fm,
      bk,
      "\n  前端: " + JSON.stringify(fm) + "\n  后端: " + JSON.stringify(bk)
    );
  });

  check("两端均满足：长度12 且 和=年度额（多组卫生检查）", () => {
    const cases = [1200000, 100000, 987654, 0];
    cases.forEach((annual) => {
      const fm = BM.calc.decomposeMonthly(annual);
      const bk = backendDecompose(annual);
      assert.strictEqual(fm.length, 12, "前端长度");
      assert.strictEqual(bk.length, 12, "后端长度");
      assert.strictEqual(fm.reduce((a, b) => a + b, 0), annual, "前端和=" + annual);
      assert.strictEqual(bk.reduce((a, b) => a + b, 0), annual, "后端和=" + annual);
    });
  });

  check("覆盖权重：传入自定义 12 项权重时两端分布仍一致", () => {
    const annual = 600000;
    const w = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2];
    const fm = BM.calc.decomposeMonthly(annual, w);
    const bk = backendDecompose(annual, w);
    assert.deepStrictEqual(fm, bk, "自定义权重下两端应一致");
  });

  check("跨端：移动端 index.html 已引用桌面 calc.js（统一内核，防第三份实现漂移）", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../website/mobile/index.html"), "utf8");
    assert.ok(
      html.includes('../core/calc.js'),
      "website/mobile/index.html 必须 <script src=\"../core/calc.js\"> 复用共享计算内核，避免移动端自成第三份实现"
    );
  });

});
