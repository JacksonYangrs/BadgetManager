/* ================================================================
 * engine.test.js — Suite C：BM.engineReply 意图路由（确定性关键词规则）
 * 验证「项目/采购/为什么/怎么办/超预算/还剩/问候/兜底」各分支命中正确子类。
 * ================================================================ */
const assert = require("assert");
const { BM, check, suite, reset } = require("./harness");

suite("Suite C · engine.js 意图路由", () => {

  check("项目查询 → replyProjects (type=text, 含'项目')", () => {
    reset();
    const r = BM.engineReply("我负责的项目还剩多少预算？");
    assert.strictEqual(r.type, "text");
    assert.ok(r.text.indexOf("项目") >= 0);
  });

  check("采购显示器 → type=execute, 标题正确", () => {
    reset();
    const r = BM.engineReply("我要采购 10 台显示器");
    assert.strictEqual(r.type, "execute");
    assert.strictEqual(r.title2, "显示器批量采购（10 台）");
  });

  check("采购服务器 → type=execute, 金额 200000", () => {
    reset();
    const r = BM.engineReply("我要采购服务器");
    assert.strictEqual(r.type, "execute");
    assert.strictEqual(r.title2, "服务器采购");
    assert.strictEqual(r.amount, 200000);
  });

  check("为什么办公用品超预算 → replyAnalyze (type=analyze)", () => {
    reset();
    const r = BM.engineReply("为什么办公用品超预算？");
    assert.strictEqual(r.type, "analyze");
    assert.ok(r.title.indexOf("办公用品") >= 0);
  });

  check("怎么办/怎么解决 → replyRecommend (3 条建议)", () => {
    reset();
    const r = BM.engineReply("怎么办，怎么解决预算超支？");
    assert.strictEqual(r.type, "recommend");
    assert.ok(Array.isArray(r.items) && r.items.length === 3);
  });

  check("哪个部门会超预算 → replyForecast (type=predict, 5 项)", () => {
    reset();
    const r = BM.engineReply("哪个部门会超预算？");
    assert.strictEqual(r.type, "predict");
    assert.strictEqual(r.items.length, 5);
  });

  check("办公用品还剩多少 → replyQuery (含科目名)", () => {
    reset();
    const r = BM.engineReply("办公用品还剩多少？");
    assert.strictEqual(r.type, "text");
    assert.ok(r.text.indexOf("办公用品") >= 0);
  });

  check("问候 → type=text", () => {
    reset();
    const r = BM.engineReply("你好");
    assert.strictEqual(r.type, "text");
    assert.ok(r.text.indexOf("超预算") >= 0);
  });

  check("兜底（无关键词）→ type=text 且含能力引导", () => {
    reset();
    const r = BM.engineReply("今天天气真不错");
    assert.strictEqual(r.type, "text");
    assert.ok(r.text.indexOf("预测") >= 0);
  });

});
