/** organization module (auto-extracted from db.js) */


const ORG_SEEDS = [
  { id: 1, code: "HQ",   name: "总部（上级部门）", parent_id: null },
  { id: 2, code: "2010", name: "一公司（2010）", parent_id: 1 },
  { id: 3, code: "2020", name: "二公司（2020）", parent_id: 1 },
  { id: 4, code: "2170", name: "三公司（2170）", parent_id: 1 },
  { id: 5, code: "3050", name: "四公司（3050）", parent_id: 1 },
];
/* 单位规模系数：模拟不同体量单位各自填报的结果 */

const UNIT_FACTOR = { "2010": 1.0, "2020": 0.9, "2170": 0.75, "3050": 0.65 };

function initUnits(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS organization (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT,
    parent_id INTEGER,
    level TEXT
  );
  CREATE TABLE IF NOT EXISTS unit_budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL,
    cat TEXT NOT NULL,
    acct_code TEXT,
    amount INTEGER NOT NULL DEFAULT 0,
    monthly TEXT,
    last_budget INTEGER,
    last_year INTEGER,
    method TEXT,
    ai TEXT,
    reduce_ratio REAL,
    reduce_amount INTEGER,
    note TEXT,
    UNIQUE(org_id, cat)
  );`);
  /* 组织 / 单位预算数据由 scripts/import_excel_data.py 全量导入（真实客户主数据）。
   * 此处仅做最小兜底：organization 无 HQ 时插入总部节点，避免 user/org 引用悬空。 */
  if (!db.prepare("SELECT id FROM organization WHERE code = 'HQ'").get()) {
    db.prepare("INSERT INTO organization (id, code, name, parent_id, level) VALUES (1, 'HQ', '总部（上级部门）', NULL, 'group')").run();
  }
  /* 公司→事业部(BU) 归属字段（2026-08-25 看板真实数据 A+B）：可在基础数据→组织结构编辑 */
  try { db.exec("ALTER TABLE organization ADD COLUMN bu_code TEXT"); } catch (e) {}
}

function listOrgs(db) {
  return db.prepare("SELECT id, code, name, parent_id, level FROM organization ORDER BY id").all();
}

/* 上级部门的下级单位（组织结构自动确定：parent_id = HQ） */

function listChildUnits(db, parentCode) {
  const p = db.prepare("SELECT id FROM organization WHERE code = ?").get(parentCode || "HQ");
  if (!p) return [];
  return db.prepare("SELECT id, code, name FROM organization WHERE parent_id = ? ORDER BY id").all(p.id);
}

/* ---------- 组织结构 可编辑 CRUD（2026-08-24 C1 / D2） ---------- */

function getOrg(db, id) {
  return db.prepare("SELECT id, code, name, parent_id, level, type, managed_center_id AS managedCenterId, bu_code AS buCode FROM organization WHERE id = ?").get(id) || null;
}

/* 公司→事业部(BU) 映射推断（初始值，可在基础数据→组织结构编辑纠偏）
 * 规则：按公司编码段/名称关键词归到 17 个 BU 之一；命中不到归 null（手动补）。 */

const BU_CODES = ["BU-00","BU-01","BU-02","BU-03","BU-05","BU-06","BU-08","BU-09","BU-10","BU-11","BU-12","BU-13","BU-15","BU-16","BU-17","BU-97"];

function inferBuCode(code, name) {
  const c = String(code || "");
  const n = String(name || "");
  // 海外/香港系（朗明纳斯/Luminus/WIPAC/威派克/香港三安）→ BU-16 香港三安
  if (/Luminus|朗明纳斯|WIPAC|威派克|香港三安|Hunan San/.test(n) || /^2060|^2070|^2080|^2090|^2120|^5070|^5080|^71/.test(c)) return "BU-16";
  if (/^10/.test(c)) return "BU-00";            // 股份总部 1000
  if (/^20/.test(c)) {                            // 20xx 系列：光电/半导体传统线
    if (/集成|集成电路|IC|领翔/.test(n)) return "BU-10"; // LDI/集成电路
    if (/气体/.test(n)) return "BU-03";          // 特种应用（气体）
    if (/半导体/.test(n)) return "BU-01";        // 氮化镓/半导体
    return "BU-01";
  }
  if (/^21/.test(c) || /^22/.test(c)) {           // 光通讯
    if (/光通讯|光电子|信息通讯|先进/.test(n)) return "BU-09";
    return "BU-09";
  }
  if (/^30/.test(c)) {                            // 30xx 系列：集成电路/半导体基地
    if (/集成|半导体|泉州|湖南/.test(n)) return "BU-10";
    if (/北电|新材料/.test(n)) return "BU-06";   // 电力电子（化合物半导体材料）
    return "BU-10";
  }
  if (/^31/.test(c) || /^32/.test(c)) {           // 湖南/重庆半导体
    if (/重庆/.test(n)) return "BU-06";
    return "BU-01";
  }
  if (/^50/.test(c)) {                            // 安瑞光电（车灯/光电）
    if (/香港灯条|灯条/.test(n)) return "BU-97";
    return "BU-08";                               // 安瑞
  }
  if (/^90/.test(c)) return "BU-13";              // 泉州三安公共部门/安徽三首
  return null;
}

/* 幂等填充 bu_code：仅当 organization.bu_code 全为空时推断写入（不覆盖手动编辑值） */

function seedBuCodes(db) {
  const filled = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE bu_code IS NOT NULL AND bu_code != ''").get().c;
  if (filled > 0) return filled;
  const rows = db.prepare("SELECT id, code, name FROM organization WHERE type IN ('unit','company','dept')").all();
  const upd = db.prepare("UPDATE organization SET bu_code = ? WHERE id = ?");
  let n = 0;
  rows.forEach((r) => {
    const bu = inferBuCode(r.code, r.name);
    if (bu) { upd.run(bu, r.id); n++; }
  });
  return n;
}

/* 环检测：ancestorId 是否为 nodeId 的祖先（含自身） */

function isOrgAncestor(db, ancestorId, nodeId) {
  const seen = new Set();
  let cur = getOrg(db, nodeId);
  while (cur && cur.parent_id != null) {
    if (seen.has(cur.id)) break; // 环保护
    seen.add(cur.id);
    if (cur.parent_id === ancestorId) return true;
    cur = getOrg(db, cur.parent_id);
  }
  return false;
}

/* 按 parent_id 从根重算全部组织 level：深度 0=group,1=company,>=2=dept */

function recomputeOrgLevels(db) {
  const all = db.prepare("SELECT id, parent_id FROM organization").all();
  const byId = {};
  all.forEach((o) => (byId[o.id] = o));
  const depthOf = (id, seen) => {
    const o = byId[id];
    if (!o || o.parent_id == null) return 0;
    if (seen.has(id)) return 0; // 环保护
    seen.add(id);
    return 1 + depthOf(o.parent_id, seen);
  };
  const upd = db.prepare("UPDATE organization SET level = ? WHERE id = ?");
  all.forEach((o) => {
    const d = depthOf(o.id, new Set());
    upd.run(d === 0 ? "group" : d === 1 ? "company" : "dept", o.id);
  });
}

/* 校验 managedCenterId：必须指向 type='center' 的节点（且非自身） */

function resolveManagedCenter(db, managedCenterId, selfId) {
  if (managedCenterId == null) return { id: null };
  const mc = Number(managedCenterId);
  const node = getOrg(db, mc);
  if (!node) return { error: "归属管理中心不存在" };
  if (node.type !== "center") return { error: "归属对象必须是管理中心（type=center）" };
  if (selfId != null && node.id === selfId) return { error: "不能将自身设为归属管理中心" };
  return { id: mc };
}

function createOrg(db, body) {
  const code = String(body.code || "").trim();
  if (!code) return { error: "组织编码不能为空" };
  if (db.prepare("SELECT id FROM organization WHERE code = ?").get(code)) return { error: "组织编码已存在" };
  let parentId = body.parentId != null ? Number(body.parentId) : null;
  if (parentId != null && !getOrg(db, parentId)) return { error: "上级组织不存在" };
  const type = body.type && ["group", "unit", "dept", "center"].includes(body.type) ? body.type : "unit";
  const mc = resolveManagedCenter(db, body.managedCenterId, null);
  if (mc.error) return mc;
  const name = String(body.name || code).trim();
  const buCode = body.buCode != null ? String(body.buCode || "").trim() || null : null;
  db.prepare("INSERT INTO organization (code, name, parent_id, level, type, managed_center_id, bu_code) VALUES (?, ?, ?, 'company', ?, ?, ?)")
    .run(code, name, parentId, type, mc.id, buCode);
  const id = db.prepare("SELECT last_insert_rowid() AS id").get().id;
  recomputeOrgLevels(db);
  return getOrg(db, id);
}

function updateOrg(db, id, body) {
  const cur = getOrg(db, id);
  if (!cur) return null;
  const name = body.name != null ? String(body.name).trim() : cur.name;
  let parentId = body.parentId !== undefined ? (body.parentId != null ? Number(body.parentId) : null) : cur.parent_id;
  if (parentId != null) {
    if (parentId === id) return { error: "上级组织不能是自身" };
    if (isOrgAncestor(db, id, parentId)) return { error: "不能挂到自身下级之下（会形成环）" };
    if (!getOrg(db, parentId)) return { error: "上级组织不存在" };
  }
  const type = body.type && ["group", "unit", "dept", "center"].includes(body.type) ? body.type : cur.type;
  let managedCenterId = cur.managedCenterId;
  if (body.managedCenterId !== undefined) {
    const mc = resolveManagedCenter(db, body.managedCenterId, id);
    if (mc.error) return mc;
    managedCenterId = mc.id;
  }
  let buCode = cur.buCode;
  if (body.buCode !== undefined) buCode = body.buCode != null ? String(body.buCode || "").trim() || null : null;
  db.prepare("UPDATE organization SET name = ?, parent_id = ?, type = ?, managed_center_id = ?, bu_code = ? WHERE id = ?")
    .run(name, parentId, type, managedCenterId, buCode, id);
  recomputeOrgLevels(db);
  return getOrg(db, id);
}

function deleteOrg(db, id) {
  const cur = getOrg(db, id);
  if (!cur) return { error: "未找到组织" };
  const child = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE parent_id = ?").get(id);
  if (child && child.c > 0) return { error: "该组织下仍有 " + child.c + " 个子组织，无法删除（请先迁移或删除子组织）" };
  const ub = db.prepare("SELECT COUNT(*) AS c FROM unit_budget WHERE org_id = ?").get(id);
  if (ub && ub.c > 0) return { error: "该组织下仍有 " + ub.c + " 条单位预算数据，无法删除（预算不允许悬空）" };
  const us = db.prepare("SELECT COUNT(*) AS c FROM user WHERE org_id = ?").get(id);
  if (us && us.c > 0) return { error: "该组织下仍有 " + us.c + " 名人员，无法删除（请先调整人员归属）" };
  const dep = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE managed_center_id = ?").get(id);
  if (dep && dep.c > 0) return { error: "该管理中心下仍有 " + dep.c + " 个部门/单位归口，无法删除（请先调整归口关系）" };
  db.prepare("DELETE FROM organization WHERE id = ?").run(id);
  return { ok: true, id };
}

const MANAGE_CENTERS = [
  { code: "MC-01", name: "职能中心" },
  { code: "MC-02", name: "行政服务中心" },
  { code: "MC-03", name: "生产管理中心" },
  { code: "MC-04", name: "设备动力中心" },
  { code: "MC-05", name: "质量管控中心" },
  { code: "MC-06", name: "技术研发中心" },
  { code: "MC-07", name: "供应链中心" },
  { code: "MC-08", name: "市场营销中心" },
  { code: "MC-09", name: "财务共享中心" },
  { code: "MC-10", name: "人力资源中心" },
  { code: "MC-11", name: "信息化中心" },
];

function migrateOrgTypeAndCenters(db) {
  const cols = db.prepare("PRAGMA table_info(organization)").all().map((c) => c.name);
  if (!cols.includes("type")) db.exec("ALTER TABLE organization ADD COLUMN type TEXT");
  if (!cols.includes("managed_center_id")) db.exec("ALTER TABLE organization ADD COLUMN managed_center_id INTEGER");

  /* 回填 type（幂等）：company→unit，dept→dept，group→group */
  db.prepare("UPDATE organization SET type = 'unit' WHERE level = 'company' AND (type IS NULL OR type = '')").run();
  db.prepare("UPDATE organization SET type = 'dept' WHERE level = 'dept' AND (type IS NULL OR type = '')").run();
  db.prepare("UPDATE organization SET type = 'group' WHERE level = 'group' AND (type IS NULL OR type = '')").run();

  /* 种子 11 管理中心（挂 HQ 下，type='center'），幂等 */
  const hq = db.prepare("SELECT id FROM organization WHERE code = 'HQ'").get();
  if (hq) {
    const exists = db.prepare("SELECT COUNT(*) AS c FROM organization WHERE type = 'center'").get().c;
    if (exists === 0) {
      const ins = db.prepare("INSERT INTO organization (code, name, parent_id, level, type) VALUES (?, ?, ?, 'company', 'center')");
      MANAGE_CENTERS.forEach((c) => ins.run(c.code, c.name, hq.id));
      console.log("[migrate] 插入 11 个管理中心节点");
    }
    recomputeOrgLevels(db);
  }
}

/* ---------- 认证 ---------- */

function buildOrgTree(db) {
  const all = db.prepare("SELECT id, code, name, parent_id, level, type, managed_center_id AS managedCenterId, bu_code AS buCode FROM organization ORDER BY id").all();
  const map = {};
  all.forEach((o) => (map[o.id] = Object.assign({}, o, { children: [] })));
  const roots = [];
  all.forEach((o) => {
    if (o.parent_id && map[o.parent_id]) map[o.parent_id].children.push(map[o.id]);
    else roots.push(map[o.id]);
  });
  return roots;
}

/* 某组织节点下的人员（含角色） */

module.exports = {
  BU_CODES,
  MANAGE_CENTERS,
  ORG_SEEDS,
  UNIT_FACTOR,
  buildOrgTree,
  createOrg,
  deleteOrg,
  getOrg,
  inferBuCode,
  initUnits,
  isOrgAncestor,
  listChildUnits,
  listOrgs,
  migrateOrgTypeAndCenters,
  recomputeOrgLevels,
  resolveManagedCenter,
  seedBuCodes,
  updateOrg,
};
