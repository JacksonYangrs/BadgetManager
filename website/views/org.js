/* ================================================================
 * org.js — 组织架构视图（全员只读 · SVG 图形化，C4 2026-08-24）
 *   复用 orgchart.js 的只读渲染器（BM.renderOrgChartReadonly），
 *   保持全员可查看组织架构图（不渲染编辑控件，避免收进基础数据页后员工看不到）。
 * ================================================================ */

var BM = window.BM || {};

BM.renderOrg = function (container) {
  container.innerHTML = "";
  const page = document.createElement("div");
  page.className = "page";
  page.innerHTML = `<div class="page-head"><div><div class="page-title">组织架构</div>
    <div class="page-desc">集团 → 单位 → 部门三级组织图（全员只读 · 图形化展示）</div></div></div>`;
  const body = document.createElement("div");
  body.className = "org-body";
  body.innerHTML = `<div class="hint-text">组织架构加载中…</div>`;
  page.appendChild(body);
  container.appendChild(page);

  BM.apiGet("/api/orgs/tree")
    .then((tree) => {
      body.innerHTML = "";
      if (!Array.isArray(tree) || !tree.length) {
        body.innerHTML = `<div class="hint-text">未获取到组织数据（请确认后端服务已启动）</div>`;
        return;
      }
      BM.renderOrgChartReadonly(body, tree);
    })
    .catch(() => {
      body.innerHTML = `<div class="hint-text">组织数据加载失败（离线模式 / 后端未启动）</div>`;
    });
};

window.BM = BM;
