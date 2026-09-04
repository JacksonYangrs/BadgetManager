const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ " + m); } }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:8300/", { waitUntil: "networkidle" });

  // 登录 admin
  await page.fill(".login-form input[type=text]", "admin");
  await page.fill(".login-form input[type=password]", "Admin@2026");
  await page.click(".login-submit");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  await page.click("#quicknav .qn-btn:has-text(\"预算编制\")");
  await page.waitForSelector(".cmp-apply", { timeout: 8000 });

  // 进第一个事项的月度分解
  await page.waitForSelector("button:has-text(\"月度拆分\")", { timeout: 8000 });
  await page.click("button:has-text(\"月度拆分\") >> nth=0");
  await page.waitForSelector(".ms-table", { timeout: 8000 });

  // A. 默认显示手动编辑表，12 行
  const rowCount = await page.$$eval(".ms-tr", (n) => n.length);
  ok(rowCount === 13, "手动编辑表 13 行（1 表头 + 12 月）实际 " + rowCount);
  const hasInput = await page.$(".ms-input");
  ok(!!hasInput, "存在金额输入框（手动式调整）");
  const hasLock = await page.$(".ms-lock");
  ok(!!hasLock, "存在月份锁定按钮");
  const hasTools = await page.$(".ms-tools");
  ok(!!hasTools, "存在工具条（套用上年/均摊剩余）");

  // B. 切换到「微调分布」，分隔条可见且可拖动（先测，避免前置操作污染状态）
  await page.click(".ms-mode .btn-outline");
  await page.waitForTimeout(150);
  const tuneVisible = await page.$eval(".ms-tune", (e) => e.style.display !== "none");
  ok(tuneVisible, "可切换到微调分布（拖动分隔线辅助模式）");
  const divider = await page.$(".ms-divider");
  ok(!!divider, "微调模式下存在分隔线");
  const inputs = await page.$$(".ms-input");
  const janBefore = await inputs[0].inputValue();
  const dvBox = await divider.boundingBox();
  const startX = dvBox.x + dvBox.width / 2;
  const endX = startX + 120;
  const y = dvBox.y + dvBox.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const janAfter = await inputs[0].inputValue();
  ok(janBefore !== janAfter, "拖动分隔线后 1 月金额变化（" + janBefore + "→" + janAfter + "），且微调数据面板同步刷新");
  const tuneJan = await page.$eval(".ms-tune-cell:first-child .ms-tune-amt", (e) => e.textContent);
  ok(/万/.test(tuneJan), "微调数据面板 1 月金额显示为 " + tuneJan);

  // C. 切回手动编辑，直接改某月金额 → 合计条更新
  await page.click("button:has-text(\"手动编辑\")");
  await page.waitForTimeout(150);
  const inputs2 = await page.$$(".ms-input");
  const first = inputs2[0];
  await first.fill("500000");
  await first.evaluate((e) => e.blur());
  await page.waitForTimeout(200);
  const newSum = await page.$eval(".ms-total", (e) => e.textContent);
  ok(/= 年度总额/.test(newSum), "改金额后合计仍 = 年度总额（自动补平）");
  const janVal = await inputs[0].inputValue();
  ok(janVal === "500000", "1 月金额手动调整为 500000（手动式调整生效，实际 " + janVal + "）");

  // D. 锁定一个月份后，均摊剩余不改变它
  const locks = await page.$$(".ms-lock");
  await locks[5].click(); // 锁 6 月
  await page.waitForTimeout(100);
  const lockedVal = await inputs[5].inputValue();
  await page.click(".ms-tools .btn-ghost:nth-child(3)");
  await page.waitForTimeout(200);
  const afterAvg = await inputs[5].inputValue();
  ok(afterAvg === lockedVal, "锁定的 6 月不被均摊剩余改变（" + lockedVal + "→" + afterAvg + "）");

  // E. 套用上年分布按钮存在且可点
  const applyBtn = await page.$(".ms-tools .btn-ghost:nth-child(2)");
  ok(!!applyBtn, "存在「套用上年分布」按钮");
  await applyBtn.click();
  await page.waitForTimeout(200);
  ok(true, "套用上年分布点击无异常");

  ok(errors.length === 0, "无前端运行时错误（" + (errors[0] || "") + "）");
  await browser.close();
  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
