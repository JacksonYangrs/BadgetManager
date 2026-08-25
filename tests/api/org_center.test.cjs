/* ================================================================
 * org_center.test.cjs — 预算工作人员与归口关系 (D2/D5) 后端 API 回归
 * 不删真实数据：仅在末尾清理本次创建的临时组织。
 *  覆盖：11 管理中心种子、type 字段、设 managedCenterId、中心删除守卫、类型校验。
 * ================================================================ */
const BASE = "http://localhost:8300";
const PW = "Admin@2026";
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }
async function login(u) {
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: PW }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || "login fail"); return d.token;
}
async function call(tok, method, path, body) {
  const headers = { "Content-Type": "application/json" }; if (tok) headers["Authorization"] = "Bearer " + tok;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
const ok2 = (s) => s === 200 || s === 201;

(async () => {
  console.log("=== 归口关系 API 回归 (D2/D5) ===");
  let adminTok; let created = [];
  try { adminTok = await login("admin"); ok(!!adminTok, "admin 登录"); }
  catch (e) { ok(false, "admin 登录: " + e.message); return finish(); }

  // 1) 11 管理中心已种子
  {
    const r = await call(adminTok, "GET", "/api/orgs/tree");
    const all = [];
    (function walk(ns) { (ns || []).forEach((n) => { all.push(n); walk(n.children); }); })(r.data || []);
    const centers = all.filter((n) => n.type === "center");
    ok(centers.length === 11, `11 管理中心已存在 (实际 ${centers.length})`);
    ok(centers.every((c) => c.managedCenterId == null), "管理中心自身 managedCenterId 为 null");
    global.__centers = centers;
  }
  const centers = global.__centers || [];

  // 2) 建临时单位并挂靠某管理中心
  let tempId = null;
  if (centers.length) {
    const r = await call(adminTok, "POST", "/api/orgs", { code: "TEMP_D5", name: "D5临时单位", parentId: 1, type: "unit", managedCenterId: centers[0].id });
    ok(ok2(r.status) && r.data && r.data.id, `建临时单位 + 挂管理中心 → 201 (id=${r.data && r.data.id})`);
    if (r.data) { tempId = r.data.id; created.push(tempId);
      ok(r.data.type === "unit" && r.data.managedCenterId === centers[0].id, `返回 type=unit 且 managedCenterId 生效`);
    }
  }

  // 3) 中心删除守卫：删除挂着部门的中心被拦
  if (centers.length && tempId) {
    const r = await call(adminTok, "DELETE", "/api/orgs/" + centers[0].id);
    ok(r.status === 400, `删挂着部门的中心 → 400 被拦截 (实际 ${r.status})`);
    ok(!!(r.data && (r.data.error || "").includes("归口")), `提示含「归口」 (msg=${(r.data && r.data.error) || ""})`);
  }

  // 4) 类型校验：挂非 center 节点报错
  {
    const nonCenter = await call(adminTok, "GET", "/api/orgs/tree");
    const all = [];
    (function walk(ns) { (ns || []).forEach((n) => { all.push(n); walk(n.children); }); })(nonCenter.data || []);
    const units = all.filter((n) => n.type === "unit" && n.id !== tempId);
    if (units.length) {
      const r = await call(adminTok, "PUT", "/api/orgs/" + tempId, { name: "D5临时单位", parentId: 1, type: "unit", managedCenterId: units[0].id });
      ok(r.status === 400, `managedCenterId 指向非 center → 400 (实际 ${r.status})`);
    }
  }

  // 5) 解除归口后可删中心（反向验证守卫正确）
  if (tempId) {
    const r = await call(adminTok, "PUT", "/api/orgs/" + tempId, { name: "D5临时单位", parentId: 1, type: "unit", managedCenterId: null });
    ok(r.status === 200 && r.data.managedCenterId == null, `解除归口 → 200`);
  }

  // 6) 清理临时单位
  if (tempId) { const r = await call(adminTok, "DELETE", "/api/orgs/" + tempId); ok(r.status === 200, `清理 临时单位 → 200`); }

  finish();
})();
function finish() { console.log(`\n=== 结果：通过 ${pass} · 失败 ${fail} ===`); process.exit(fail ? 1 : 0); }
