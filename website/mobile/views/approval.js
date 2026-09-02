/* ================================================================
 * approval.js — 手机版「审批」Tab
 * 审批中心（AI 初审 → 终审）+ 决策中心 + 员工报销/采购发起
 * ================================================================ */

var BM = window.BM || {};



const AI_CLS = { pass: "pass", reject: "reject", review: "review" };
const AI_LABEL = { pass: "AI 初审：建议通过", reject: "AI 初审：建议驳回", review: "AI 初审：建议人工复核" };

BM.renderApproval = function (container) {
  container.innerHTML = "";
  const r = BM.state.role;
  const canAct = r !== "staff";

  /* 员工：发起入口卡片 */
  if (r === "staff") {
    const act = el("div", "card");
    act.innerHTML = `<div class="card-title">发起报销<span class="ai-tag" style="margin-left:auto">AI 检查</span></div>
      <div class="card-desc" style="margin-top:6px">报销绑定项目入账，AI 自动检查预算并预警超支</div>`;
    const actions = el("div", "pc-actions");
    const b = el("button", "btn btn-accent btn-block", "＋ 发起报销");
    b.addEventListener("click", () => {
      const my = BM.scopedProjects();
      if (!my.length) { BM.toast("您暂未负责项目，无法发起报销"); return; }
      BM.openReimburseSheet(my[0].id);
    });
    actions.appendChild(b);
    act.appendChild(actions);
    container.appendChild(act);
  }

  /* 审批列表 */
  container.appendChild(el("div", "section-title", r === "staff" ? "我的申请" : "审批中心 · AI 初审 → 人工终审"));
  const items = BM.scopedApprovals();
  if (!items.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>暂无审批单`));
  } else {
    items.forEach((a) => {
      const card = el("div", "appr-card");
      const stBadge = a.status === "pending" ? '<span class="badge badge-warn">待审批</span>' : a.status === "approved" ? '<span class="badge badge-ok">已通过</span>' : '<span class="badge badge-danger">已驳回</span>';
      card.innerHTML = `<div class="appr-head"><div class="appr-title">${esc(a.title)}</div>${stBadge}</div>
        <div class="appr-meta">${esc(a.deptName)} · ${esc(a.catName)} · ${esc(a.supplier || "")} · ${esc(a.date)}</div>
        <div class="appr-amount">${BM.money(a.amount)}</div>`;
      if (a.ai && a.ai.verdict) {
        const op = el("div", "ai-opinion " + AI_CLS[a.ai.verdict], `<b>${AI_LABEL[a.ai.verdict]}</b><br>${esc(a.ai.text)}`);
        card.appendChild(op);
      }
      if (a.status === "pending" && canAct) {
        const actions = el("div", "appr-actions");
        const bApprove = el("button", "btn btn-primary btn-sm", "终审通过");
        bApprove.addEventListener("click", () => {
          BM.approveDoc(a.id, "approve");
          BM.toast("✅ 已通过：" + a.title);
          BM.renderTab();
        });
        const bReject = el("button", "btn btn-outline btn-sm", "驳回");
        bReject.addEventListener("click", () => {
          BM.approveDoc(a.id, "reject");
          BM.toast("已驳回：" + a.title);
          BM.renderTab();
        });
        actions.appendChild(bApprove);
        actions.appendChild(bReject);
        card.appendChild(actions);
      }
      container.appendChild(card);
    });
  }

  /* 决策中心（boss/finance） */
  if (r === "boss" || r === "finance") {
    container.appendChild(el("div", "section-title", "决策中心 · AI 建议"));
    const sugs = BM.state.suggestions.filter((s) => s.status === "pending");
    if (!sugs.length) {
      container.appendChild(el("div", "empty", `<div class="empty-ico">💡</div>暂无待处理建议`));
    } else {
      sugs.forEach((s) => {
        const card = el("div", "card");
        card.innerHTML = `<div class="card-title"><span class="ai-tag">AI</span>${esc(s.title)}</div>
          <div class="card-desc" style="margin-top:6px">${esc(s.desc)}</div>
          <div class="pc-nums"><span>${esc(s.typeName || s.type)}</span><span>预计影响：${esc(s.impact || "")}</span></div>`;
        const actions = el("div", "pc-actions");
        const b1 = el("button", "btn btn-accent btn-sm", "采纳并执行");
        b1.addEventListener("click", () => {
          const res = BM.adoptSuggestion(s.id);
          BM.toast(res && res.ok ? "✅ 已执行，生成单据进审批" : "该建议已处理");
          BM.renderTab();
        });
        const b2 = el("button", "btn btn-outline btn-sm", "忽略");
        b2.addEventListener("click", () => {
          BM.ignoreSuggestion(s.id);
          BM.toast("已忽略，AI 将持续跟踪该方向");
          BM.renderTab();
        });
        actions.appendChild(b1);
        actions.appendChild(b2);
        card.appendChild(actions);
        container.appendChild(card);
      });
    }
  }
};

/* ---------- 报销弹层（员工） ---------- */
BM.openReimburseSheet = function (projectId) {
  const mask = document.getElementById("modalMask");
  const sheet = document.getElementById("modalSheet");
  const p = BM.PROJECTS.find((x) => x.id === projectId);
  if (!p) return;

  sheet.innerHTML = "";
  const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
  sheet.appendChild(el("div", "sheet-title", "发起报销 · " + esc(p.name)));

  const row1 = el("div", "sheet-row");
  row1.appendChild(el("div", "sheet-label", "绑定物料"));
  const matSel = el("select");
  matSel.innerHTML = mats.length
    ? mats.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")
    : `<option value="">（无物料，直接绑定项目）</option>`;
  row1.appendChild(matSel);
  sheet.appendChild(row1);

  const row2 = el("div", "sheet-row");
  row2.appendChild(el("div", "sheet-label", "报销金额（元）"));
  const amt = el("input");
  amt.type = "number";
  amt.value = "10000";
  row2.appendChild(amt);
  sheet.appendChild(row2);

  const row3 = el("div", "sheet-row");
  row3.appendChild(el("div", "sheet-label", "报销说明"));
  const note = el("input");
  note.value = p.name + " 相关支出";
  row3.appendChild(note);
  sheet.appendChild(row3);

  const info = el("div", "ai-warn-bar");
  info.innerHTML = `<span>AI</span><span>当前剩余 ${BM.money(p.remain)}，提交后自动检查是否超预算</span>`;
  sheet.appendChild(info);

  const actions = el("div", "sheet-actions");
  const cancel = el("button", "btn btn-outline", "取消");
  cancel.addEventListener("click", () => BM.closeSheet());
  const submit = el("button", "btn btn-accent", "提交报销");
  submit.addEventListener("click", () => {
    const res = BM.submitReimburse({
      projectId: p.id,
      materialId: matSel.value || null,
      amount: parseInt(amt.value, 10) || 0,
      title: note.value || p.name + " 报销",
      supplier: "员工自行垫付",
    });
    BM.closeSheet();
    if (res.over) BM.toast("⚠️ 已入账但超预算 " + BM.money(res.over));
    else BM.toast("✅ 报销已入账，更新项目预算");
    BM.renderTab();
  });
  actions.appendChild(cancel);
  actions.appendChild(submit);
  sheet.appendChild(actions);

  mask.style.display = "block";
  sheet.style.display = "block";
};

window.BM = BM;
