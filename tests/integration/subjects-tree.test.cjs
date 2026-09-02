/* ================================================================
 * subjects-tree.test.cjs — 经济事项 4 级分类树重构回归（集成测试）
 * 运行：node --experimental-sqlite tests/integration/subjects-tree.test.cjs
 * 断言：
 *   1. account_subject 建成 4 级分类树（L1=18 / L2=64 / L3=58 / L4=6，parent_id/level/path 关系正确）
 *   2. 叶子经济事项（300 个）subject_id 挂到树叶子节点（subjectPath 全命中）
 *   3. seed 幂等：重复执行不重复插入
 *   4. 向后兼容：平铺 listSubjects 含 level/path 字段、旧字段不删；listEvents 含 subjectId
 * 注意：用独立 DB 文件，不污染开发库。
 * ================================================================ */
const path = require("path");
const os = require("os");
const fs = require("fs");

process.env.DB_FILE = path.join(os.tmpdir(), "subjects-tree-test-" + Date.now() + ".db");

const assert = require("assert");
const dbm = require("../../server/db");
const db = dbm.init();
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "../../server/seeds/subject-tree.json"), "utf-8"));

const L1_CLASSES = [
  "人工", "工会经费", "残保金", "办公运营费", "外部服务", "税费", "材料消耗", "能源消耗",
  "安全生产", "其他费用", "其他", "员工持股受让回购股份过户费", "董事会会费", "搬迁费用",
  "财务费用", "主营业务成本", "营业税金及附加", "营业外支出",
];

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("  ✓ " + name); }
  catch (e) { failed++; console.log("  ✗ " + name + " → " + e.message); }
}

(async () => {
  console.log("▸ 经济事项 4 级分类树回归（集成）");

  await check("seed 树 L1 大类 = 18 个且逐一存在（level=1 / parentId=null）", () => {
    assert.strictEqual(L1_CLASSES.length, 18);
    for (const name of L1_CLASSES) {
      const row = db.prepare("SELECT * FROM account_subject WHERE code = ? AND name = ?").get(name, name);
      assert.ok(row, "缺少 L1 大类 " + name);
      assert.strictEqual(row.level, 1, name + " level 应为 1");
      assert.strictEqual(row.parent_id, null, name + " parent_id 应为 null");
    }
  });

  await check("account_subject 层级分布 = L1(18种子+6旧)/L2=64/L3=58/L4=6", () => {
    const cnt = (lv) => db.prepare("SELECT COUNT(*) AS c FROM account_subject WHERE level = ?").get(lv).c;
    assert.strictEqual(cnt(2), 64, "L2 节点数应为 64");
    assert.strictEqual(cnt(3), 58, "L3 节点数应为 58");
    assert.strictEqual(cnt(4), 6, "L4 节点数应为 6");
    // L1 = 18 种子大类 + 6 个旧平铺 demo 科目（migrateSubjects 生成的 6602.x）
    assert.strictEqual(cnt(1), 24, "L1 节点数应为 18(种子) + 6(旧demo) = 24");
  });

  await check("4 级示例「人工/人事费/中介服务费/普通中介费用」关系正确", () => {
    const l4 = db.prepare("SELECT * FROM account_subject WHERE code = ?").get("人工/人事费/中介服务费/普通中介费用");
    assert.ok(l4, "缺少 4 级叶子");
    assert.strictEqual(l4.level, 4);
    assert.strictEqual(l4.path, "人工/人事费/中介服务费/普通中介费用");
    const parent = db.prepare("SELECT * FROM account_subject WHERE id = ?").get(l4.parent_id);
    assert.strictEqual(parent.code, "人工/人事费/中介服务费", "parent 应为中介服务费");
  });

  await check("叶子经济事项 300 个，subject_id 全部挂到树叶子（path 命中）", () => {
    assert.strictEqual(seed.events.length, 300);
    let ok = 0, miss = 0;
    for (const e of seed.events) {
      const pathKey = e.subjectPath.join("/");
      const sub = db.prepare("SELECT id, level FROM account_subject WHERE code = ?").get(pathKey);
      const ev = db.prepare("SELECT subject_id FROM economic_event WHERE cat = ?").get(e.cat);
      if (!sub || !ev || ev.subject_id !== sub.id) { miss++; continue; }
      assert.strictEqual(sub.level, e.subjectPath.length, e.cat + " 叶子深度应为 " + e.subjectPath.length);
      ok++;
    }
    assert.strictEqual(ok, 300, "应有 300 个叶子正确挂载");
    assert.strictEqual(miss, 0, "所有叶子均应命中");
  });

  await check("seed 幂等：重复执行 seedSubjectTree + seedEventLeaves 不重复插入", () => {
    const beforeS = db.prepare("SELECT COUNT(*) AS c FROM account_subject").get().c;
    const beforeE = db.prepare("SELECT COUNT(*) AS c FROM economic_event").get().c;
    const r1 = dbm.seedSubjectTree(db);
    const r2 = dbm.seedEventLeaves(db);
    assert.strictEqual(r1.inserted, 0, "重复 seed 树 inserted 应为 0");
    assert.strictEqual(r2.inserted, 0, "重复 seed 叶子 inserted 应为 0");
    const afterS = db.prepare("SELECT COUNT(*) AS c FROM account_subject").get().c;
    const afterE = db.prepare("SELECT COUNT(*) AS c FROM economic_event").get().c;
    assert.strictEqual(afterS, beforeS, "account_subject 总数不应变化");
    assert.strictEqual(afterE, beforeE, "economic_event 总数不应变化");
  });

  await check("向后兼容：listSubjects 平铺含 level/path 且旧字段保留", () => {
    const list = dbm.listSubjects(db);
    assert.ok(Array.isArray(list) && list.length > 0);
    const s = list[0];
    for (const k of ["id", "code", "name", "cat", "center", "method", "controlLogic", "parentId", "sortNo"]) {
      assert.ok(k in s, "旧字段缺失: " + k);
    }
    assert.ok("level" in s && "path" in s, "应新增 level/path 字段");
  });

  await check("向后兼容：listEvents 平铺含 subjectId（叶子挂载不破坏）", () => {
    const list = dbm.listEvents(db);
    assert.ok(Array.isArray(list));
    const mounted = list.filter((e) => e.subjectId != null);
    assert.ok(mounted.length >= 300, "挂载 subjectId 的事件应 >= 300");
    assert.ok("subjectId" in list[0], "event 应含 subjectId");
  });

  await check("buildSubjectTree：返回树结构（含 children 嵌套）", () => {
    const tree = dbm.buildSubjectTree(db);
    assert.ok(Array.isArray(tree) && tree.length > 0);
    const rengong = tree.find((n) => n.name === "人工");
    assert.ok(rengong && Array.isArray(rengong.children), "「人工」节点应含 children");
    const fuli = rengong.children.find((n) => n.name === "福利费用");
    assert.ok(fuli && Array.isArray(fuli.children), "「人工/福利费用」应含 children");
    assert.ok(fuli.children.some((n) => n.name === "宿舍费用"), "「福利费用」下应有「宿舍费用」");
  });

  await check("层级 CRUD：createSubject 挂 parentId 自动推导 level/path；updateSubject 支持改父级", () => {
    const parent = db.prepare("SELECT * FROM account_subject WHERE code = ?").get("人工");
    const created = dbm.createSubject(db, { code: "TEST-L2", name: "测试子科目", parentId: parent.id });
    assert.ok(created && created.id, "创建应成功");
    assert.strictEqual(created.level, 2, "应推导 level=2");
    assert.strictEqual(created.path, "人工/测试子科目", "应推导 path");
    // 环检测：挂到自身
    const self = dbm.updateSubject(db, created.id, { parentId: created.id });
    assert.ok(self.error, "挂自身应报错");
    // 挂到自身后代（先建孙级再挂到孙级下）
    const child = dbm.createSubject(db, { code: "TEST-L3", name: "测试孙科目", parentId: created.id });
    const cyc = dbm.updateSubject(db, created.id, { parentId: child.id });
    assert.ok(cyc.error, "挂到后代应报错（环）");
    // 删除：有子科目应拦截
    const del = dbm.deleteSubject(db, created.id);
    assert.ok(del.error, "有子科目删除应拦截");
    // 清理：删子再删父
    assert.ok(dbm.deleteSubject(db, child.id).ok);
    assert.ok(dbm.deleteSubject(db, created.id).ok);
  });

  console.log("\n经济事项 4 级分类树回归：" + passed + " 通过 / " + failed + " 失败");
  try { fs.unlinkSync(process.env.DB_FILE); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();
