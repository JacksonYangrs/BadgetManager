/* ================================================================
 * ai-config.js — AI 接入配置页（模块三 · 最小可用集）
 * 场景：管理员/财务 配置大模型 provider + API Key（加密存储）+ 模型，并测试连通。
 * 未配置时全站 AI 功能走确定性兜底（见 ai-modules-design.md）。
 * 安全：API Key 明文只在本页输入时存在于内存，保存后落库即密文；本页不回显明文。
 * ================================================================ */
var BM = window.BM || {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI（GPT 系列）" },
  { id: "qwen", name: "通义千问 Qwen" },
  { id: "zhipu", name: "智谱 GLM" },
  { id: "deepseek", name: "DeepSeek" },
];

BM.renderAiConfig = function (container) {
  container.innerHTML = "";
  const page = el("div", "page");

  /* 头部 */
  const head = el("div", "page-head");
  head.appendChild(el("div", "", `<div class="page-title">AI 配置</div>
    <div class="page-desc">配置大模型接入（provider + API Key + 模型）。Key 加密存储，本页不回显明文；未配置时系统自动使用确定性兜底。</div>`));
  page.appendChild(head);

  /* 状态条 */
  const statusBar = el("div", "ai-cfg-status");
  page.appendChild(statusBar);

  /* 表单卡片 */
  const card = el("div", "wb-card ai-cfg-card");
  const form = el("div", "ai-cfg-form");

  /* provider 下拉 */
  const provSel = el("select", "acc-input");
  AI_PROVIDERS.forEach((p) => {
    const o = el("option");
    o.value = p.id; o.textContent = p.name;
    provSel.appendChild(o);
  });
  form.appendChild(field("模型服务商", provSel));

  /* apiKey */
  const keyInput = el("input", "acc-input");
  keyInput.type = "password";
  keyInput.placeholder = "粘贴 API Key（如 sk-...），留空表示不修改已保存的 Key";
  form.appendChild(field("API Key", keyInput));
  const keyHint = el("div", "ai-cfg-hint", "尚未保存任何 Key");
  form.appendChild(keyHint);

  /* model */
  const modelInput = el("input", "acc-input");
  modelInput.type = "text";
  modelInput.placeholder = "如 gpt-4o-mini / qwen-max / glm-4 / deepseek-chat";
  form.appendChild(field("模型名称", modelInput));

  /* 按钮行 */
  const foot = el("div", "login-btn-row");
  const saveBtn = el("button", "btn btn-primary", "保存配置");
  const testBtn = el("button", "btn btn-outline", "测试连接");
  foot.appendChild(saveBtn);
  foot.appendChild(testBtn);
  form.appendChild(foot);

  /* 测试结果 */
  const testOut = el("div", "ai-cfg-test");
  form.appendChild(testOut);

  card.appendChild(form);
  page.appendChild(card);

  container.appendChild(page);

  /* ---------- 行为 ---------- */
  function refreshStatus(cfg) {
    if (cfg && cfg.enabled && cfg.provider) {
      statusBar.className = "ai-cfg-status on";
      statusBar.innerHTML = `● 已启用 · 当前模型 <b>${esc(cfg.model || "—")}</b> · 服务商 ${esc(cfg.provider)}`;
    } else {
      statusBar.className = "ai-cfg-status off";
      statusBar.innerHTML = `○ 未启用（AI 功能使用确定性兜底，不影响既有流程）`;
    }
  }

  function load() {
    BM.apiGet("/api/ai-config").then((cfg) => {
      if (!cfg || cfg.error) return;
      if (cfg.provider) provSel.value = cfg.provider;
      if (cfg.model) modelInput.value = cfg.model;
      if (cfg.apiKeyMasked) {
        keyHint.textContent = "已保存 Key：" + cfg.apiKeyMasked + "（如要更换请填写上方输入框）";
        keyHint.classList.add("has");
      } else {
        keyHint.textContent = "尚未保存任何 Key";
        keyHint.classList.remove("has");
      }
      refreshStatus(cfg);
    }).catch(() => {});
  }

  saveBtn.addEventListener("click", () => {
    const body = { provider: provSel.value, model: modelInput.value.trim(), apiKey: keyInput.value };
    fetch("/api/ai-config", { method: "PUT", headers: BM.authHeaders(), body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((cfg) => {
        keyInput.value = ""; // 清空明文输入
        if (cfg.apiKeyMasked) {
          keyHint.textContent = "已保存 Key：" + cfg.apiKeyMasked + "（如要更换请填写上方输入框）";
          keyHint.classList.add("has");
        }
        refreshStatus(cfg);
        BM.toast("✅ AI 配置已保存（Key 已加密存储）");
      })
      .catch(() => BM.toast("保存失败，请重试"));
  });

  testBtn.addEventListener("click", () => {
    testOut.textContent = "连接测试中…";
    testOut.className = "ai-cfg-test";
    const body = keyInput.value
      ? { provider: provSel.value, apiKey: keyInput.value, model: modelInput.value.trim() }
      : {}; // 留空则用已保存配置测试
    fetch("/api/ai-config/test", { method: "POST", headers: BM.authHeaders(), body: JSON.stringify(body) })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          testOut.className = "ai-cfg-test ok";
          testOut.textContent = `✅ 连接成功 · 延迟 ${res.latencyMs}ms · 样例：${res.sample || ""}`;
        } else {
          testOut.className = "ai-cfg-test err";
          testOut.textContent = "❌ 连接失败：" + (res.error || "未知错误");
        }
      })
      .catch(() => { testOut.className = "ai-cfg-test err"; testOut.textContent = "❌ 请求异常"; });
  });

  load();
};

/* 表单字段：label + 控件（复用 accounts 页 .acc-field 样式） */
function field(label, input) {
  const row = el("div", "acc-field");
  row.appendChild(el("label", "", label));
  row.appendChild(input);
  return row;
}
