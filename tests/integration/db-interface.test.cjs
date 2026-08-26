/* ================================================================
 * db-interface.test.cjs — db.js 组合根接口回归（集成测试，独立于单元套件）
 * 运行：node --experimental-sqlite tests/integration/db-interface.test.cjs
 * 目的：锁定 db.js 作为组合根，必须完整、按引用合并 9 个业务子模块的导出。
 *        防止未来重构（继续拆文件 / 调整聚合）时误删或漏合函数，导致
 *        server.js / tests / 前端脚本依赖的 dbm.* 调用静默失效。
 * ================================================================ */
const path = require("path");

/* 组合根当前聚合的 9 个业务模块（见 docs/architecture/module-breakdown-2026-08-26.md）。
 * 注意：ai-gateway / ai-budget-decision / expense-import 是内部依赖，刻意不暴露给 db 根。 */
const SUBMODULES = [
  "organization",
  "auth",
  "subjects",
  "events",
  "budget-compile",
  "budget-execution",
  "rules",
  "ai-policy-extract",
  "notifications",
];

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + " → " + e.message); }
}

(async () => {
  const db = require(path.resolve(__dirname, "../../server/db"));

  console.log("▸ db.js 组合根接口回归（集成）");

  await check("db 暴露 DB_FILE（初始化路径）", () => {
    if (typeof db.DB_FILE !== "string" || !db.DB_FILE) throw new Error("DB_FILE 缺失或非字符串");
  });

  await check("db 暴露 init()（幂等初始化入口）", () => {
    if (typeof db.init !== "function") throw new Error("init 非函数");
  });

  let totalExported = 0;
  for (const m of SUBMODULES) {
    const mod = require(path.resolve(__dirname, "../../server/modules/" + m));
    const keys = Object.keys(mod);
    await check(`子模块 ${m} 全部导出按引用并入 db（${keys.length} 项）`, () => {
      const missing = [];
      for (const k of keys) {
        if (!Object.prototype.hasOwnProperty.call(db, k)) { missing.push(k); continue; }
        if (db[k] !== mod[k]) missing.push(k + "(引用不一致)");
      }
      if (missing.length) throw new Error("缺失/不一致: " + missing.join(", "));
      totalExported += keys.length;
    });
  }

  await check(`合计导出 ${totalExported} 个符号全部锁定`, () => {
    const expected = SUBMODULES.reduce((n, m) => n + Object.keys(require(path.resolve(__dirname, "../../server/modules/" + m))).length, 0) + 2;
    if (Object.keys(db).length < expected) throw new Error("db 导出数 < 预期 " + expected);
  });

  console.log("\n组合根接口回归：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
