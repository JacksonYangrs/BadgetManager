/* ================================================================
 * home.js — 手机版工作台首页
 * 欢迎条 + 今日待办 + 我的项目（员工）/ 全局概览 + AI 关注
 * ================================================================ */

var BM = window.BM || {};



function scopeLabel() {
  const r = BM.state.role;
  if (r === "boss") return "全局视角 · 您是最终决策人";
  if (r === "finance") return "全局口径 · 预算总控由您把关";
  if (r === "manager") return "本部门视角 · 偏差与审批由您负责";
  return "我负责的项目 · 预算约束一目了然";
}

function buildTodos(r) {
  const todos = [];
  const pend = BM.scopedApprovals().filter((a) => a.status === "pending");
  if (r === "boss" || r === "finance") {
    todos.push({ ico: "🔔", title: `${pend.length} 张单据待终审`, sub: "AI 已初审预算与合规，等您拍板", view: "approval", danger: true });
    todos.push({ ico: "⚠️", title: "IT 设备预计超支 35%", sub: "9 月已超预算，建议从培训费调剂 30 万", view: "budget", danger: true });
    if (r === "finance") {
      todos.push({ ico: "📝", title: "预算编制 4/6 部门已填报", sub: "待财务汇总后提交总经理", view: "budget" });
    }
  }
  if (r === "manager") {
    todos.push({ ico: "🔔", title: `${pend.length} 张单据待部门审批`, sub: "AI 初审意见已附，可快速终审", view: "approval" });
    todos.push({ ico: "📈", title: "车辆维修执行偏高", sub: "近 3 月 +9%，建议供应商比价", view: "budget", danger: true });
    todos.push({ ico: "📝", title: "本部门预算填报", sub: "按项目 / 物料填报，可新增条目", view: "budget" });
  }
  if (r === "staff") {
    todos.push({ ico: "🧾", title: "发起报销", sub: "绑定项目入账，AI 自动检查预算", view: "approval" });
    todos.push({ ico: "🖥", title: "显示器项目剩余 2.4 万", sub: "已用 54%，新申请需谨慎", view: "budget", danger: true });
  }
  return todos;
}

function renderProjectCard(p, showAction) {
  const info = BM.projectInfo(p);
  const rateCls = p.execRate >= 100 ? "danger" : p.execRate >= 80 ? "warn" : "ok";
  const card = el("div", "proj-card" + (p.remain < 0 ? " over" : ""));
  card.innerHTML = `<div class="pc-head"><div class="pc-title">${esc(p.name)}</div>
      <span class="badge ${p.status === "审批中" ? "badge-warn" : "badge-info"}">${esc(p.status)}</span></div>
    <div class="pc-meta">${esc(info.deptName)} · ${esc(info.catName)} · 负责人：${esc(p.owner)}</div>
    <div class="pc-nums">
      <span>额度 <b>${BM.money(p.budget)}</b></span>
      <span>已用 <b style="color:var(--c-info)">${BM.money(p.used)}</b></span>
      <span style="color:${p.remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(p.remain)}</b></span>
    </div>
    <div class="pc-bar-row">
      <div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(p.execRate, 100)}%"></div></div>
      <span class="pct">${p.execRate}%</span>
    </div>`;
  if (showAction && p.owner === "张伟") {
    const actions = el("div", "pc-actions");
    const b1 = el("button", "btn btn-primary btn-sm", "发起报销");
    b1.addEventListener("click", () => BM.openReimburseSheet(p.id));
    actions.appendChild(b1);
    const b2 = el("button", "btn btn-outline btn-sm", "发起采购");
    b2.addEventListener("click", () => {
      const r2 = BM.requestPurchaseForProject(p.id, { title: p.name + " · 追加采购", amount: 30000 });
      BM.toast(r2.ok ? "✅ 采购申请已生成" : "预算不足，AI 已标记需调整");
      BM.renderTab();
    });
    actions.appendChild(b2);
    card.appendChild(actions);
  }
  return card;
}

BM.renderHome = function (container) {
  container.innerHTML = "";
  const r = BM.state.role;
  const role = BM.curRole();

  /* 欢迎条 */
  const hello = el("div", "home-hello");
  hello.innerHTML = `<div class="hh-title">${esc(role.name)} · ${esc(role.title)}</div>
    <div class="hh-sub">${esc(scopeLabel())}<br>AI 自动发现问题 · 您负责拍板</div>`;
  container.appendChild(hello);

  /* 今日待办 */
  const todos = buildTodos(r);
  if (todos.length) {
    container.appendChild(el("div", "section-title", "今日待办"));
    const card = el("div", "card");
    card.style.padding = "2px 14px";
    todos.forEach((t) => {
      const item = el("div", "todo-item" + (t.danger ? " danger" : ""));
      item.innerHTML = `<div class="td-ico">${t.ico}</div>
        <div class="td-main"><div class="td-title">${esc(t.title)}</div><div class="td-sub">${esc(t.sub)}</div></div>
        <div class="td-go">›</div>`;
      item.addEventListener("click", () => BM.switchTab(t.view === "approval" ? "approval" : "budget", t.view));
      card.appendChild(item);
    });
    container.appendChild(card);
  }

  /* 员工：我负责的项目；其他角色：风险科目概览 */
  container.appendChild(el("div", "section-title", r === "staff" ? "我负责的项目" : "重点科目 · AI 预警"));
  if (r === "staff") {
    const my = BM.scopedProjects();
    if (!my.length) {
      container.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>您暂未负责项目`));
    } else {
      my.forEach((p) => container.appendChild(renderProjectCard(p, true)));
    }
  } else {
    const card = el("div", "card");
    const warnList = BM.CATEGORIES.filter((c) => c.forecast.status === "danger" || c.forecast.status === "warn");
    warnList.forEach((c) => {
      const row = el("div", "todo-item" + (c.forecast.status === "danger" ? " danger" : ""));
      const badgeCls = c.forecast.status === "danger" ? "badge-danger" : "badge-warn";
      row.innerHTML = `<div class="td-ico">${c.forecast.status === "danger" ? "⚠️" : "▲"}</div>
        <div class="td-main"><div class="td-title">${esc(c.name)}</div><div class="td-sub">${esc(c.forecast.detail)}</div></div>
        <span class="badge ${badgeCls}">${esc(c.forecast.label)}</span>`;
      row.addEventListener("click", () => BM.switchTab("budget", "overview"));
      card.appendChild(row);
    });
    if (!warnList.length) {
      card.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>当前无风险科目`));
    }
    container.appendChild(card);
  }

  /* AI 关注 */
  container.appendChild(el("div", "section-title", "AI 正在为您关注"));
  const tip = el("div", "card");
  tip.innerHTML = `<div class="card-title"><span class="ai-tag">AI</span>主动服务</div>
    <div class="card-desc" style="margin-top:7px">
      ${r === "boss" ? "AI 已发现 2 个超支风险科目（IT 设备 35% / 车辆维修 18%），培训费有 30 万可调剂空间，问一句即可获得方案。"
      : r === "finance" ? "4 张单据待财务环节、AI 已初审；预算编制进度 4/6；规则设置将影响全系统行为。"
      : r === "manager" ? "AI 自动归因本部门偏差、提示风险；您负责的项目与物料填报可直接在预算 Tab 完成。"
      : "您的 2 个项目预算 AI 已盯住，发起报销/采购时会自动检查是否超预算并预警。"}
    </div>`;
  container.appendChild(tip);
};

window.BM = BM;
