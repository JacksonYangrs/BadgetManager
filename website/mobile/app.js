/* ================================================================
 * app.js — 手机版应用入口
 * 底部 Tab（首页 / 预算 / 审批 / AI 助手）+ 登录 + 角色切换 + 弹层
 * ================================================================ */

var BM = window.BM || {};

let currentTab = "home";
let budgetSub = "overview";

/* ---------- 物料按角色范围（手机版扩展） ---------- */
BM.scopedMaterials = function () {
  const r = BM.state.role;
  if (r === "staff") {
    const myProj = new Set(BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "staff").map((p) => p.id));
    return BM.MATERIALS.filter((m) => myProj.has(m.projectId));
  }
  if (r === "manager") {
    const deptProj = new Set(BM.PROJECTS.filter((p) => p.deptId === BM.state.deptId).map((p) => p.id));
    return BM.MATERIALS.filter((m) => deptProj.has(m.projectId));
  }
  return BM.MATERIALS;
};

/* ---------- 页面标题 ---------- */
const TAB_TITLES = { home: "工作台", budget: "预算", approval: "审批中心", copilot: "AI 助手" };
const BUDGET_SUB_TITLES = {
  overview: "预算总览",
  plan: "预算编制",
  track: "预算追踪",
  final: "决算",
  rules: "预算规则",
  adjust: "预算调整",
};

function refreshHeader() {
  const r = BM.curRole();
  document.getElementById("roleLabel").textContent = r.name;
  if (currentTab === "budget") {
    document.getElementById("pageTitle").textContent = BUDGET_SUB_TITLES[budgetSub] || "预算";
    document.getElementById("pageSub").textContent = r.name + " · " + r.title;
  } else {
    document.getElementById("pageTitle").textContent = TAB_TITLES[currentTab] || "工作台";
    document.getElementById("pageSub").textContent = r.name + " · " + r.title;
  }
}

/* ---------- Tab 切换 ---------- */
BM.switchTab = function (tab, sub) {
  if (!BM.state.loggedIn) return;
  currentTab = tab;
  if (sub && tab === "budget") budgetSub = sub;

  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });

  const content = document.getElementById("content");
  content.innerHTML = "";

  if (tab === "home") {
    BM.renderHome(content);
  } else if (tab === "budget") {
    BM.renderBudget(content, budgetSub);
  } else if (tab === "approval") {
    BM.renderApproval(content);
  } else if (tab === "copilot") {
    content.innerHTML = `<div class="copilot-scroll"><div class="chat" id="chat"></div>
      <div class="composer">
        <textarea id="chatInput" rows="1" placeholder="直接提问，例如：哪个部门最容易超预算？" autocomplete="off"></textarea>
        <button class="send-btn" id="sendBtn">➤</button>
      </div></div>`;
    BM.initCopilotMobile();
    bindComposer();
  }
  refreshHeader();
  content.scrollTop = 0;
};

BM.renderTab = function () {
  BM.switchTab(currentTab, currentTab === "budget" ? budgetSub : undefined);
};

/* ---------- 发送对话 ---------- */
function bindComposer() {
  const send = () => {
    const input = document.getElementById("chatInput");
    if (!input) return;
    const text = input.value;
    if (!text.trim()) return;
    BM.sendChat(text);
    input.value = "";
    input.style.height = "auto";
  };
  const btn = document.getElementById("sendBtn");
  if (btn) btn.addEventListener("click", send);
  const input = document.getElementById("chatInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 90) + "px";
    });
  }
}

/* ---------- 发送对话（消息流） ---------- */
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
    if (chat) {
      const m = document.createElement("div");
      m.className = "msg msg-ai";
      const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
      m.innerHTML = `<div class="msg-bubble">✅ 预算调剂已执行：培训费 → IT 设备 30 万元（财务李静已确认）。采购申请现已满足预算条件，可在「审批」Tab 终审放行。</div>
        <div class="msg-time">${time}</div>`;
      chat.appendChild(m);
      chat.scrollTop = chat.scrollHeight;
    }
  }
  BM.renderTab();
};

/* ---------- 弹层 ---------- */
BM.closeSheet = function () {
  document.getElementById("modalMask").style.display = "none";
  document.getElementById("modalSheet").style.display = "none";
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

/* ---------- 进入系统 ---------- */
BM.enterApp = function () {
  if (!BM.state.loggedIn) return;
  document.getElementById("loginRoot").style.display = "none";
  document.getElementById("appRoot").style.display = "flex";
  /* URL hash 控制默认 Tab / sub */
  const hash = (location.hash || "").replace("#", "");
  const hashParts = hash.split("/");
  const allowedTabs = ["home", "budget", "approval", "copilot"];
  currentTab = allowedTabs.indexOf(hashParts[0]) >= 0 ? hashParts[0] : "home";
  budgetSub = hashParts[1] || "overview";
  BM.switchTab(currentTab);
  BM.toast("欢迎，" + BM.curRole().name);
};

/* ---------- 初始化 ---------- */
function init() {
  BM.loadState();
  BM.state = window.BM.state;

  /* 底部 Tab 事件（先于登录检查绑定） */
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.addEventListener("click", () => BM.switchTab(b.dataset.tab));
  });

  /* 切换角色 */
  document.getElementById("switchRoleBtn").addEventListener("click", () => {
    BM.logout();
    document.getElementById("loginRoot").style.display = "flex";
    document.getElementById("appRoot").style.display = "none";
    BM.renderLogin();
    BM.toast("请重新登录");
  });

  /* 重置 */
  document.getElementById("resetBtn").addEventListener("click", () => {
    BM.resetState();
    localStorage.removeItem("bm-demo-state-v1");
    location.reload();
  });

  /* 弹层遮罩点击关闭 */
  document.getElementById("modalMask").addEventListener("click", BM.closeSheet);

  /* URL 参数自动登录（?as=角色 免登录）：测试/演示用，客户环境已隐藏，默认关闭 */
  const ENABLE_DEMO_DEEPLINK = false;
  const params = new URLSearchParams(location.search);
  const asRole = params.get("as");
  if (ENABLE_DEMO_DEEPLINK && asRole && BM.ROLES[asRole]) {
    const dept = params.get("dept") || "admin";
    BM.login(asRole, dept);
  }

  if (!BM.state.loggedIn) {
    BM.renderLogin();
    return;
  }
  BM.enterApp();
}

document.addEventListener("DOMContentLoaded", init);
