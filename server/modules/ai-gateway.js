/* ================================================================
 * ai-gateway.js — AI 接入层（大模型专线 · 统一入口）
 * 职责：统一封装大模型调用（OpenAI / Qwen / 智谱 / DeepSeek，均走 OpenAI 兼容协议），
 *   提供 chatCompletion / testConnection，并对 API Key 做 AES-256-GCM 加解密与脱敏。
 * 是所有 AI 能力（ai-policy-extract / copilot / ai-config）调用大模型的唯一入口，
 * 遵循「LLM 经 prompt 抽取，规则仅作护栏」：本层只管「把请求送到厂商、把回答拿回来」，
 * 不替业务做决策。
 *
 * 启用条件：system_config（scope=ai_gateway）已配置 provider + api_key 且 enabled=1。
 * 未配置时 chatCompletion 抛错，由调用方走确定性兜底（不静默失败）。
 * ================================================================ */
const crypto = require("crypto");

const PROVIDERS = ["openai", "qwen", "zhipu", "deepseek"];

/* OpenAI 兼容 base URL（智谱/通义均提供兼容端点，统一 Bearer 鉴权） */
const PROVIDER_BASE = {
  openai: "https://api.openai.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
};

function defaultModel(provider) {
  return {
    openai: "gpt-4o-mini",
    qwen: "qwen-max",
    zhipu: "glm-4",
    deepseek: "deepseek-chat",
  }[provider] || "gpt-4o-mini";
}

/* ---------- 密钥加解密（AES-256-GCM） ---------- */
const ALGO = "aes-256-gcm";

function getSecret() {
  const s = process.env.APP_SECRET || "badgetmanager-demo-secret-change-me";
  return crypto.createHash("sha256").update(s).digest(); // 32 bytes
}

function encryptSecret(plain) {
  if (!plain) return null;
  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("base64") + ":" + tag.toString("base64") + ":" + enc.toString("base64");
}

function decryptSecret(stored) {
  if (!stored) return null;
  const parts = String(stored).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, encB64] = parts;
  try {
    const key = getSecret();
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch (e) {
    return null; // 解密失败（密钥不匹配/被篡改）→ 返回 null，调用方走兜底
  }
}

/* 脱敏展示：sk-abc...xyz → sk****yz，短串全遮 */
function maskSecret(plain) {
  if (!plain) return null;
  const s = String(plain);
  if (s.length <= 4) return "****";
  return s.slice(0, 2) + "****" + s.slice(-2);
}

/* 错误脱敏：厂商报错常回显 key 片段（如 OpenAI「Incorrect API key provided: sk-...」），
 * 回传前端前必须把密钥类片段抹掉，避免任何 key 痕迹外泄 */
function redactSecrets(s) {
  if (!s) return s;
  return String(s)
    .replace(/sk-[A-Za-z0-9.*_-]{4,}/gi, "sk-****")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza****")
    .replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, "xox****");
}

/* ---------- 大模型对话 ---------- */
const FETCH_TIMEOUT_MS = 20000; /* 坏 baseUrl / 网络黑洞时防挂起（曾见请求数十秒无响应） */

async function chatCompletion({ provider, apiKey, model, messages, jsonMode, baseUrl }) {
  if (!provider || !apiKey) throw new Error("AI 未配置：缺少 provider 或 apiKey");
  const base = baseUrl || PROVIDER_BASE[provider];
  if (!base) throw new Error("不支持的 provider：" + provider);
  const url = base + "/chat/completions";
  const body = {
    model: model || defaultModel(provider),
    messages: messages || [],
    temperature: 0.2,
  };
  if (jsonMode) body.response_format = { type: "json_object" };
  let resp;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("AI 请求超时（" + FETCH_TIMEOUT_MS / 1000 + "s），请检查 baseUrl 网络连通性");
    throw new Error("AI 网络请求失败：" + (e && e.message ? e.message : String(e)));
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(redactSecrets("AI 调用失败 " + resp.status + "：" + t.slice(0, 200)));
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (content == null) throw new Error("AI 返回为空");
  return content;
}

/* 连通性自检：用最小 prompt 验证一次调用 */
async function testConnection({ provider, apiKey, model, baseUrl }) {
  const start = Date.now();
  try {
    const content = await chatCompletion({
      provider, apiKey, model, baseUrl,
      messages: [{ role: "user", content: "请只回复两个字：连通" }],
    });
    return { ok: true, latencyMs: Date.now() - start, sample: String(content || "").slice(0, 60) };
  } catch (e) {
    return { ok: false, error: redactSecrets(e && e.message ? e.message : String(e)) };
  }
}

module.exports = {
  PROVIDERS, PROVIDER_BASE, defaultModel,
  encryptSecret, decryptSecret, maskSecret,
  chatCompletion, testConnection,
};
