/* ================================================================
 * db.js — 经济事项编制平台 · 组合根（Composition Root）
 * 职责：装配各业务模块（server/modules/*），对外暴露与原 db.js 完全一致的接口，
 *   保证 server.js / import_module.js / policy_rules.js / tests 零改动。
 * 业务逻辑已拆分为限界上下文模块：
 *   organization / auth / subjects / events / budget-compile /
 *   budget-execution / rules / ai-gateway / ai-policy-extract /
 *   ai-budget-decision / notifications / expense-import
 * 启动需 node --experimental-sqlite（Node ≥22.5）。
 * ================================================================ */
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "economic_event.db");

/* ---------- 业务模块 ---------- */
const organization = require("./modules/organization");
const auth = require("./modules/auth");
const subjects = require("./modules/subjects");
const events = require("./modules/events");
const budgetCompile = require("./modules/budget-compile");
const budgetExecution = require("./modules/budget-execution");
const rules = require("./modules/rules");
const aiPolicyExtract = require("./modules/ai-policy-extract");
const notifications = require("./modules/notifications");
const aiConfig = require("./modules/ai-config");

/* ---------- 组合导出（接口稳定） ---------- */
module.exports = Object.assign(
  { DB_FILE, init },
  organization,
  auth,
  subjects,
  events,
  budgetCompile,
  budgetExecution,
  rules,
  aiPolicyExtract,
  notifications,
  aiConfig
);

/* ---------- 初始化（组合编排） ---------- */
function init() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS economic_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cat TEXT NOT NULL UNIQUE,
      acct_code TEXT,
      center TEXT,
      amount INTEGER NOT NULL DEFAULT 0,
      monthly TEXT,
      last_budget INTEGER,
      last_year INTEGER,
      method TEXT,
      ai TEXT,
      sort_no INTEGER
    );
  `);
  try { db.exec("ALTER TABLE economic_event ADD COLUMN center TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE economic_event ADD COLUMN subject_id INTEGER"); } catch (e) {}

  /*  ublic 会计科目主数据表（B-基础数据管理） */
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_subject (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT,
      cat TEXT,
      center TEXT,
      method TEXT,
      control_logic TEXT,
      parent_id INTEGER,
      sort_no INTEGER
    );
  `);
  try { db.exec("ALTER TABLE account_subject ADD COLUMN level INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE account_subject ADD COLUMN path TEXT"); } catch (e) {}

  /* 经济事项种子（RULE_FACTORS 此时尚未加载，走硬编码因子口径） */
  events.seedEvents(db);

  /* 会计科目主数据迁移 + 回填 subject_id（含旧平铺科目 level/path 补齐） */
  subjects.migrateSubjects(db);

  /* 4 级分类树 seed（account_subject 建 parent_id/level/path）+ 叶子经济事项挂载（economic_event.subject_id 挂叶子） */
  subjects.seedSubjectTree(db);
  events.seedEventLeaves(db);

  /* 预算规则版本化（D4）+ 加载 active 因子（驱动基线计算） */
  rules.migrateRuleVersions(db);
  rules.loadActiveFactors(db);

  /* AI 接入配置表（scope=ai_gateway），密钥加密存储 */
  aiConfig.initSystemConfig(db);

  return db;
}
