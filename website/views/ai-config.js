/* ================================================================
 * ai-config.js — AI 接入配置页（模块三 · 最小可用集）
 * 场景：管理员/财务 配置大模型 provider + API Key（加密存储）+ 模型，并测试连通。
 * 未配置时全站 AI 功能走确定性兜底（见 ai-modules-design.md）。
 * 安全：API Key 明文只在本页输入时存在于内存，保存后落库即密文；本页不回显明文。
 * ================================================================ */
var BM = window.BM || {};



const AI_PROVIDERS = [
  { id: "openai", name: "OpenAI（GPT 系列）" },
  { id: "qwen", name: "通义千问 Qwen" },
  { id: "zhipu", name: "智谱 GLM" },
  { id: "deepseek", name: "DeepSeek" },
];

/* 各服务商常用模型版本（选服务商自动带出候选，仍可手填自定义/私有部署模型名） */
const PROVIDER_MODELS = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo", "o1-mini", "o1", "o3-mini"],
  qwen: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long", "qwen2.5-72b-instruct", "qwen2.5-32b-instruct"],
  zhipu: ["glm-4", "glm-4-plus", "glm-4-air", "glm-4-flash", "glm-3-turbo"],
  deepseek: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
};
/* 各服务商默认官方端点（仅作 placeholder 提示，不参与逻辑） */
const PROVIDER_DEFAULT_BASE = {
  openai: "https://api.openai.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
};
const PROVIDER_DEFAULT_MODEL = {
  openai: "gpt-4o-mini", qwen: "qwen-max", zhipu: "glm-4", deepseek: "deepseek-chat",
};

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

  /* model（选服务商自动带出候选 + 可手填自定义） */
  const modelList = el("datalist");
  modelList.id = "ai-cfg-model-list";
  const modelInput = el("input", "acc-input");
  modelInput.type = "text";
  modelInput.setAttribute("list", "ai-cfg-model-list");
  modelInput.placeholder = "如 gpt-4o-mini / qwen-max / glm-4 / deepseek-chat";
  form.appendChild(field("模型名称", modelInput));

  /* baseUrl（可选） */
  const baseUrlInput = el("input", "acc-input");
  baseUrlInput.type = "text";
  baseUrlInput.placeholder = "可选 · 代理/自建/OpenAI 兼容端点（留空用官方默认）";
  form.appendChild(field("Base URL（可选）", baseUrlInput));

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
  page.appendChild(modelList);

  container.appendChild(page);

  /* ---------- 行为 ---------- */
  function fillModelOptions(provider) {
    modelList.innerHTML = "";
    (PROVIDER_MODELS[provider] || []).forEach((m) => {
      const o = el("option"); o.value = m; modelList.appendChild(o);
    });
  }

  provSel.addEventListener("change", () => {
    const p = provSel.value;
    modelInput.value = PROVIDER_DEFAULT_MODEL[p] || ""; // 自动加载该服务商默认模型
    fillModelOptions(p);
    baseUrlInput.placeholder = "可选 · " + (PROVIDER_DEFAULT_BASE[p] || "") + "（留空用官方默认）";
  });

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
      if (cfg.baseUrl) baseUrlInput.value = cfg.baseUrl;
      fillModelOptions(provSel.value);
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
    const body = { provider: provSel.value, model: modelInput.value.trim(), apiKey: keyInput.value, baseUrl: baseUrlInput.value.trim() };
    BM.apiSend("/api/ai-config", "PUT", body)
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
      ? { provider: provSel.value, apiKey: keyInput.value, model: modelInput.value.trim(), baseUrl: baseUrlInput.value.trim() }
      : {}; // 留空则用已保存配置测试
    BM.apiSend("/api/ai-config/test", "POST", body)
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
