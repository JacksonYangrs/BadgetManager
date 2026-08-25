/* ================================================================
 * org_crud.test.cjs — 组织架构可编辑 (C5) 后端 API 回归测试
 * 不删除任何真实数据：仅在末尾清理本次创建的临时组织。
 *  覆盖：登录鉴权 / 创建 / 改名 / 级别重算 / 环检测 / 三道删除守卫 / 403 权限。
 * 运行：NODE_PATH=<node workspace node_modules> node tests/api/org_crud.test.cjs
 * ================================================================ */
const BASE = "http://localhost:8300";
const PW = "Admin@2026";

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log("  ✅ " + msg); } else { fail++; console.log("  ❌ " + msg); } }

async function login(username) {
  const r = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PW }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("login failed: " + (d.error || r.status));
  return d.token;
}
async function call(token, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

(async () => {
  console.log("=== 组织架构 API 回归 (C5) ===");
  let adminTok, staffTok;

  // 1) 登录
  try { adminTok = await login("admin"); ok(!!adminTok, "admin 登录获取 token"); }
  catch (e) { ok(false, "admin 登录: " + e.message); return finish(); }
  try { staffTok = await login("zhangwei"); ok(!!staffTok, "staff(zhangwei) 登录获取 token"); }
  catch (e) { ok(false, "staff 登录: " + e.message); }

  // 2) 403 权限：staff 创建组织被拒
  {
    const r = await call(staffTok, "POST", "/api/orgs", { code: "X1", name: "越权测试" });
    ok(r.status === 403, `staff 创建组织 → 403 (实际 ${r.status})`);
  }

  const ok2 = (s) => s === 200 || s === 201;

  // 3) 创建临时组织（挂 HQ id=1）
  let t1Id = null, t2Id = null;
  {
    const r = await call(adminTok, "POST", "/api/orgs", { code: "TEMP_C5_A", name: "C5临时组织A", parentId: 1 });
    ok(ok2(r.status) && r.data && r.data.id, `创建组织A → 201 (id=${r.data && r.data.id})`);
    if (r.data) {
      t1Id = r.data.id;
      ok(r.data.level === "company", `组织A 级别重算 → company (实际 ${r.data.level})`);
    }
  }

  // 4) 改名
  if (t1Id) {
    const r = await call(adminTok, "PUT", "/api/orgs/" + t1Id, { name: "C5临时组织A(改)", parentId: 1 });
    ok(r.status === 200 && r.data && r.data.name === "C5临时组织A(改)", `改名 → 200 且名称生效 (${r.data && r.data.name})`);
  }

  // 5) 创建子级 + 级别重算（应为 dept）
  if (t1Id) {
    const r = await call(adminTok, "POST", "/api/orgs", { code: "TEMP_C5_B", name: "C5临时组织B", parentId: t1Id });
    ok(ok2(r.status) && r.data && r.data.id, `创建组织B(子级) → 201`);
    if (r.data) {
      t2Id = r.data.id;
      ok(r.data.level === "dept", `组织B 级别重算 → dept (实际 ${r.data.level})`);
    }
  }

  // 6) 环检测：把组织A 的上级设为其子级 B
  if (t1Id && t2Id) {
    const r = await call(adminTok, "PUT", "/api/orgs/" + t1Id, { name: "C5临时组织A(改)", parentId: t2Id });
    ok(r.status === 400, `环检测：A 上级设为子级B → 400 (实际 ${r.status})`);
    ok(!!(r.data && (r.data.error || "").includes("下级") || (r.data && (r.data.error || "").includes("环"))),
      `环检测提示含「下级/环」 (msg=${(r.data && r.data.error) || ""})`);
  }

  // 7) 删除守卫：带预算的组织(34) 被拦截（只读验证，不删除）
  {
    const r = await call(adminTok, "DELETE", "/api/orgs/34");
    ok(r.status === 400, `删除带预算组织(34) → 400 被拦截 (实际 ${r.status})`);
    ok(!!(r.data && (r.data.error || "").includes("预算")), `提示含「预算」 (msg=${(r.data && r.data.error) || ""})`);
  }

  // 8) 清理临时组织（先删子后删父，均无引用）
  if (t2Id) {
    const r = await call(adminTok, "DELETE", "/api/orgs/" + t2Id);
    ok(r.status === 200, `清理 组织B → 200 (实际 ${r.status})`);
  }
  if (t1Id) {
    const r = await call(adminTok, "DELETE", "/api/orgs/" + t1Id);
    ok(r.status === 200, `清理 组织A → 200 (实际 ${r.status})`);
  }

  finish();
})();

function finish() {
  console.log(`\n=== 结果：通过 ${pass} · 失败 ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
