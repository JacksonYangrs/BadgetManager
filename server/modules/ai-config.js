/* ================================================================
 * ai-config.js — AI 接入配置存储（复用 HELPBUY 设计理念：配置集中、密钥加密、API 脱敏）
 * 依赖 ai-gateway 的加解密工具；不反向依赖 ai-gateway 的调用逻辑（无环）。
 * 表：system_config(scope, key, value) 主键 (scope, key)
 *   scope = "ai_gateway"：provider / model / api_key(密文) / enabled
 * 对外：getConfig（脱敏，供前端展示）、saveConfig（加密落库）、getActiveCredentials（内部取明文，仅 AI 调用用）
 * ================================================================ */
const { encryptSecret, decryptSecret, maskSecret, defaultModel } = require("./ai-gateway");

const SCOPE = "ai_gateway";

function initSystemConfig(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      scope TEXT NOT NULL,
      key   TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (scope, key)
    );
  `);
}

function _get(db, key) {
  const row = db.prepare("SELECT value FROM system_config WHERE scope = ? AND key = ?").get(SCOPE, key);
  return row ? row.value : null;
}

function _set(db, key, value) {
  db.prepare(
    "INSERT INTO system_config (scope, key, value) VALUES (?, ?, ?) " +
    "ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value"
  ).run(SCOPE, key, value == null ? null : String(value));
}

/* 供前端展示：永远不返回明文 key */
function getAiConfig(db) {
  const provider = _get(db, "provider");
  const model = _get(db, "model");
  const enabled = _get(db, "enabled") === "1";
  const encKey = _get(db, "api_key");
  return {
    provider: provider || null,
    model: model || null,
    enabled: enabled,
    apiKeyMasked: encKey ? maskSecret(decryptSecret(encKey)) : null,
  };
}

/* 保存：provider/model 直接存；apiKey 非空才加密覆盖（空则保留原值）；保存即启用 */
function saveAiConfig(db, body) {
  body = body || {};
  const provider = body.provider != null ? String(body.provider) : null;
  const model = body.model != null ? String(body.model) : null;
  const apiKey = body.apiKey != null ? String(body.apiKey) : "";
  if (provider) _set(db, "provider", provider);
  if (model) _set(db, "model", model);
  if (apiKey) _set(db, "api_key", encryptSecret(apiKey));
  _set(db, "enabled", "1");
  return getAiConfig(db);
}

/* 内部取用：返回明文 key，供 ai-gateway.chatCompletion 调用；未配置/未启用返回 null → 调用方走兜底 */
function getActiveCredentials(db) {
  const enc = _get(db, "api_key");
  const provider = _get(db, "provider");
  const model = _get(db, "model");
  const enabled = _get(db, "enabled") === "1";
  if (!enabled || !provider || !enc) return null;
  const apiKey = decryptSecret(enc);
  if (!apiKey) return null;
  return { provider, model: model || defaultModel(provider), apiKey };
}

module.exports = { initSystemConfig, getAiConfig, saveAiConfig, getActiveCredentials };
