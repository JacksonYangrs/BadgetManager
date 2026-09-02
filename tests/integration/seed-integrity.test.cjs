/* ================================================================
 * seed-integrity.test.cjs — 4 级分类树 seed 数据完整性校验（L3）
 * 运行：node tests/integration/seed-integrity.test.cjs
 * 数据源：server/seeds/subject-tree.json（E3 抽取脚本产物，权威口径）
 * 断言：
 *   1. 结构：{version, source[2], subjects[146], events[300]}
 *   2. 层级分布：L1=18 / L2=64 / L3=58 / L4=6（合计 146）
 *   3. path 唯一（不重）；parentPath 关系完整（父存在且 level=自身 level-1）；无环
 *   4. events 300 个 cat 唯一（不重）；subjectPath 全部命中 subjects（不漏）
 *   5. 【挂载有效性】events 挂载节点必须有效（在树中存在）；经济事项可挂中间科目节点（如「物料消耗」→L2）
 *   6. 与 Excel 源对账：source 含 2 个权威 Excel 源
 * 注意：纯静态校验 seed json，不依赖数据库，可单独运行。
 * ================================================================ */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const SEED_FILE = path.join(__dirname, "../../server/seeds/subject-tree.json");
const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + " → " + e.message); }
}

(async () => {
  console.log("▸ 4 级分类树 seed 数据完整性校验（L3）");

  const subjects = seed.subjects || [];
  const events = seed.events || [];

  await check("seed 结构完整：含 version/source/subjects/events", () => {
    assert.ok(seed.version != null, "缺 version");
    assert.ok(Array.isArray(seed.source) && seed.source.length >= 2, "source 应含 ≥2 个源");
    assert.strictEqual(subjects.length, 146, "subjects 应为 146");
    assert.strictEqual(events.length, 300, "events 应为 300");
  });

  await check("与 Excel 源对账：source 含 2 个权威源（费控科目明细表 + 总经办预算逻辑）", () => {
    const src = (seed.source || []).join("|");
    assert.ok(/费控系统预算科目明细表|会计科目名称/.test(src), "缺源① 费控科目明细表");
    assert.ok(/预算逻辑|1\.预算逻辑/.test(src), "缺源② 总经办预算逻辑");
  });

  await check("层级分布 = L1=18 / L2=64 / L3=58 / L4=6（合计 146）", () => {
    const lv = { 1: 0, 2: 0, 3: 0, 4: 0 };
    subjects.forEach((s) => { if (lv[s.level] != null) lv[s.level]++; });
    assert.deepStrictEqual(lv, { 1: 18, 2: 64, 3: 58, 4: 6 }, "层级分布不符: " + JSON.stringify(lv));
  });

  await check("path 唯一（不重）：146 个唯一 path", () => {
    const set = new Set(subjects.map((s) => s.path));
    assert.strictEqual(set.size, 146, "path 应唯一，实际唯一数 " + set.size);
  });

  await check("parentPath 关系完整：父存在且 level = 自身 level - 1（146 条全对）", () => {
    const byPath = {};
    subjects.forEach((s) => (byPath[s.path] = s));
    let miss = 0, badLevel = 0;
    subjects.forEach((s) => {
      if (s.level === 1) {
        if (s.parentPath !== null) miss++;
        return;
      }
      const p = byPath[s.parentPath];
      if (!p) { miss++; return; }
      if (p.level !== s.level - 1) badLevel++;
    });
    assert.strictEqual(miss, 0, "parentPath 缺失/悬空 " + miss);
    assert.strictEqual(badLevel, 0, "父级 level 不符 " + badLevel);
  });

  await check("无环：所有 parentPath 链向上收敛到 L1（无环、无重复）", () => {
    const byPath = {};
    subjects.forEach((s) => (byPath[s.path] = s));
    subjects.forEach((s) => {
      const seen = new Set();
      let cur = s;
      while (cur && cur.level > 1) {
        if (seen.has(cur.path)) throw new Error("检测到环: " + cur.path);
        seen.add(cur.path);
        cur = byPath[cur.parentPath];
      }
      if (cur && cur.level !== 1) throw new Error("链未收敛到 L1: " + s.path);
    });
  });

  await check("events 300 个 cat 唯一（不重）", () => {
    const set = new Set(events.map((e) => e.cat));
    assert.strictEqual(set.size, 300, "cat 应唯一，实际唯一数 " + set.size);
  });

  await check("events subjectPath 全部命中 subjects（不漏）", () => {
    const byPath = new Set(subjects.map((s) => s.path));
    let miss = 0;
    events.forEach((e) => {
      const k = (Array.isArray(e.subjectPath) ? e.subjectPath : [e.subjectPath]).join("/");
      if (!byPath.has(k)) miss++;
    });
    assert.strictEqual(miss, 0, "有 " + miss + " 个事件 subjectPath 未命中");
  });

  /* 挂载有效性（语义修正 2026-09-02）：经济事项可挂中间科目节点（全库仅 1 条
   * 「物料消耗」→「材料消耗-物料消耗」L2 节点）。不再强制叶子，仅要求挂载节点在树中存在。 */
  await check("【挂载有效性】events 挂载节点均为有效科目节点（在树中存在，不强制叶子）", () => {
    const byPath = new Set(subjects.map((s) => s.path));
    let miss = 0;
    events.forEach((e) => {
      const k = (Array.isArray(e.subjectPath) ? e.subjectPath : [e.subjectPath]).join("/");
      if (!byPath.has(k)) miss++;
    });
    assert.strictEqual(miss, 0, "有 " + miss + " 个事件挂载到不存在的科目节点");
  });

  /* 钉死已知边缘情况：「物料消耗」挂「材料消耗-物料消耗」中间节点（该节点另有 9 个 L3 子科目），防回归 */
  await check("【中间节点挂载】「物料消耗」挂在「材料消耗-物料消耗」中间节点（含子节点）", () => {
    const ev = events.find((e) => e.cat === "物料消耗");
    assert.ok(ev, "缺少「物料消耗」事件");
    const arr = (Array.isArray(ev.subjectPath) ? ev.subjectPath : [ev.subjectPath]);
    assert.deepStrictEqual(arr, ["材料消耗", "物料消耗"], "「物料消耗」挂载路径应为 材料消耗/物料消耗");
    const byPath = {};
    subjects.forEach((s) => (byPath[s.path] = s));
    const node = byPath["材料消耗/物料消耗"];
    assert.ok(node, "缺少「材料消耗/物料消耗」科目节点");
    assert.strictEqual(node.level, 2, "该节点应为 L2");
    const childCount = subjects.filter((s) => s.parentPath === "材料消耗/物料消耗").length;
    assert.ok(childCount > 0, "该节点应有子节点（中间节点，非叶子），实际子节点 " + childCount);
  });

  console.log("\n4 级分类树 seed 数据完整性：" + passed + " 通过 / " + failed + " 失败");
  process.exit(failed ? 1 : 0);
})();
