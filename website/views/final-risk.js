/* ================================================================
 * final-risk.js — 决算与偏差模块（Sponsor 定稿：从预算看板移出）
 * 承载：① 年度决算（renderFinal）② 偏差预警（renderRiskView）
 *       ③ 横向对标（renderBenchmark，仅上级可见）
 * 入口：工作台首页卡 / #finalRisk 直达
 * ================================================================ */
var BM = window.BM || {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function kbSection(title, hint) {
  const sec = el("div", "kb-section");
  const h = el("div", "kb-sec-head");
  h.innerHTML =
    '<div class="kb-sec-title">' + esc(title) + "</div>" +
    (hint ? '<div class="kb-sec-hint">' + esc(hint) + "</div>" : "");
  sec.appendChild(h);
  const body = el("div", "kb-sec-body");
  sec.appendChild(body);
  return { sec: sec, body: body };
}

BM.renderFinalRisk = function (container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">决算与偏差</div>
      <div class="page-desc">年度决算 · 偏差预警 · 横向对标（仅上级可见）</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "finalRisk");

  /* ① 年度决算 */
  const s1 = kbSection("年度决算", "预算 vs 预计执行 · 年度结余/超支处理");
  if (BM.renderFinal) BM.renderFinal(s1.body);
  page.appendChild(s1.sec);

  /* ② 偏差预警 */
  const s2 = kbSection("偏差预警", "AI 风险筛查（提示非判定）");
  if (BM.renderRiskView) BM.renderRiskView(s2.body);
  page.appendChild(s2.sec);

  /* ③ 横向对标（仅上级可见） */
  if (BM.canViewBenchmark && BM.canViewBenchmark()) {
    const s3 = kbSection("横向对标", "同类科目跨单位横向排列 · 仅上级可见");
    if (BM.renderBenchmark) BM.renderBenchmark(s3.body);
    page.appendChild(s3.sec);
  } else {
    const s3 = kbSection("横向对标", "仅对直接上级（集团层）开放");
    s3.body.appendChild(
      el("div", "kb-locked", "🔒 横向对标仅对直接上级（集团层）开放，同级 / 下级不可查看")
    );
    page.appendChild(s3.sec);
  }

  container.appendChild(page);
};

window.BM = BM;
