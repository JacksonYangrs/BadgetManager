/* ================================================================
 * workbench.js — 角色工作台首页（v0.4：无左侧导航，导航在顶部横排）
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

/* 工作台首页（渲染到右侧内容区，导航在顶部） */
BM.renderWorkbenchHome = function (container) {
  container.innerHTML = "";
  const wb = el("div", "workbench");
  const content = el("div", "wb-content");
  wb.appendChild(content);
  container.appendChild(wb);
  renderHome(content);
};

/* 兼容旧调用：工作台整体 = 首页 */
BM.renderWorkbench = function (container) {
  BM.renderWorkbenchHome(container);
};

/* ---------- 角色工作台首页 ---------- */
function renderHome(content) {
  const role = BM.curRole();
  const r = BM.state.role;

  const hello = el("div", "wb-hello");
  const scopeText =
    r === "boss" ? "您拥有全局数据与全部审批/决算权限，AI 负责发现问题、您负责拍板。"
    : r === "finance" ? "您负责预算汇总、全局调整与决算，AI 初审帮您把关每一单。"
    : r === "manager" ? `您管理本部门预算与审批，AI 自动归因偏差、提示风险。`
    : "您可以一句话发起采购/报销，AI 自动走完预算检查与审批流。";
  hello.innerHTML = `<div class="wh-ico">${r === "boss" ? "👔" : r === "finance" ? "🧾" : r === "manager" ? "🗂" : "🧑‍💻"}</div>
    <div><div class="wh-title">${esc(role.name)} · ${esc(role.title)}</div>
    <div class="wh-sub">${esc(scopeText)}</div></div>`;
  content.appendChild(hello);
  BM.renderRoleHint(content, "wb-home");

  /* 预算业务提醒：接入消息推送模块（GET /api/notifications），只展示与当前角色相关的消息 */
  const remind = el("div", "");
  remind.appendChild(el("div", "wb-section-title", "预算业务提醒"));
  const rList = el("div", "todo-list");
  rList.appendChild(el("div", "empty", `<div class="empty-ico">⏳</div>加载中…`));
  remind.appendChild(rList);
  content.appendChild(remind);
  BM.renderNotificationList(rList);

  /* 员工：我负责的项目（核心） */
  if (r === "staff") {
    const proj = el("div", "");
    proj.appendChild(el("div", "wb-section-title", "我负责的采购项目"));
    const myProjects = BM.scopedProjects();
    if (myProjects.length) {
      const grid = el("div", "proj-grid");
      myProjects.forEach((p) => {
        const info = BM.projectInfo(p);
        const rateCls = p.execRate >= 100 ? "danger" : p.execRate >= 80 ? "warn" : "ok";
        const card = el("div", "proj-card" + (p.remain < 0 ? " over" : ""));
        card.innerHTML = `<div class="pc-head"><div class="pc-title">${esc(p.name)}</div>
            <span class="badge ${p.status === "审批中" ? "badge-warn" : "badge-info"}">${esc(p.status)}</span></div>
          <div class="pc-meta"><span>${esc(info.deptName)} · ${esc(info.catName)}</span><span>负责人：${esc(p.owner)}</span></div>
          <div class="pc-budget">
            <div class="pc-nums">
              <span class="pc-label">额度 <b>${BM.money(p.budget)}</b></span>
              <span class="pc-label">已用 <b style="color:var(--c-info)">${BM.money(p.used)}</b></span>
              <span class="pc-label" style="color:${p.remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(p.remain)}</b></span>
            </div>
            <div class="pc-bar-row">
              <div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(p.execRate, 100)}%"></div></div>
              <span class="pct">${p.execRate}%</span>
            </div>
          </div>
          <div class="pc-actions">
            <button class="btn btn-primary btn-sm reimburse-btn" data-proj="${p.id}">发起报销</button>
          </div>`;
        grid.appendChild(card);
      });
      proj.appendChild(grid);
    }
    content.appendChild(proj);
  }

  /* 报销数据接入提示（v0.12：追踪数据来源） */
  if (r === "staff") {
    const src = el("div", "plan-statusbar");
    src.style.marginTop = "14px";
    src.innerHTML = `<span class="badge badge-info">报销数据接入</span>
      <span class="hint-text">您的报销绑定到具体项目 · 报销入账后自动更新项目预算并检查是否超预算，这就是预算追踪的数据来源</span>`;
    content.appendChild(src);
  }

  /* 报销弹窗绑定（事件委托） */
  content.addEventListener("click", (e) => {
    const btn = e.target.closest(".reimburse-btn");
    if (!btn) return;
    openReimburseModal(btn.dataset.proj);
  });

  /* 角色专属提示 */
  const tips = el("div", "");
  tips.appendChild(el("div", "wb-section-title", "AI 正在为您关注"));
  const tipCard = el("div", "wb-hello");
  tipCard.style.background = "var(--c-surface-2)";
  tipCard.innerHTML = `<div class="wh-ico" style="background:var(--c-accent);color:var(--c-primary-deep)">✦</div>
    <div><div class="wh-sub" style="margin-top:0;line-height:1.8">${esc(roleTips(r))}</div></div>`;
  tips.appendChild(tipCard);
  content.appendChild(tips);
}

/* 预算业务提醒：从消息推送模块（GET /api/notifications）按角色过滤渲染。
 * 只展示与当前用户相关的消息；点击标记已读并跳转到对应视图。 */
BM.renderNotificationList = function (rList) {
  const fill = (items) => {
    rList.innerHTML = "";
    if (!items.length) {
      rList.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>暂无与您相关的预算业务提醒`));
      return;
    }
    const ICO = { compile: "📢", execution: "⚠️", deviation: "📋", summary: "🏢", org: "🏛", account: "🛡" };
    items.forEach((n) => {
      const item = el("div", "todo-item" + (n.priority === "danger" ? " danger" : "") + (n.read ? " is-read" : ""));
      const ico = ICO[n.type] || "🔔";
      item.innerHTML = `<div class="td-ico">${ico}</div>
        <div class="td-main"><div class="td-title">${esc(n.title)}</div>${n.body ? `<div class="td-sub">${esc(n.body)}</div>` : ""}</div>
        <div class="td-go">›</div>`;
      item.addEventListener("click", () => {
        if (!n.read) BM.markNotifRead(n.id);
        if (n.view) BM.openView(n.view);
      });
      rList.appendChild(item);
    });
  };
  BM.loadNotifications()
    .then((data) => fill((data && data.items) || BM.NOTIF.items || []))
    .catch(() => {
      rList.innerHTML = "";
      rList.appendChild(el("div", "empty", `<div class="empty-ico">⚠️</div>消息加载失败`));
    });
};

function roleTips(r) {
  if (r === "boss") {
    return "• IT 设备已用 + 冻结超预算 27%，按现有申请预计超支 35%<br>• 培训费节余约 30 万可调剂给 IT 设备<br>• 车辆维修单价环比 +9%，建议引入第三家供应商比价";
  }
  if (r === "finance") {
    return "• AI 已初审 4 张待审单据（2 张建议人工复核）<br>• 预算编制：6 个部门已填报 4 个，待汇总<br>• 培训费执行偏低，已建议调剂 30 万";
  }
  if (r === "manager") {
    return "• 本部门车辆维修执行偏高，近 3 月 +9%<br>• 办公用品同比增长合理（员工 +28%）<br>• 部门预算编制待填报，AI 已预填建议";
  }
  return "• 显示器采购项目：额度 7.8 万 · 已用 4.2 万 · 剩余 3.6 万<br>• 办公电脑更换项目：额度 30 万 · 待启动<br>• 新申请超出项目预算约束时，AI 会提前预警";
}

/* ---------- 报销弹窗（v0.12：报销绑定项目 → 入账 → 更新预算 → 超预算检查） ---------- */
function openReimburseModal(projectId) {
  const p = BM.PROJECTS.find((x) => x.id === projectId);
  if (!p) return;
  const info = BM.projectInfo(p);
  const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);

  const mask = el("div", "modal-mask");
  const modal = el("div", "modal");
  modal.style.width = "520px";
  const head = el("div", "modal-head");
  head.innerHTML = `<div class="modal-title">发起报销 · 绑定项目</div>
    <button class="modal-close">×</button>`;
  head.querySelector(".modal-close").addEventListener("click", () => mask.remove());
  modal.appendChild(head);

  const body = el("div", "modal-body");
  body.innerHTML = `<div class="plan-statusbar" style="margin-bottom:14px">
      <span class="badge badge-info">${esc(p.name)}</span>
      <span class="hint-text">${esc(info.deptName)} · ${esc(info.catName)} · 剩余 ${BM.money(p.remain)}</span>
    </div>
    <div class="filter-bar" style="margin-bottom:12px">
      <span class="hint-text">报销事项（绑定物料）：</span>
      <select id="rmItem">
        ${mats.length ? mats.map((m) => `<option value="${m.name}">${esc(m.name)}（${BM.money(m.budget)}）</option>`).join("") : `<option value="一般费用">一般费用</option>`}
        <option value="其他费用">其他费用</option>
      </select>
    </div>
    <div class="filter-bar" style="margin-bottom:12px">
      <span class="hint-text">报销金额（元）：</span>
      <input type="number" id="rmAmount" placeholder="请输入金额" style="width:180px">
    </div>
    <div class="filter-bar" style="margin-bottom:12px">
      <span class="hint-text">供应商/说明：</span>
      <input type="text" id="rmNote" placeholder="选填" style="width:220px">
    </div>`;
  modal.appendChild(body);

  const foot = el("div", "modal-head");
  foot.style.borderTop = "1px solid var(--c-border)";
  foot.style.borderBottom = "none";
  foot.style.borderRadius = "0 0 14px 14px";
  const submit = el("button", "btn btn-accent", "提交报销 · 入账");
  submit.addEventListener("click", () => {
    const amount = parseInt(document.getElementById("rmAmount").value, 10) || 0;
    const item = document.getElementById("rmItem").value;
    const note = document.getElementById("rmNote").value.trim();
    const r = BM.submitReimburse({
      projectId: p.id,
      amount,
      item,
      supplier: note || "—",
      title: p.name,
    });
    if (!r.ok) { BM.toast(r.msg); return; }
    BM.toast(r.msg);
    mask.remove();
    BM.openView("wb-home");
    BM.openView("track");
  });
  foot.appendChild(submit);
  foot.appendChild(el("span", "hint-text", "报销入账后自动更新项目预算并检查超预算"));
  modal.appendChild(foot);

  mask.appendChild(modal);
  mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
  document.getElementById("modalRoot").appendChild(mask);
}

window.BM = BM;
