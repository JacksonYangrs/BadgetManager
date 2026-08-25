/* ================================================================
 * decisions.js — 决策中心（AI 建议 → 采纳 → 自动执行 → 可回滚）
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

const STATUS_UI = {
  pending: `<span class="badge badge-info">待处理</span>`,
  adopted: `<span class="badge badge-ok">已采纳执行</span>`,
  ignored: `<span class="badge badge-gray">已忽略</span>`,
};

function renderDecisions(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">决策中心</div>
      <div class="page-desc">AI 主动发现的优化机会 · 采纳即自动生成单据进入审批 · 支持回滚</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "decisions");

  /* 已生效调剂提示 */
  const transferKeys = Object.keys(BM.state.transfers);
  if (transferKeys.length > 0) {
    const t = el("div", "conclusion ok");
    t.innerHTML = `✅ 已执行预算调剂：培训费 → IT 设备 30 万元（财务李静已确认）· 演示可回滚`;
    t.style.marginBottom = "14px";
    page.appendChild(t);
  }

  const list = el("div", "");
  BM.state.suggestions.forEach((s) => {
    list.appendChild(renderSugCard(s));
  });
  page.appendChild(list);
  container.appendChild(page);
}

function renderSugCard(s) {
  const card = el("div", "dec-card");
  const impactHtml = s.impact
    .map((i) => `<span class="impact-chip ${i.cls === "warn" ? "warn" : ""}">${esc(i.text)}</span>`)
    .join("");

  card.innerHTML = `<div class="dec-head">
    <span class="badge badge-accent">${esc(s.typeLabel)}</span>
    <div class="dec-title">${esc(s.title)}</div>
    <div class="dec-status">${STATUS_UI[s.status]}</div>
  </div>
  <div class="dec-desc">${esc(s.desc)}</div>
  <div class="dec-meta">
    <span>${esc(s.source)}</span>
    <div class="rec-impact" style="margin:0">${impactHtml}</div>
  </div>`;

  const actions = el("div", "dec-actions");
  if (s.status === "pending") {
    const btnAdopt = el("button", "btn btn-accent btn-sm", "采纳并执行");
    btnAdopt.addEventListener("click", () => {
      const r = BM.adoptSuggestion(s.id);
      BM.renderDecisions(document.getElementById("viewPanel"));
      BM.toast("已执行：" + s.title);
    });
    const btnIgnore = el("button", "btn btn-outline btn-sm", "忽略");
    btnIgnore.addEventListener("click", () => {
      BM.ignoreSuggestion(s.id);
      BM.renderDecisions(document.getElementById("viewPanel"));
      BM.toast("已忽略该建议");
    });
    actions.appendChild(btnAdopt);
    actions.appendChild(btnIgnore);
  } else if (s.status === "adopted") {
    const btnRevert = el("button", "btn btn-outline btn-sm", "回滚（演示）");
    btnRevert.addEventListener("click", () => {
      BM.revertSuggestion(s.id);
      BM.renderDecisions(document.getElementById("viewPanel"));
      BM.toast("已回滚：" + s.title);
    });
    actions.appendChild(btnRevert);
    actions.appendChild(el("span", "hint-text", "已生成单据并进入审批流 → 可在审批中心查看"));
  } else {
    actions.appendChild(el("span", "hint-text", "已忽略 · AI 将持续跟踪该方向"));
  }
  card.appendChild(actions);
  return card;
}

window.BM.renderDecisions = renderDecisions;
window.BM = BM;
