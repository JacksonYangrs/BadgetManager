/* ================================================================
 * workbench.js — 角色工作台首页（v0.4：无左侧导航，导航在顶部横排）
 * ================================================================ */

var BM = window.BM || {};



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
  const scope = (role && role.scope) || "group";

  /* ① hello 头部：9 角色责任叙事 */
  const hello = el("div", "wb-hello");
  const ICO = { ceo: "👔", cooLead: "🏛", cooAnalyst: "🧾", legalHead: "🏢", adminHead: "🗂", companyBudgeter: "💼", centerOwner: "🎯", expense: "🧑‍💻", admin: "🛡" };
  hello.innerHTML = `<div class="wh-ico">${ICO[r] || "🧑‍💻"}</div>
    <div><div class="wh-title">${esc(role.name)} · ${esc(role.title)}</div>
    <div class="wh-sub">${esc(scopeTextFor(r))}</div></div>`;
  content.appendChild(hello);

  /* ② roleHint 说明条（data.js 已补 9 角色文案） */
  BM.renderRoleHint(content, "wb-home");

  /* ③ 预算业务提醒：接入消息推送模块（GET /api/notifications），只展示与当前角色相关的消息 */
  const remind = el("div", "");
  remind.appendChild(el("div", "wb-section-title", "预算业务提醒"));
  const rList = el("div", "todo-list");
  rList.appendChild(el("div", "empty", `<div class="empty-ico">⏳</div>加载中…`));
  remind.appendChild(rList);
  content.appendChild(remind);
  BM.renderNotificationList(rList);

  /* ④ 角色专属面板（按 scope 分组：group / company / center / self / all） */
  renderScopePanels(content, r, scope);

  /* ⑤ AI 正在为您关注（Copilot 动态接口，未启用/异常降级占位） */
  renderRoleTips(content, r);
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

/* ---------- 差异化①：hello 责任叙事（9 角色，T6b 设计 §4） ---------- */
function scopeTextFor(r) {
  const T = {
    ceo: "您拥有全局数据与全部审批/决算权限，AI 负责发现问题、您负责拍板。",
    cooLead: "您牵头组织审核与协商，推动压降目标逐层下达，AI 汇总各方反馈供您裁决。",
    cooAnalyst: "您负责预算汇总、全局调整与决算，AI 初审帮您把关每一单。",
    legalHead: "您负责本公司预算审核与重大调整，AI 标出本公司超支与争议供您决策。",
    adminHead: "您组织本公司各部门编制预算、解释差异、落实压降。",
    companyBudgeter: "您负责本公司预算汇总校验与提交，AI 预检规则偏离与口径问题。",
    centerOwner: "您负责归口科目的专业标准与跨公司把控，AI 归集各公司该科目数据供您对照。",
    expense: "您可以一句话发起采购/报销，AI 自动走完预算检查与审批流。",
    admin: "您负责账户、组织架构与角色权限的平台运维，AI 保证各角色只看该看的数据。",
  };
  return T[r] || T.expense;
}

/* ---------- 差异化④：roleTips 关注点方向（供 Copilot prompt 参考，非写死文案） ---------- */
function roleFocusQuestion(r) {
  const Q = {
    ceo: "作为集团CEO，请根据全局预算执行数据，指出我最需要关注的 3 个要点：超预算科目、待决策争议、可调剂空间。",
    cooLead: "作为总经办负责人，请根据编制进度与争议数据，指出我需要推动的 3 件事：待填报部门、待协商争议、压降下达落实。",
    cooAnalyst: "作为总经办预算管理员，请根据预算编制与执行数据，指出我需要优先处理的 3 件事：待汇总编制、待审单据、调剂建议。",
    legalHead: "作为法人公司负责人，请根据本公司预算执行数据，指出我需要决策的 3 个要点：超支科目、待审核调整、与集团建议的差距。",
    adminHead: "作为公司行政负责人，请根据本公司执行数据，指出我需要关注的 3 个要点：执行偏差、待解释差异、压降落实。",
    companyBudgeter: "作为公司预算管理员，请根据本公司填报与导入数据，指出我需要处理的 3 件事：待汇总校验、偏离口径、费控对账。",
    centerOwner: "作为归口责任人，请根据归口科目跨公司数据，指出我需要复核的 3 个要点：超预算科目、专业标准、风险事项。",
    expense: "作为费用责任岗，请根据我负责的项目数据，指出我需要关注的 3 个要点：项目剩余预算、待启动项目、超预算预警。",
    admin: "作为系统管理员，请根据平台数据，指出我需要巡检的 3 个要点：账户角色、组织架构、AI 配置。",
  };
  return Q[r] || Q.ceo;
}

/* 把 Copilot 返回的纯文本转成逐条关注点（转义 + 换行转 <br> + 统一 • 前缀） */
function formatTipsAnswer(text) {
  const lines = String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return "AI 未返回关注点。";
  return lines.map((s) => "• " + esc(s.replace(/^[-•*]\s*/, ""))).join("<br>");
}

/* ---------- 差异化③：按 scope 分组的专属面板 ---------- */
function renderScopePanels(content, r, scope) {
  if (scope === "self") { renderExpensePanels(content); return; }
  if (scope === "all") { renderAdminPanels(content); return; }
  const ovTitle = scope === "center" ? "归口科目预算总览" : (scope === "company" ? "本公司预算总览" : "集团预算总览");
  renderOverviewCard(content, ovTitle);
  renderEntryCards(content, entryCardsFor(r));
}

/* 各角色入口卡（T6b 设计 §4 专属面板；每角色 2~3 块含总览卡） */
function entryCardsFor(r) {
  const E = {
    ceo: [
      { ico: "⚖️", title: "待决策 · 重大争议", sub: "超预算科目与各方分歧，AI 汇总供您拍板", view: "balance", label: "进入决策 ›" },
    ],
    cooLead: [
      { ico: "📝", title: "编制进度", sub: "组织各部门补齐编制，推动压降目标下达", view: "compile", label: "进入编制 ›" },
      { ico: "🤝", title: "协商谈判区", sub: "牵头协商争议项，边调边谈试算压降", view: "collisionTune", label: "进入协商 ›" },
    ],
    cooAnalyst: [
      { ico: "⚖️", title: "汇总平衡工作台", sub: "预算总控与调整，把控资金口径", view: "balance", label: "进入平衡 ›" },
      { ico: "📐", title: "规则引擎 + 费控导入", sub: "预算规则与费控对账入口", view: "rules", label: "进入规则 ›" },
    ],
    legalHead: [
      { ico: "🤝", title: "协商谈判 · 子公司侧", sub: "试算本公司反馈方案，对标集团建议", view: "collisionTune", label: "进入协商 ›" },
      { ico: "🔧", title: "调整审批", sub: "审核本公司重大预算调整", view: "adjust", label: "进入调整 ›" },
    ],
    adminHead: [
      { ico: "📝", title: "本公司编制进度", sub: "组织各部门编制，解释差异、落实压降", view: "compile", label: "进入编制 ›" },
      { ico: "📊", title: "执行偏差", sub: "本公司执行看板，偏差一目了然", view: "kanban", label: "进入看板 ›" },
    ],
    companyBudgeter: [
      { ico: "📝", title: "填报汇总校验", sub: "汇总本公司各部门填报，规则校验后提交", view: "compile", label: "进入编制 ›" },
      { ico: "📥", title: "费控导入", sub: "费控实际导入与对账", view: "importView", label: "进入导入 ›" },
    ],
    centerOwner: [
      { ico: "📐", title: "归口专业标准", sub: "维护归口科目预算方法，下发基层", view: "rules", label: "进入标准 ›" },
      { ico: "🛡", title: "归口风险", sub: "归口科目相关风险筛查", view: "riskView", label: "进入风险 ›" },
    ],
    admin: [
      { ico: "👥", title: "预算工作人员", sub: "账户、组织与角色权限管理", view: "accounts", label: "进入账户 ›" },
      { ico: "🗃", title: "基础数据 + AI 配置", sub: "组织架构 / 科目主数据 / AI 凭证配置", view: "basedata", label: "进入配置 ›" },
    ],
  };
  return E[r] || [];
}

/* 总览卡：接真实表 /api/workbench-overview（unit_budget + budget_execution 聚合） */
function renderOverviewCard(content, title) {
  const sec = el("div", "");
  sec.appendChild(el("div", "wb-section-title", title));
  const card = el("div", "wb-hero-card");
  card.style.alignItems = "stretch";
  card.style.flexDirection = "column";
  card.innerHTML = `<div class="wh-main" style="width:100%">
      <div class="wh-title">预算执行总览</div>
      <div class="wh-sub" data-ov-status>数据加载中…</div>
      <div class="kpi-grid" data-ov-kpi style="display:none;margin-top:12px"></div>
      <div data-ov-top style="display:none"></div>
    </div>`;
  sec.appendChild(card);
  content.appendChild(sec);

  BM.apiGet("/api/workbench-overview?months=1,2,3,4,5,6,7,8,9")
    .then((o) => {
      const status = card.querySelector("[data-ov-status]");
      const kpiGrid = card.querySelector("[data-ov-kpi]");
      const topBox = card.querySelector("[data-ov-top]");
      if (!o || typeof o.totalBudget !== "number") {
        if (status) status.textContent = "总览数据暂不可用";
        return;
      }
      if (status) status.remove();
      kpiGrid.style.display = "grid";
      kpiGrid.innerHTML = `
        <div class="kpi accent"><div class="kpi-label">年度预算</div><div class="kpi-value">${BM.money(o.totalBudget)}</div><div class="kpi-sub">${o.units || 0} 项预算</div></div>
        <div class="kpi"><div class="kpi-label">已执行</div><div class="kpi-value">${BM.money(o.totalExec)}</div><div class="kpi-sub">累计执行</div></div>
        <div class="kpi"><div class="kpi-label">结余</div><div class="kpi-value" style="color:${o.remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">${BM.money(o.remain)}</div><div class="kpi-sub">预算 − 执行</div></div>
        <div class="kpi"><div class="kpi-label">执行率</div><div class="kpi-value">${o.execRate}%</div><div class="kpi-sub">累计执行进度</div></div>`;
      if (o.topOverspent && o.topOverspent.length) {
        topBox.style.display = "block";
        topBox.innerHTML = `<div class="wb-section-title" style="margin:14px 0 4px">超预算科目 TOP</div>` +
          o.topOverspent.map((t) =>
            `<div style="display:flex;justify-content:space-between;padding:6px 2px;border-bottom:1px dashed var(--c-border);font-size:12.5px">
              <span>${esc(t.cat)}</span><span style="color:var(--c-danger)">超 ${BM.money(t.over)}</span></div>`).join("");
      }
    })
    .catch(() => {
      const status = card.querySelector("[data-ov-status]");
      if (status) status.textContent = "总览数据加载失败，请稍后重试";
    });
}

/* 平台概览（admin）：账户/角色/组织统计，接真实接口 */
function renderPlatformOverview(content) {
  const sec = el("div", "");
  sec.appendChild(el("div", "wb-section-title", "平台概览"));
  const card = el("div", "wb-hero-card");
  card.style.alignItems = "stretch";
  card.style.flexDirection = "column";
  card.innerHTML = `<div class="wh-main" style="width:100%">
      <div class="wh-title">账户 · 组织 · 角色</div>
      <div class="wh-sub" data-pov-status>统计加载中…</div>
      <div class="kpi-grid" data-pov-kpi style="display:none;margin-top:12px"></div>
    </div>`;
  sec.appendChild(card);
  content.appendChild(sec);

  const show = (users, roles, orgs) => {
    const status = card.querySelector("[data-pov-status]");
    const kpi = card.querySelector("[data-pov-kpi]");
    if (status) status.remove();
    kpi.style.display = "grid";
    kpi.innerHTML = `
      <div class="kpi accent"><div class="kpi-label">用户</div><div class="kpi-value">${users}</div><div class="kpi-sub">平台账户</div></div>
      <div class="kpi"><div class="kpi-label">角色</div><div class="kpi-value">${roles}</div><div class="kpi-sub">标准角色</div></div>
      <div class="kpi"><div class="kpi-label">组织</div><div class="kpi-value">${orgs}</div><div class="kpi-sub">公司/单位</div></div>`;
  };
  Promise.all([
    BM.apiGet("/api/users").then((d) => (Array.isArray(d) ? d.length : 0)).catch(() => 0),
    BM.apiGet("/api/roles").then((d) => (Array.isArray(d) ? d.length : 0)).catch(() => 0),
    BM.apiGet("/api/orgs").then((d) => (d && Array.isArray(d.units) ? d.units.length : 0)).catch(() => 0),
  ]).then(([u, rl, o]) => show(u, rl, o))
    .catch(() => {
      const status = card.querySelector("[data-pov-status]");
      if (status) status.textContent = "平台统计加载失败";
    });
}

/* 入口卡（wb-hero-card + 跳转按钮），垂直堆叠 */
function renderEntryCards(content, list) {
  if (!list || !list.length) return;
  const wrap = el("div", "");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "12px";
  wrap.style.marginTop = "14px";
  list.forEach((e) => {
    const card = el("div", "wb-hero-card");
    card.innerHTML = `<div class="wh-ico" style="background:var(--c-primary);color:#fff">${e.ico || "→"}</div>
      <div class="wh-main"><div class="wh-title">${esc(e.title)}</div>
      <div class="wh-sub">${esc(e.sub)}</div></div>`;
    const goBtn = el("button", "btn btn-primary", e.label || "进入 ›");
    goBtn.addEventListener("click", () => BM.openView(e.view));
    card.appendChild(goBtn);
    wrap.appendChild(card);
  });
  content.appendChild(wrap);
}

/* 基层（self）：我负责的项目 + 报销数据接入（沿用既有面板） */
function renderExpensePanels(content) {
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

  /* 报销数据接入提示（v0.12：追踪数据来源） */
  const src = el("div", "plan-statusbar");
  src.style.marginTop = "14px";
  src.innerHTML = `<span class="badge badge-info">报销数据接入</span>
    <span class="hint-text">您的报销绑定到具体项目 · 报销入账后自动更新项目预算并检查是否超预算，这就是预算追踪的数据来源</span>`;
  content.appendChild(src);

  /* 报销弹窗绑定（事件委托） */
  content.addEventListener("click", (e) => {
    const btn = e.target.closest(".reimburse-btn");
    if (!btn) return;
    openReimburseModal(btn.dataset.proj);
  });
}

/* 平台层（all）：平台概览 + 运维入口 */
function renderAdminPanels(content) {
  renderPlatformOverview(content);
  renderEntryCards(content, entryCardsFor("admin"));
}

/* 差异化④：AI 正在为您关注（Copilot 动态接口 + 降级占位） */
function renderRoleTips(content, r) {
  const tips = el("div", "");
  tips.appendChild(el("div", "wb-section-title", "AI 正在为您关注"));
  const tipCard = el("div", "wb-hello");
  tipCard.style.background = "var(--c-surface-2)";
  tipCard.innerHTML = `<div class="wh-ico" style="background:var(--c-accent);color:var(--c-primary-deep)">✦</div>
    <div><div class="wh-sub" style="margin-top:0;line-height:1.8" data-role-tips>正在为您生成关注点…</div></div>`;
  tips.appendChild(tipCard);
  content.appendChild(tips);

  const body = tipCard.querySelector("[data-role-tips]");
  BM.apiSend("/api/copilot/ask", "POST", { question: roleFocusQuestion(r) })
    .then((data) => {
      if (data && data.aiEnabled && data.answer != null) {
        body.innerHTML = formatTipsAnswer(data.answer);
        return;
      }
      body.innerHTML = "AI 助手未启用（未配置 AI 凭证）。启用后这里将按您的角色 + 实时数据生成个性化关注点。";
    })
    .catch(() => {
      body.innerHTML = "AI 服务暂不可用，请稍后重试。";
    });
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
