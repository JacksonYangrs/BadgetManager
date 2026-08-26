/* ================================================================
 * import_module.js — 费控导入独立模块（M8 集成层）
 * 与 server.js 解耦：仅通过 buildImportModule(dbm).attach(app, db) 挂载路由。
 * 职责边界：
 *   - reconcile：解析导入行，按组织字典 + 科目字典做映射与校验（已落地）
 *   - commit：把校验通过的行写入执行跟踪（M8）；真实写入口径待「数据对齐」阶段确认
 * 前端（website/views/import-view.js）当前一期仍走本地 mock 解析，后续可改为调用本模块 API。
 * ================================================================ */
const { buildAuth } = require("../middleware/auth");

function buildImportModule(dbm) {
  /* 对账：映射 + 错误检测（确定性）。rows = [{company, dept, cat, event, amount, date, supplier, type, note}] */
  function reconcile(db, rows) {
    const subjects = dbm.listSubjects ? dbm.listSubjects(db) : [];
    const orgs = dbm.listOrgs ? dbm.listOrgs(db) : [];
    const subMap = {}; subjects.forEach((s) => { subMap[s.name] = s; });
    const orgMap = {}; orgs.forEach((o) => { orgMap[o.name] = o; });
    const result = { rows: [], matched: 0, errorCount: 0, totalAmount: 0 };
    (rows || []).forEach((r, idx) => {
      const dept = orgMap[r.dept];
      const cat = subMap[r.cat];
      const amount = parseFloat(r.amount);
      const errors = [];
      if (!dept) errors.push("部门「" + r.dept + "」不在组织字典");
      if (!cat) errors.push("科目「" + r.cat + "」不在科目字典");
      if (!(amount >= 0) || isNaN(amount)) errors.push("金额非法（" + r.amount + "）");
      const ok = errors.length === 0;
      if (ok) { result.matched++; result.totalAmount += amount; }
      else result.errorCount++;
      result.rows.push({
        idx: idx + 1, raw: r,
        deptId: dept ? dept.id : null,
        catId: cat ? cat.id : null,
        amount: isNaN(amount) ? 0 : amount,
        ok: ok, errors: errors,
      });
    });
    return result;
  }

  function attach(app, db) {
    const { auth, requireBaseDataEditor } = buildAuth(dbm, db);
    /* 校验：导入行 → 对账结果（前端可做二次确认） */
    app.post("/api/import/reconcile", auth, (req, res) => {
      const rows = (req.body && Array.isArray(req.body.rows)) ? req.body.rows : [];
      res.json(reconcile(db, rows));
    });

    /* 导入：校验通过后写入执行跟踪（M8）。
     * TODO（数据对齐）：确认口径后再落库——
     *   1) orgId/catId 映射是否走 code 而非 name；
     *   2) 年度额是否按 12 月均摊，或按导入行自带月份；
     *   3) 与企业真实费控系统的字段对齐（公司代码/供应商/类型）。
     * 当前仅返回校验结论，不写库，避免口径错误污染数据。 */
    app.post("/api/import/commit", auth, requireBaseDataEditor, (req, res) => {
      const rows = (req.body && Array.isArray(req.body.rows)) ? req.body.rows : [];
      const rc = reconcile(db, rows);
      if (rc.errorCount > 0) return res.status(400).json({ error: "存在 " + rc.errorCount + " 行错误，无法导入" });
      res.json({
        ok: true,
        matched: rc.matched,
        totalAmount: rc.totalAmount,
        note: "已校验通过，真实写入执行跟踪待数据对齐完成后启用（TODO）",
      });
    });
  }

  return { reconcile, attach };
}

module.exports = buildImportModule;
