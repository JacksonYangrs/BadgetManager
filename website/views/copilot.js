/* ================================================================
 * copilot.js — Copilot 对话区渲染
 * 欢迎态（推荐问题 + 今日风险） + 消息流 + 四类卡片 + 证据链
 * ================================================================ */

var BM = window.BM || {};

const ICONS = {
  predict: "预",
  analyze: "析",
  recommend: "荐",
  execute: "行",
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------- 欢迎态（按角色差异化） ---------- */
BM.initCopilot = function () {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";
  const role = BM.state.role;

  const hello = el("div", "msg msg-ai");
  const helloText =
    role === "boss" ? "您好，我是 AI Budget Copilot。全局预算的风险、趋势与决策，我帮您盯住。"
    : role === "finance" ? "您好，我是 AI Budget Copilot。预算口径、执行总控与调整，我帮您把关。"
    : role === "manager" ? "您好，我是 AI Budget Copilot。本部门的预算执行与项目偏差，我帮您盯住。"
    : "您好，我是 AI Budget Copilot。您负责的项目预算与申请进度，我帮您跟进。";
  hello.innerHTML = `<div class="msg-bubble" style="background:transparent;border:none;padding:0;font-size:13.5px;line-height:1.6">${escapeHtml(helloText)}</div>
    <div class="msg-time">${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>`;
  chat.appendChild(hello);

  const wrap = el("div", "msg msg-ai msg-card");
  wrap.appendChild(renderSuggestions(role));
  wrap.appendChild(renderRisks(role));
  chat.appendChild(wrap);
};

function roleQuestions(role) {
  if (role === "boss") {
    return ["哪个部门今年最容易超预算？", "今年费用整体情况怎么样？", "IT 设备超支怎么解决？"];
  }
  if (role === "finance") {
    return ["哪些项目需要调整预算？", "今年决算大概是什么情况？", "有没有成本优化建议？"];
  }
  if (role === "manager") {
    return ["本部门哪个项目风险最高？", "本部门预算还剩多少？", "部门费用为什么上涨？"];
  }
  return ["我负责的项目还剩多少预算？", "我的采购申请到哪一步了？", "我发起的报销合规吗？"];
}

function roleRisks(role) {
  if (role === "boss") {
    return [
      { text: "IT 设备已用 + 冻结超预算，预计超支 35%", sub: "8 月集中采购所致 · 含在途 38 万", level: "danger", catId: "it" },
      { text: "车辆维修按当前趋势预计 11 月超支 18%", sub: "维修单价环比 +9%", level: "danger", catId: "vehicle" },
      { text: "培训费执行偏低，预计节余 30 万可调剂", sub: "可调剂给 IT 设备", level: "warn", catId: "training" },
    ];
  }
  if (role === "finance") {
    return [
      { text: "4 张单据待财务环节，AI 已初审", sub: "2 张建议人工复核", level: "warn", catId: "" },
      { text: "预算编制 6 个部门已填报 4 个", sub: "待财务汇总", level: "info", catId: "" },
      { text: "培训费执行偏低，已建议调剂 30 万", sub: "决策中心可一键执行", level: "warn", catId: "training" },
    ];
  }
  if (role === "manager") {
    return [
      { text: "本部门车辆维修执行偏高，近 3 月 +9%", sub: "建议引入供应商比价", level: "warn", catId: "vehicle" },
      { text: "办公用品增长合理（员工 +28%）", sub: "无需削减，可优化采购成本", level: "info", catId: "office" },
    ];
  }
  return [
    { text: "显示器项目：额度 7.8 万 · 剩余 2.4 万", sub: "已用 54%，新申请需谨慎", level: "warn", catId: "it" },
    { text: "办公电脑更换项目：30 万待启动", sub: "可发起首笔采购", level: "info", catId: "it" },
  ];
}

function renderSuggestions(role) {
  const box = el("div", "suggestions");
  const label = el("div", "suggestions-label", "💡 试试这样问：");
  box.appendChild(label);
  roleQuestions(role || BM.state.role).forEach((q) => {
    const b = el("button", "sug-btn", `${escapeHtml(q)} <span class="sug-arrow">→</span>`);
    b.addEventListener("click", () => BM.sendChat(q));
    box.appendChild(b);
  });
  return box;
}

function renderRisks(role) {
  const box = el("div", "");
  const title = el("div", "suggestions-label", "⚠️ 今日风险（AI 主动预警）：");
  box.appendChild(title);
  const stack = el("div", "risk-stack");
  roleRisks(role || BM.state.role).forEach((r) => {
    const c = el("div", "risk-card" + (r.level === "danger" ? " danger" : ""));
    c.innerHTML = `<div class="risk-icon">${r.level === "danger" ? "!" : r.level === "warn" ? "▲" : "i"}</div>
      <div class="risk-main">
        <div class="risk-text">${escapeHtml(r.text)}</div>
        <div class="risk-sub">${escapeHtml(r.sub)}</div>
      </div><div class="risk-go">›</div>`;
    c.addEventListener("click", () => {
      BM.showView("dashboard");
      const cat = BM.CATEGORIES.find((x) => x.id === r.catId);
      if (cat) BM.filterDetails({ catId: cat.id });
    });
    stack.appendChild(c);
  });
  box.appendChild(stack);
  return box;
}

/* ---------- 消息 ---------- */
BM.addUserMsg = function (text) {
  const chat = document.getElementById("chat");
  const m = el("div", "msg msg-user");
  m.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>
    <div class="msg-time">${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>`;
  chat.appendChild(m);
  chat.scrollTop = chat.scrollHeight;
  BM.state.chatHistory.push({ role: "user", text });
};

BM.addAiText = function (text) {
  const chat = document.getElementById("chat");
  const m = el("div", "msg msg-ai");
  m.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>
    <div class="msg-time">${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>`;
  chat.appendChild(m);
  chat.scrollTop = chat.scrollHeight;
  BM.state.chatHistory.push({ role: "ai", text });
};

BM.addAiCard = function (card) {
  const chat = document.getElementById("chat");
  const m = el("div", "msg msg-ai msg-card");
  m.appendChild(renderCard(card));
  chat.appendChild(m);
  chat.scrollTop = chat.scrollHeight;
  BM.state.chatHistory.push({ role: "ai", card });
};

/* ---------- 四类卡片 ---------- */
function renderCard(card) {
  const root = el("div", "ai-card " + card.type);
  const head = el("div", "card-head");
  head.innerHTML = `<div class="card-icon">${ICONS[card.type] || "AI"}</div>
    <div class="card-title">${escapeHtml(card.title)}</div>`;
  root.appendChild(head);

  const body = el("div", "card-body");
  if (card.subtitle) {
    const sub = el("div", "hint-text", escapeHtml(card.subtitle));
    sub.style.marginBottom = "10px";
    body.appendChild(sub);
  }

  if (card.type === "predict") body.appendChild(renderPredict(body, card));
  else if (card.type === "analyze") body.appendChild(renderAnalyze(card));
  else if (card.type === "recommend") body.appendChild(renderRecommend(card));
  else if (card.type === "execute") body.appendChild(renderExecute(card));

  root.appendChild(body);

  /* 证据链 */
  if (card.evidence) {
    root.appendChild(renderEvidence(card));
  } else if (card.type !== "execute") {
    root.appendChild(renderEvidenceDefault(card));
  }

  return root;
}

function renderPredict(body, card) {
  const list = el("div", "forecast-list");
  card.items.forEach((it) => {
    const item = el("div", "forecast-item " + (it.status === "danger" ? "danger" : it.status === "warn" ? "warn" : ""));
    item.innerHTML = `<div class="forecast-row1">
      <div class="forecast-cat">${escapeHtml(it.cat)}</div>
      <span class="badge ${it.status === "danger" ? "badge-danger" : it.status === "warn" ? "badge-warn" : "badge-ok"}">${escapeHtml(it.verdict)}</span>
      <span class="confidence" style="margin-left:auto">
        <span>置信度 ${it.confidence || "88%"}</span>
        <span class="confidence-bar"><span class="confidence-fill" style="width:${it.confidence || "88"}%"></span></span>
      </span>
    </div>
    <div class="forecast-row2">${escapeHtml(it.detail)}</div>`;
    list.appendChild(item);
  });
  return list;
}

function renderAnalyze(card) {
  const box = el("div", "");
  const factors = el("div", "factor-list");
  card.factors.forEach((f) => {
    const row = el("div", "factor");
    row.innerHTML = `<div class="factor-name">${escapeHtml(f.name)}</div>
      <div class="factor-val">${escapeHtml(f.val)}</div>
      <span class="factor-delta badge ${f.cls === "danger" ? "badge-danger" : f.cls === "warn" ? "badge-warn" : "badge-ok"}">${escapeHtml(f.delta)}</span>`;
    factors.appendChild(row);
  });
  box.appendChild(factors);
  const concl = el("div", "conclusion " + (card.cls || "ok"), escapeHtml(card.conclusion));
  concl.style.marginTop = "11px";
  box.appendChild(concl);
  return box;
}

function renderRecommend(card) {
  const box = el("div", "");
  const list = el("div", "rec-list");
  card.items.forEach((it) => {
    const item = el("div", "rec-item");
    item.innerHTML = `<div class="rec-title">💡 ${escapeHtml(it.title)}</div>
      <div class="rec-desc">${escapeHtml(it.desc)}</div>
      <div class="rec-impact">${it.impact.map((i) => `<span class="impact-chip ${i.cls === "warn" ? "warn" : ""}">${escapeHtml(i.text)}</span>`).join("")}</div>
      <div class="rec-actions">
        <button class="btn btn-accent btn-sm rec-adopt" data-id="${it.sugId}">采纳并执行</button>
      </div>`;
    item.querySelector(".rec-adopt").addEventListener("click", () => {
      BM.adoptSuggestionFromChat(it.sugId);
    });
    list.appendChild(item);
  });
  box.appendChild(list);
  if (card.hint) {
    const h = el("div", "hint-text", "🧭 " + escapeHtml(card.hint));
    h.style.marginTop = "10px";
    box.appendChild(h);
  }
  return box;
}

function renderExecute(card) {
  const box = el("div", "");
  const list = el("div", "exec-checklist");
  card.items.forEach((it) => {
    const row = el("div", "exec-item " + (it.pass ? "pass" : ""));
    row.innerHTML = `<div class="exec-ico">${it.pass ? "✓" : "!"}</div>
      <div class="exec-label">${escapeHtml(it.label)}</div>
      <div class="exec-value">${escapeHtml(it.value)}</div>`;
    list.appendChild(row);
  });
  box.appendChild(list);

  const doc = el("div", "doc-preview");
  doc.innerHTML = `<div class="doc-line"><span class="k">单据</span><span class="v">${escapeHtml(card.title2)}</span></div>
    <div class="doc-line"><span class="k">预算科目</span><span class="v">${escapeHtml(card.catName)}</span></div>
    <div class="doc-line"><span class="k">金额</span><span class="v">${BM.money(card.amount)}</span></div>
    <div class="doc-line"><span class="k">供应商</span><span class="v">${escapeHtml(card.supplier)}</span></div>`;
  box.appendChild(doc);

  const chain = el("div", "approval-chain");
  chain.innerHTML = card.chain
    .map((n, i) => `<span class="approval-node ${i === card.chain.length - 1 ? "active" : ""}">${escapeHtml(n)}<span class="st">${i === card.chain.length - 1 ? "待审批" : "已确定"}</span></span>`)
    .join('<span class="chain-arrow">→</span>');
  box.appendChild(chain);

  if (card.transferAvailable) {
    const warn = el("div", "conclusion danger", "⚠️ 预算不足：AI 建议先执行预算调剂（培训费 → IT 设备 30 万），调剂完成后再审批本单。");
    warn.style.marginTop = "11px";
    box.appendChild(warn);
    const actions = el("div", "rec-actions");
    const b = el("button", "btn btn-accent btn-sm", "一键执行预算调剂");
    b.addEventListener("click", () => BM.adoptSuggestionFromChat(card.transferId, true));
    actions.appendChild(b);
    box.appendChild(actions);
  } else if (card.ok) {
    const ok = el("div", "conclusion ok", "✓ 采购申请已生成并进入审批流，审批人将收到通知。可在「审批中心」查看。");
    ok.style.marginTop = "11px";
    box.appendChild(ok);
  }

  return box;
}

/* ---------- 证据链 ---------- */
function renderEvidence(card) {
  const box = el("div", "evidence");
  box.innerHTML = `<div class="evidence-title">🔍 证据链</div>`;
  card.evidence.forEach((e) => {
    box.appendChild(el("div", "evidence-step", `<span class="ev-dot">●</span><span>${escapeHtml(e)}</span>`));
  });
  const foot = el("div", "evidence-foot");
  const btn = el("button", "btn btn-outline btn-sm", "查看明细");
  btn.addEventListener("click", () => {
    BM.showView("details");
    if (card.catId) BM.filterDetails({ catId: card.catId });
  });
  foot.appendChild(btn);
  foot.appendChild(el("span", "hint-text", " 数据来源：预算台账 · 单据流水 · 供应商记录"));
  box.appendChild(foot);
  return box;
}

function renderEvidenceDefault(card) {
  const box = el("div", "evidence");
  box.innerHTML = `<div class="evidence-title">🔍 证据链</div>
    <div class="evidence-step"><span class="ev-dot">●</span><span>数据来源：预算台账 · 1-9 月单据流水 · 供应商报价记录</span></div>
    <div class="evidence-step"><span class="ev-dot">●</span><span>计算依据：月度执行趋势外推 + 冻结/在途识别</span></div>
    <div class="evidence-step"><span class="ev-dot">●</span><span>置信度 88% · 反证：若 10 月出现大额减项，风险将缓解</span></div>`;
  if (card.catId) {
    const foot = el("div", "evidence-foot");
    const btn = el("button", "btn btn-outline btn-sm", "查看明细");
    btn.addEventListener("click", () => {
      BM.showView("details");
      BM.filterDetails({ catId: card.catId });
    });
    foot.appendChild(btn);
    box.appendChild(foot);
  }
  return box;
}

window.BM = BM;
