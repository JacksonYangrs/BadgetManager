/* ================================================================
 * ai-gateway.js — AI 接入层（大模型专线 · 待启用）
 * 职责：统一封装大模型调用（OpenAI / Qwen / 智谱 / DeepSeek），读取 AWS 已配密钥，
 *   提供 chat / embedding 接口与本地兜底。是所有 AI 能力（ai-policy-extract /
 *   ai-budget-decision）调用大模型的唯一入口（遵循「LLM 经 prompt 抽取，规则仅作护栏」）。
 * 当前占位：尚无真实接入，调用 chatCompletion 会抛出明确错误，避免静默失败。
 * ================================================================ */
const PROVIDERS = ["openai", "qwen", "zhipu", "deepseek"];

/* 当前接入状态：null 表示尚未在环境变量启用 AI_PROVIDER / AI_API_KEY。 */
function getProvider() {
  return process.env.AI_PROVIDER || null;
}

/* 大模型对话接口（占位）。
 * TODO（接入时实现）：
 *   1) 从 process.env.AI_PROVIDER / AI_API_KEY 读取（AWS 已统一配）；
 *   2) 按 provider 选择 SDK / 开放平台 HTTP；
 *   3) 失败回退到确定性规则口径（不破坏编制确定性）。 */
function chatCompletion(/* messages */) {
  throw new Error("AI 接入（ai-gateway）尚未启用：请配置 AI_PROVIDER / AI_API_KEY，或由确定性规则口径承接");
}

module.exports = { PROVIDERS, getProvider, chatCompletion };
