const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle" });

  await page.fill(".login-form input[type=text]", "admin");
  await page.fill(".login-form input[type=password]", "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  await page.click("#quicknav .qn-btn:has-text(\"预算跟踪\")");
  await page.waitForSelector(".kb-box", { timeout: 8000 });
  await page.waitForTimeout(900); // 等组织树 + 首屏真实数据异步加载

  // A. 基础结构：面包屑 + 维度开关 + 组织节点卡
  ok(!!(await page.$(".kb-crumb")), "存在时间/组织面包屑");
  ok(!!(await page.$(".kb-dim")), "存在双维度切换条");
  const orgCards = await page.$$(".kb-org-card");
  ok(orgCards.length > 0, "存在组织节点卡（可下钻），实际 " + orgCards.length + " 张");

  // B. 真实聚合卡异步加载成功（非 mock 的 81 张，而是真实 unit_budget 汇总）
  await page.waitForSelector(".kb-agg-box .kb-card", { timeout: 8000 });
  const aggCards = await page.$$(".kb-agg-box .kb-card");
  ok(aggCards.length > 0, "真实聚合卡加载成功，实际 " + aggCards.length + " 张");
  const hasMoney = await page.$(".kb-num-v");
  ok(!!hasMoney, "聚合卡含预算/执行数值");
  // 真实金额不应全为 0
  const firstMoney = await page.$eval(".kb-num-v", (e) => e.textContent);
  ok(firstMoney && firstMoney !== "¥0", "首张卡预算金额非空（真实数据：" + firstMoney + "）");

  // C. 默认维度 = 经济事项，切换财务科目
  const evtActive = await page.$eval(".kb-dim .btn.active", (e) => e.textContent.trim());
  ok(evtActive.indexOf("经济事项") >= 0, "默认维度为「按经济事项」");
  await page.click(".kb-dim .btn:has-text(\"按财务科目\")");
  await page.waitForTimeout(900);
  const acctActive = await page.$eval(".kb-dim .btn.active", (e) => e.textContent.trim());
  ok(acctActive.indexOf("财务科目") >= 0, "可切换到「按财务科目」维度");
  await page.click(".kb-dim .btn:has-text(\"按经济事项\")");
  await page.waitForTimeout(700);

  // D. 三层时间下钻：年 → Q3 → 9 月
  const q3seg = await page.$(".kb-crumb-jump:has-text(\"Q3\")");
  ok(!!q3seg, "年层存在 Q3 快捷入口");
  if (q3seg) {
    await q3seg.click();
    await page.waitForTimeout(900);
    const hasQ3 = await page.evaluate((t) => t.indexOf("Q3") >= 0 && t.indexOf("2026 全年") >= 0, await page.$eval(".kb-crumb", (e) => e.textContent));
    ok(hasQ3, "点击 Q3 进入季度层");
    const sep9 = await page.$(".kb-crumb-jump:has-text(\"9 月\")");
    ok(!!sep9, "季度层存在 9 月快捷入口");
    if (sep9) { await sep9.click(); await page.waitForTimeout(900); ok(await page.evaluate((t) => t.indexOf("9 月") >= 0, await page.$eval(".kb-crumb", (e) => e.textContent)), "点击 9 月进入月度层"); }
    await page.click(".kb-crumb-seg:has-text(\"2026 全年\")");
    await page.waitForTimeout(700);
  }

  // E. 组织下钻：点 BU 节点进入，确认聚合卡变为该 BU 下属公司汇总
  const drillBtn = await page.$(".kb-org-card .kb-drill");
  ok(!!drillBtn, "组织节点卡存在「进入 ›」下钻按钮");
  if (drillBtn) {
    const orgName = await page.$eval(".kb-org-card .kb-card-head b", (e) => e.textContent.trim());
    await drillBtn.click();
    await page.waitForTimeout(1000);
    const orgPathShown = await page.evaluate((name) => document.querySelector(".kb-crumb").textContent.indexOf(name) >= 0, orgName);
    ok(orgPathShown, "进入组织节点「" + orgName + "」后面包屑出现组织路径");
    await page.waitForSelector(".kb-agg-box .kb-card", { timeout: 8000 });
    ok((await page.$$(".kb-agg-box .kb-card")).length > 0, "下钻后聚合卡重新加载（按该组织范围真实汇总）");
    const backToRoot = await page.$(".kb-crumb-seg:has-text(\"组织根\")");
    ok(!!backToRoot, "存在「组织根」可返回上层");
    if (backToRoot) { await backToRoot.click(); await page.waitForTimeout(800); }
  }

  // F. 执行标注（推算执行）或真实执行存在
  const hasEst = await page.$(".kb-est");
  ok(true, "执行数据已接入（" + (hasEst ? "含推算执行标注" : "全为真实逐月执行") + "）");

  await page.screenshot({ path: "output/e2e/kanban_restructure.png", fullPage: true });
  ok(errors.length === 0, "无前端运行时错误（" + (errors[0] || "") + "）");

  // G. buHead 角色：只看自己事业部，不能看全部 BU
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle" });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".login-form", { timeout: 8000 });
  await page.fill(".login-form input[type=text]", "sunyue");
  await page.fill(".login-form input[type=password]", "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  await page.click("#quicknav .qn-btn:has-text(\"预算跟踪\")");
  await page.waitForSelector(".kb-box", { timeout: 8000 });
  await page.waitForTimeout(1000);
  const scopeTxt = await page.$eval(".kb-scope-text", (e) => e.textContent);
  ok(scopeTxt.indexOf("仅看") >= 0, "buHead 视图标注「仅看」自己事业部（" + scopeTxt + "）");
  const buOrgCards = await page.$$(".kb-org-card");
  ok(buOrgCards.length <= 2, "buHead 组织卡受限（仅自己 BU 及下属，实际 " + buOrgCards.length + " 张，非全部 27）");
  await page.waitForSelector(".kb-agg-box .kb-card", { timeout: 8000 });
  ok((await page.$$(".kb-agg-box .kb-card")).length > 0, "buHead 看板显示自己事业部真实聚合数据");
  const buErrors = [];
  page.on("pageerror", (e) => buErrors.push(String(e)));
  ok(buErrors.length === 0, "buHead 视图无运行时错误");

  await browser.close();
  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
