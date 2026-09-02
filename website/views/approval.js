/* ================================================================
 * approval.js — 审批中心（AI 初审 → 人工终审）
 * ================================================================ */

var BM = window.BM || {};



const AI_CLS = { pass: "pass", reject: "reject", review: "review" };
const AI_LABEL = { pass: "AI 初审：建议通过", reject: "AI 初审：建议驳回", review: "AI 初审：建议人工复核" };

function renderApproval(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">审批中心</div>
      <div class="page-desc">AI 初审（预算/合规/供应商检查）→ 人工终审，AI 不替代最终决策</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "approval");

  /* 待审/已审 筛选条（按角色范围已过滤，这里再分层） */
  const filterState = { tab: "pending" };
  const tabBar = el("div", "filter-bar");
  tabBar.style.marginBottom = "12px";
  const tabs = [
    { key: "pending", label: "待审" },
    { key: "done", label: "已审" },
    { key: "all", label: "全部" },
  ];
  const roleScopeNote = el("span", "hint-text");
  roleScopeNote.style.marginLeft = "auto";
  roleScopeNote.textContent =
    ["ceo", "cooLead", "cooAnalyst"].indexOf(BM.state.role) >= 0 ? "范围：全集团"
    : BM.state.role === "adminHead" ? "范围：本公司"
    : "范围：我发起的申请";
  tabBar.appendChild(roleScopeNote);
  const tabBtns = {};
  tabs.forEach((t) => {
    const b = el("button", "btn btn-sm " + (t.key === filterState.tab ? "btn-primary" : "btn-outline"), t.label);
    b.addEventListener("click", () => {
      filterState.tab = t.key;
      Object.keys(tabBtns).forEach((k) => tabBtns[k].className = "btn btn-sm btn-outline");
      b.className = "btn btn-sm btn-primary";
      renderList();
    });
    tabBtns[t.key] = b;
    tabBar.appendChild(b);
  });
  page.appendChild(tabBar);

  /* 数据源：按角色范围过滤 */
  const list = el("div", "");
  page.appendChild(list);

  function renderList() {
    list.innerHTML = "";
    const all = BM.scopedApprovals();
    const items = all.filter((a) => {
      if (filterState.tab === "pending") return a.status === "pending";
      if (filterState.tab === "done") return a.status !== "pending";
      return true;
    });
    if (items.length === 0) {
      list.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>当前筛选下暂无审批单`));
      return;
    }
    items.forEach((a) => list.appendChild(renderApprovalCard(a)));
  }
  renderList();

  container.appendChild(page);
}

function renderApprovalCard(a) {
  const card = el("div", "appr-card");
  const statusBadge =
    a.status === "approved" ? `<span class="badge badge-ok">已通过</span>`
    : a.status === "rejected" ? `<span class="badge badge-danger">已驳回</span>`
    : `<span class="badge badge-warn">审批中</span>`;

  card.innerHTML = `<div class="appr-head">
    <div class="appr-title">${esc(a.title)}</div>
    ${statusBadge}
  </div>
  <div class="appr-meta">
    <span>科目：${esc(a.catName)}</span>
    <span>部门：${esc(a.deptName)}</span>
    <span>供应商：${esc(a.supplier)}</span>
    <span>金额：<b>${BM.money(a.amount)}</b></span>
    <span>日期：${a.date}</span>
    ${a.requester ? `<span>发起：${esc(a.requester)}</span>` : ""}
    ${a.kind === "contract" ? `<span class="badge badge-accent">框架协议</span>` : a.kind === "process" ? `<span class="badge badge-accent">流程变更</span>` : `<span class="badge badge-info">采购</span>`}
  </div>`;

  if (a.ai) {
    const op = el("div", "ai-opinion " + AI_CLS[a.ai.verdict],
      `<b>${AI_LABEL[a.ai.verdict]}</b><br>${esc(a.ai.text)}`);
    card.appendChild(op);
  }

  /* 审批链 */
  if (a.amount) {
    const chain = BM.getApprovalChain(a.amount);
    const nodeHtml = chain
      .map((n, i) => {
        const done = a.status === "approved" || i < chain.length - 1;
        const cls = a.status === "approved" ? "flow-node done" : i === chain.length - 1 ? "flow-node current" : "flow-node done";
        return `<span class="${cls}">${esc(n)}${done && a.status !== "approved" ? " ✓" : ""}</span>`;
      })
      .join('<span class="flow-arrow">→</span>');
    card.appendChild(el("div", "flow-chain", nodeHtml));
  }

  if (a.status === "pending") {
    const canAct = ["ceo", "cooAnalyst", "adminHead"].indexOf(BM.state.role) >= 0;
    if (canAct) {
      const actions = el("div", "appr-actions");
      const btnApprove = el("button", "btn btn-primary btn-sm", "终审通过");
      const btnReject = el("button", "btn btn-outline btn-sm", "驳回");
      btnApprove.addEventListener("click", () => {
        BM.approveDoc(a.id, "approve");
        BM.renderApproval(document.getElementById("viewPanel"));
        BM.toast("已通过：" + a.title);
      });
      btnReject.addEventListener("click", () => {
        BM.approveDoc(a.id, "reject");
        BM.renderApproval(document.getElementById("viewPanel"));
        BM.toast("已驳回：" + a.title);
      });
      actions.appendChild(btnApprove);
      actions.appendChild(btnReject);
      card.appendChild(actions);
    } else {
      const note = el("div", "hint-text", "您没有该单据的审批权限（仅可查看进度）");
      note.style.marginTop = "10px";
      card.appendChild(note);
    }
  } else if (a.manualDecision) {
    const note = el("div", "hint-text", `人工终审：${a.manualDecision === "approve" ? "通过" : "驳回"} · ${a.manualTime}`);
    note.style.marginTop = "10px";
    card.appendChild(note);
  }

  return card;
}

window.BM.renderApproval = renderApproval;
window.BM = BM;
