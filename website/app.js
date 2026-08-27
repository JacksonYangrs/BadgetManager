/* ================================================================
 * app.js — 应用入口 v0.4
 * 布局：AI Copilot 固定左侧常驻 + 顶部横排工作台菜单 + 右侧内容区
 * ================================================================ */

var BM = window.BM || {};

/* ---------- 视图路由 ---------- */
const VIEWS = {
  dashboard: BM.renderDashboard,
  details: BM.renderDetails,
  approval: BM.renderApproval,
  decisions: BM.renderDecisions,
  plan: BM.renderPlan,
  track: BM.renderTrack,
  final: BM.renderFinal,
  projects: BM.renderProjects,
  adjust: BM.renderAdjust,
  rules: BM.renderRules,
  basedata: BM.renderBaseData,
  benchmark: BM.renderBenchmark,
  collision: BM.renderCollision,
  collisionTune: BM.renderCollisionTune,
  compile: BM.renderCompile,
  balance: BM.renderBalance,
  kanban: BM.renderKanban,
  monthlySplit: BM.renderMonthlySplit,
  unitInbox: BM.renderUnitInbox,
  unitSummary:  BM.renderUnitSummary,
  finalRisk: BM.renderFinalRisk,
  importView: BM.renderImportView,
  riskView: BM.renderRiskView,
  accounts: BM.renderAccounts,
};

/* 角色默认首屏：日常打开＝运营监控中枢（wb-home）。
 * 编制是年度短窗口（≤1 个月），非常规入口，故不再作为任何角色的每日默认首屏；
 * 编制工作台作为「全部工作台」中的独立模块，仅在编制窗口期高频使用。 */
BM.defaultView = function () {
  return "wb-home";
};

/* 当前激活视图 */
let currentView = "wb-home";

/* ---------- 打开视图（渲染到右侧内容区） ---------- */
BM.openView = function (name, opts) {
  if (!BM.state.loggedIn) return;
  currentView = name;
  const panel = document.getElementById("viewPanel");
  if (name === "wb-home") {
    BM.renderWorkbenchHome(panel);
  } else {
    const fn = VIEWS[name];
    if (fn) fn(panel, opts);
  }
  refreshQuicknav();
};

BM.showView = BM.openView;

/* ---------- 顶部横排菜单（按角色） ---------- */
function refreshQuicknav() {
  const nav = document.getElementById("quicknav");
  nav.innerHTML = "";
  if (!BM.state.loggedIn) return;
  BM.roleViews().forEach((v) => {
    const btn = document.createElement("button");
    btn.className = "qn-btn" + (v === currentView ? " active" : "");
    btn.textContent = BM.NAV_LABELS[v] || v;
    btn.addEventListener("click", () => BM.openView(v));
    nav.appendChild(btn);
  });
}

/* ---------- 角色标签 ---------- */
function refreshRoleLabel() {
  const u = BM.state.user;
  if (u && u.username) {
    /* 真实登录用户：姓名 · 角色（取主角色；姓名与角色同名时只显示一个） */
    const main = u.roles && u.roles[0] ? u.roles[0].name : "";
    const def = BM.ROLES[BM.state.role] || {};
    const name = u.realName || u.username;
    const roleName = main || def.name || "用户";
    document.getElementById("roleLabel").textContent = name === roleName ? name : name + " · " + roleName;
    return;
  }
  const r = BM.curRole();
  document.getElementById("roleLabel").textContent = r.name + " · " + r.title;
}

/* ---------- 进入系统 ---------- */
BM.enterApp = function () {
  if (!BM.state.loggedIn) return;
  document.getElementById("loginRoot").style.display = "none";
  document.getElementById("appRoot").style.display = "flex";
  refreshRoleLabel();
  const hashView = (location.hash || "").replace("#", "");
  const startView = hashView && (BM.roleViews().indexOf(hashView) >= 0 || VIEWS[hashView]) ? hashView : BM.defaultView();
  currentView = startView;
  BM.openView(currentView);
  BM.toast("欢迎，" + BM.curRole().name);
};

/* hash 变化（深链/书签/手动改地址）：已登录则直接切换视图 */
window.addEventListener("hashchange", () => {
  if (!BM.state.loggedIn) return;
  const hashView = (location.hash || "").replace("#", "");
  if (hashView && VIEWS[hashView]) {
    BM.openView(hashView);
  }
});

/* ---------- 发送对话 ---------- */
BM.sendChat = function (text) {
  if (!text || !text.trim()) return;
  BM.addUserMsg(text.trim());
  const reply = BM.engineReply(text.trim());

  if (reply.type === "text") {
    BM.addAiText(reply.text);
  } else {
    if (reply.type === "predict") {
      reply.evidence = [
        "数据来源：预算台账 + 1-9 月单据流水（" + BM.DOCS.length + " 笔）",
        "计算依据：月度执行趋势外推，识别冻结/在途 40 万",
        "置信度 88% · 反证：10 月若有大额减项或调剂，风险将缓解",
      ];
    }
    if (reply.type === "analyze" && !reply.evidence) {
      reply.evidence = [
        "数据来源：员工花名册 / 打印系统 / 会议系统 / 采购流水",
        "关联分析：AI 自动归因，非人工分类",
        "口径：同比 2025 年同期",
      ];
    }
    if (reply.type === "recommend") {
      reply.evidence = [
        "数据来源：费用结构分析 + 供应商报价",
        "可行性：培训节余 30 万已由财务确认可调剂",
        "风险：调剂后培训执行率降至 70%，不影响核心课程",
      ];
    }
    BM.addAiCard(reply);
  }
};

/* ---------- 从聊天卡片采纳建议 ---------- */
BM.adoptSuggestionFromChat = function (sugId, showTransferNote) {
  const r = BM.adoptSuggestion(sugId);
  if (!r) {
    BM.toast("该建议已处理过了");
    return;
  }
  BM.toast("✅ 已执行：" + r.suggestion.title);
  if (showTransferNote) {
    const chat = document.getElementById("chat");
    const m = document.createElement("div");
    m.className = "msg msg-ai";
    const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    m.innerHTML = `<div class="msg-bubble">✅ 预算调剂已执行：培训费 → IT 设备 30 万元（财务李静已确认）。采购申请现已满足预算条件，可在「审批中心」终审放行。</div>
      <div class="msg-time">${time}</div>`;
    chat.appendChild(m);
    chat.scrollTop = chat.scrollHeight;
    BM.state.chatHistory.push({ role: "ai", text: "预算调剂已执行" });
  }
  BM.openView(currentView);
};

/* ---------- Toast ---------- */
BM.toast = function (msg) {
  const root = document.getElementById("toastRoot");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};

/* ---------- 消息推送模块（D2）：铃铛 + 通知加载 / 标记 ---------- */
BM.NOTIF = { items: [], unread: 0 };

BM.authHeaders = function () {
  /* 始终携带 JSON Content-Type，确保后端 express.json() 能解析请求体（否则 PUT/POST 的 body 会被静默丢弃） */
  return BM.state.token ? { Authorization: "Bearer " + BM.state.token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

BM.loadNotifications = function () {
  if (!BM.state.loggedIn || !BM.state.token) return Promise.resolve({ items: [], unread: 0 });
  return fetch("/api/notifications", { headers: BM.authHeaders() })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("notif"))))
    .then((data) => {
      BM.NOTIF.items = data.items || [];
      BM.NOTIF.unread = data.unread || 0;
      BM.refreshBell();
      return data;
    });
};

BM.markNotifRead = function (id) {
  return fetch("/api/notifications/" + id + "/read", {
    method: "POST",
    headers: BM.authHeaders(),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((n) => {
      const it = BM.NOTIF.items.find((x) => x.id === id);
      if (it) it.read = true;
      BM.NOTIF.unread = Math.max(0, BM.NOTIF.unread - 1);
      BM.refreshBell();
      if (BM._notifPanel) BM.renderNotifPanelItems();
      return n;
    });
};

BM.markAllRead = function () {
  return fetch("/api/notifications/read-all", {
    method: "POST",
    headers: BM.authHeaders(),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then(() => {
      BM.NOTIF.items.forEach((x) => (x.read = true));
      BM.NOTIF.unread = 0;
      BM.refreshBell();
      if (BM._notifPanel) BM.renderNotifPanelItems();
      return true;
    });
};

BM.refreshBell = function () {
  const badge = document.getElementById("bellBadge");
  if (!badge) return;
  const u = BM.NOTIF.unread || 0;
  badge.textContent = u > 99 ? "99+" : String(u);
  badge.hidden = u === 0;
};

BM.renderNotifPanelItems = function () {
  const panel = BM._notifPanel;
  if (!panel) return;
  const list = panel.querySelector(".notif-list");
  if (!list) return;
  list.innerHTML = "";
  const items = BM.NOTIF.items || [];
  if (!items.length) {
    list.appendChild(el("div", "notif-empty", "暂无与您相关的消息"));
    return;
  }
  const ICO = { compile: "📢", execution: "⚠️", deviation: "📋", summary: "🏢", org: "🏛", account: "🛡" };
  items.forEach((n) => {
    const item = document.createElement("div");
    item.className = "notif-item" + (n.priority === "danger" ? " danger" : "") + (n.read ? " is-read" : "");
    item.innerHTML = `<div class="notif-ico">${ICO[n.type] || "🔔"}</div>
      <div class="notif-main"><div class="notif-title">${esc(n.title)}</div>${n.body ? `<div class="notif-sub">${esc(n.body)}</div>` : ""}</div>
      <div class="notif-dot"></div>`;
    item.addEventListener("click", () => {
      if (!n.read) BM.markNotifRead(n.id);
      /* 组织架构类通知 → 跳「基础数据」第 3 个 Tab（可编辑架构页），而非遗留的独立只读页 org */
      if (n.view === "org" || (n.view === "basedata" && n.type === "org")) {
        BM.openView("basedata", { tab: "org" });
      } else if (n.view) {
        BM.openView(n.view);
      }
      BM.closeNotifPanel();
    });
    list.appendChild(item);
  });
};

BM.closeNotifPanel = function () {
  if (BM._notifPanel) { BM._notifPanel.remove(); BM._notifPanel = null; }
};

BM.initBell = function () {
  const bell = document.getElementById("bellBtn");
  if (!bell) return;
  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    if (BM._notifPanel) { BM.closeNotifPanel(); return; }
    BM.loadNotifications().then(() => {
      const panel = document.createElement("div");
      panel.className = "notif-panel";
      panel.innerHTML = `<div class="notif-head"><span class="nh-title">消息通知</span><span class="nh-all">全部已读</span></div><div class="notif-list"></div>`;
      panel.querySelector(".nh-all").addEventListener("click", (e2) => { e2.stopPropagation(); BM.markAllRead(); });
      document.body.appendChild(panel);
      BM._notifPanel = panel;
      BM.renderNotifPanelItems();
    });
  });
  document.addEventListener("click", (e) => {
    if (BM._notifPanel && !BM._notifPanel.contains(e.target) && !bell.contains(e.target)) {
      BM.closeNotifPanel();
    }
  });
};

/* ---------- 初始化 ---------- */
function init() {
  BM.loadState();
  BM.state = window.BM.state;

  /* ========== 事件绑定（先于登录检查） ========== */
  const send = () => {
    const input = document.getElementById("chatInput");
    const text = input.value;
    if (!text.trim()) return;
    BM.sendChat(text);
    input.value = "";
    input.style.height = "auto";
  };
  document.getElementById("sendBtn").addEventListener("click", send);
  const input = document.getElementById("chatInput");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 96) + "px";
  });

  /* 退出登录 → 回登录页 */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      BM.logout();
      document.getElementById("appRoot").style.display = "none";
      BM.renderLogin();
    });
  }

  /* 登录成功后初始化 Copilot（按角色） */
  document.addEventListener("bm-logged-in", () => {
    BM.initCopilot();
    refreshRoleLabel();
    BM.loadNotifications();
  });

  /* 消息铃铛（D2）：绑定点击 / 面板 / 全局关闭 */
  BM.initBell();

  /* ========== 登录状态 ========== */
  const params = new URLSearchParams(location.search);
  /* 演示深链（?as=角色 免登录）：测试/演示用，客户环境已隐藏，默认关闭。
   * 需要演示时把 ENABLE_DEMO_DEEPLINK 改为 true。 */
  const ENABLE_DEMO_DEEPLINK = false;
  const asRole = params.get("as");
  if (ENABLE_DEMO_DEEPLINK && asRole && BM.ROLES[asRole]) {
    const dept = params.get("dept") || "admin";
    BM.login(asRole, dept);
    /* 阶段一：真实角色参数化深链（兼容旧 boss/manager/staff/finance） */
    if (asRole === "centerOwner") BM.state.centerId = params.get("center") || "hr";
    if (asRole === "expense") BM.state.expenseType = params.get("etype") || "canteen";
    if (asRole === "legalHead" || asRole === "adminHead" || asRole === "companyBudgeter") {
      BM.state.scopeCompany = params.get("company") || "2010";
    }
  }

  /* Copilot 欢迎态（登录后按角色差异化渲染） */
  if (BM.state.loggedIn) {
    BM.initCopilot();
  }

  if (!BM.state.loggedIn) {
    BM.renderLogin();
    return;
  }
  BM.enterApp();
  BM.loadNotifications();

  /* 会话校验：真实登录（有 token）时后台核对 /api/auth/me，过期则回登录页 */
  if (BM.state.loggedIn && BM.state.token) {
    fetch("/api/auth/me", { headers: { Authorization: "Bearer " + BM.state.token } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("401"))))
      .then((me) => {
        if (me && me.username && BM.state.user) BM.state.user = me; /* 刷新最新用户信息 */
      })
      .catch(() => {
        BM.logout();
        BM.renderLogin();
        BM.toast("会话已过期，请重新登录");
      });
  }
}

document.addEventListener("DOMContentLoaded", init);
