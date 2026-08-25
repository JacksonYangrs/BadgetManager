/**
 * 预算规则 Tab1 分组归类真机验收
 * 验证 renderRuleCards（Tab1 当前版本 与 Tab4 草案预览共用）按
 * 「编制规则 / 监督规则」两组渲染：编制组含基线比例+编制方式；监督组含执行追踪+期末余量+超预算。
 * 运行：node tests/e2e/rules_grouping.e2e.cjs
 */
const PW = "/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright";
const { chromium } = require(PW);
const BASE = "http://localhost:8300";

const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail: detail || "" });
  console.log((cond ? "  ✅ " : "  ❌ ") + name + (detail ? " => " + detail : ""));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto(BASE + "/?as=admin", { waitUntil: "networkidle" });

  // 登录 admin，注入 token（renderRules 内 fetch 规则需鉴权）
  await page.evaluate(async () => {
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "Admin@2026" }),
    });
    const d = await r.json();
    BM.state.token = d.token; BM.state.role = "admin";
  });

  // 打开预算规则视图（设 currentView='rules'，SPA 不再覆盖）
  await page.evaluate(() => BM.openView("rules"));
  await page.waitForSelector(".rule-group", { timeout: 8000 });

  const out = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane="current"]');
    const groups = Array.from(pane.querySelectorAll(".rule-group"));
    const titles = groups.map((g) => (g.querySelector(".rule-group-title") || {}).textContent || "");
    const text = pane.textContent || "";
    return {
      groupCount: groups.length,
      titles,
      baselineCards: pane.querySelectorAll(".scope-card").length,
      hasPlanMode: text.includes("编制方式"),
      hasTrack: text.includes("执行追踪方式"),
      hasSurplus: text.includes("期末余量处理"),
      hasOver: text.includes("超预算处理"),
      // 编制方式出现在第一个组、监督三类出现在第二个组
      planInFirst: groups[0] ? groups[0].textContent.includes("编制方式") : false,
      superInSecond: groups[1] ? (groups[1].textContent.includes("执行追踪方式") && groups[1].textContent.includes("期末余量处理") && groups[1].textContent.includes("超预算处理")) : false,
      hasGenBtn: pane.textContent.includes("调整并发布新版本"),
    };
  });

  console.log("\n=== 预算规则 Tab1 分组归类验收 ===");
  check("无运行时错误", pageErrors.length === 0, JSON.stringify(pageErrors));
  check("渲染出两个分组容器", out.groupCount === 2, "groupCount=" + out.groupCount);
  check("组标题为 编制规则 / 监督规则", out.titles.join("|") === "编制规则|监督规则", out.titles.join("|"));
  check("含基线比例 scope-cards", out.baselineCards > 0, "baselineCards=" + out.baselineCards);
  check("编制组含 编制方式(planMode)", out.hasPlanMode && out.planInFirst, "planInFirst=" + out.planInFirst);
  check("监督组含 执行追踪方式", out.hasTrack && out.superInSecond, "superInSecond=" + out.superInSecond);
  check("监督组含 期末余量处理", out.hasSurplus && out.superInSecond);
  check("监督组含 超预算处理", out.hasOver && out.superInSecond);
  check("Tab1 已移除「调整并发布新版本」按钮", !out.hasGenBtn, "hasGenBtn=" + out.hasGenBtn);

  const pass = checks.filter((c) => c.ok).length;
  const total = checks.length;
  console.log(`\n=== 结果: ${pass} 通过 / ${total - pass} 失败 ===`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch((e) => {
  console.error("E2E 异常:", e);
  process.exit(2);
});
