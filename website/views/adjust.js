/* ================================================================
 * adjust.js — 预算调整中心（总经办预算管理员发起，集团 CEO 审批，v0.3）
 * 项目级 调剂 / 追加 / 调减 申请与审批流
 * ================================================================ */

var BM = window.BM || {};



function renderAdjust(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算调整中心</div>
      <div class="page-desc">项目级预算调剂 / 追加 / 调减 · 财务经理发起与审核，总经理终批</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "adjust");

  /* 新建调整（总经办预算管理员） */
  if (role === "cooAnalyst") {
    page.appendChild(renderNewAdjustForm());
  }

  /* 调整记录 */
  page.appendChild(el("div", "section-title", "调整记录与审批"));
  const list = el("div", "");
  const items = BM.state.adjustments;
  if (!items.length) {
    list.appendChild(el("div", "empty", `<div class="empty-ico">📋</div>暂无预算调整申请`));
  } else {
    items.forEach((a) => {
      list.appendChild(renderAdjustCard(a, role));
    });
  }
  page.appendChild(list);
  container.appendChild(page);
}

function renderNewAdjustForm() {
  const box = el("div", "adjust-form");
  box.innerHTML = `<div class="section-title">发起预算调整</div>`;

  const row = el("div", "af-row");
  const selType = el("select");
  selType.innerHTML = BM.ADJUST_TYPES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
  const selProj = el("select");
  selProj.innerHTML = BM.PROJECTS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const inpAmt = el("input");
  inpAmt.type = "number";
  inpAmt.placeholder = "金额（元）";
  inpAmt.style.width = "140px";
  inpAmt.value = "50000";
  const inpNote = el("input");
  inpNote.placeholder = "调整说明";
  inpNote.style.width = "200px";
  const btn = el("button", "btn btn-accent btn-sm", "提交调整申请");
  btn.addEventListener("click", () => {
    const adj = BM.createAdjustment(
      selType.value,
      selProj.value,
      parseInt(inpAmt.value, 10) || 0,
      inpNote.value || "预算调整"
    );
    BM.toast("✅ 调整申请已提交，待总经理审批");
    BM.renderAdjust(document.getElementById("viewPanel"));
  });
  row.appendChild(el("span", "af-label", "类型"));
  row.appendChild(selType);
  row.appendChild(el("span", "af-label", "项目"));
  row.appendChild(selProj);
  row.appendChild(el("span", "af-label", "金额"));
  row.appendChild(inpAmt);
  row.appendChild(inpNote);
  row.appendChild(btn);
  box.appendChild(row);
  box.appendChild(el("div", "hint-text", "AI 已核对项目预算与执行情况，大额调整（>20 万）将自动标记人工复核"));
  return box;
}

function renderAdjustCard(a, role) {
  const card = el("div", "appr-card");
  const p = BM.PROJECTS.find((x) => x.id === a.projectId) || {};
  const statusBadge =
    a.status === "approved" ? `<span class="badge badge-ok">已批准</span>`
    : a.status === "rejected" ? `<span class="badge badge-danger">已驳回</span>`
    : `<span class="badge badge-warn">待审批</span>`;
  const typeCls = a.type === "add" ? "badge-ok" : a.type === "cut" ? "badge-warn" : "badge-info";

  card.innerHTML = `<div class="appr-head">
      <span class="badge ${typeCls}">${esc(a.typeName)}</span>
      <div class="appr-title">${esc(p.name || a.projectId)}</div>
      ${statusBadge}
    </div>
    <div class="appr-meta">
      <span>金额：<b style="color:${a.type === "cut" ? "var(--c-warn)" : "var(--c-ok)"}">${a.type === "cut" ? "-" : "+"}${BM.money(a.amount)}</b></span>
      <span>发起：${esc(a.createdBy)} · ${a.createdTime}</span>
      <span>说明：${esc(a.note)}</span>
    </div>`;

  if (a.ai) {
    const verdictCls = a.ai.verdict === "pass" ? "pass" : "review";
    card.appendChild(el("div", "ai-opinion " + verdictCls, `<b>${a.ai.verdict === "pass" ? "AI 初审：建议通过" : "AI 初审：建议人工复核"}</b><br>${esc(a.ai.text)}`));
  }

  if (a.status === "pending" && role === "ceo") {
    const actions = el("div", "appr-actions");
    const btnApprove = el("button", "btn btn-primary btn-sm", "批准调整");
    const btnReject = el("button", "btn btn-outline btn-sm", "驳回");
    btnApprove.addEventListener("click", () => {
      BM.approveAdjustment(a.id, "approve");
      BM.renderAdjust(document.getElementById("viewPanel"));
      BM.toast("已批准调整，项目预算已更新");
    });
    btnReject.addEventListener("click", () => {
      BM.approveAdjustment(a.id, "reject");
      BM.renderAdjust(document.getElementById("viewPanel"));
      BM.toast("已驳回调整申请");
    });
    actions.appendChild(btnApprove);
    actions.appendChild(btnReject);
    card.appendChild(actions);
  } else if (a.status !== "pending" && a.manualBy) {
    card.appendChild(el("div", "hint-text", `终审：${a.manualDecision === "approve" ? "批准" : "驳回"} · ${esc(a.manualBy)} · ${a.manualTime}`));
  }

  return card;
}

window.BM.renderAdjust = renderAdjust;
window.BM = BM;
