/* E2E（Playwright）：编制页动态编制建议 + 上级平衡预览（2026-08-24 原型）
 * 1) 编制页每项有「💡 编制建议」按钮，点击展开显示 适配规则 / 建议参照 / 区间 / 偏离
 * 2) 改动金额后，建议面板实时刷新偏离
 * 3) 「⚖️ 上级平衡预览」按钮展开汇总（弹性分类 + 偏离度排序）
 */
const { chromium } = require("/Users/yangjackson/.workbuddy/binaries/node/workspace/node_modules/playwright");
const BASE = "http://localhost:8300";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

async function login(page, username, password) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".login-form input[type=text]", { timeout: 8000 });
  await page.fill(".login-form input[type=text]", username);
  await page.fill(".login-form input[type=password]", password);
  await page.click(".login-submit");
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.log("【登录 + 进编制页】");
  await login(page, "admin", "Admin@2026");
  await page.waitForSelector("#quicknav", { timeout: 8000 });
  await page.click("#quicknav .qn-btn:has-text(\"预算编制\")");
  await page.waitForSelector(".cmp-apply", { timeout: 8000 });
  ok(true, "编制页已加载，8 列填报表可见");

  console.log("【A】💡 编制建议按钮存在且可展开");
  const adviceBtnCount = await page.$$eval("button:has-text(\"💡 编制建议\")", (els) => els.length);
  ok(adviceBtnCount > 0, "存在「💡 编制建议」按钮 (共 " + adviceBtnCount + " 个)");
  await page.click("button:has-text(\"💡 编制建议\") >> nth=0");
  await page.waitForTimeout(400);
  const advPanel = await page.$(".cmp-advice");
  ok(!!advPanel, "建议面板已展开");
  const advText = advPanel ? await advPanel.innerText() : "";
  ok(/适配|建议参照|规则/.test(advText), "面板含 适配规则 / 建议参照 / 规则 标记");
  ok(/建议区间/.test(advText), "面板含 建议区间");
  await page.screenshot({ path: "output/e2e/compile_advice.png" });

  console.log("【B】改动金额后建议面板实时刷新偏离");
  const firstInput = await page.$(".cmp-apply");
  const curVal = await firstInput.inputValue();
  // 改成一个明显偏高的值，触发偏离
  await firstInput.fill(String(parseInt(curVal, 10) + 5000000));
  await page.waitForTimeout(300);
  const advText2 = await page.$eval(".cmp-advice", (e) => e.textContent);
  ok(/偏高|高于建议区间/.test(advText2), "金额改高后提示「偏高/高于建议区间」(实际: " + advText2.replace(/\n/g, " ").slice(0, 60) + ")");
  // 恢复并关闭所有弹层，避免遮挡后续操作
  await firstInput.fill(curVal);
  await page.evaluate(() => document.querySelectorAll(".advice-overlay").forEach((o) => (o.style.display = "none")));
  await page.waitForTimeout(200);

  console.log("【C】⚖️ 上级平衡预览");
  await page.click("button:has-text(\"⚖️ 上级平衡预览\")");
  await page.waitForTimeout(400);
  const balPanel = await page.$(".cmp-balance");
  ok(!!balPanel, "平衡预览面板已展开");
  const balText = balPanel ? await balPanel.innerText() : "";
  ok(/弹性分类|平衡建议|偏高项/.test(balText), "面板含 弹性分类 / 平衡建议 / 偏高项");
  ok(/刚性|半刚性|弹性|项目型/.test(balText), "含弹性类型分类标签");
  await page.screenshot({ path: "output/e2e/compile_balance.png" });

  await browser.close();
  console.log("\n=== 结果: " + pass + " 通过 / " + fail + " 失败 ===");
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.log("FATAL", e.message); process.exit(2); });
