/* ================================================================
 * orgchart.js — SVG 组织架构图渲染器（C2，2026-08-24）
 *   输入：嵌套树（来自 GET /api/orgs/tree）：[{id,code,name,level,users,children}]
 *   输出：自上而下的方框层级图（方框 + 肘形连线）。
 *   两种模式：
 *     · 编辑模式  editable=true → 节点可点击(onNodeClick)、顶部有「＋新增组织」(onAdd)
 *     · 只读模式  editable=false → 仅展示（供全员查看页复用）
 * ================================================================ */
var BM = window.BM || {};

function ocEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function ocTrunc(s, n) {
  s = String(s == null ? "" : s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const OC_LEVEL_LABEL = { group: "集团", company: "单位", dept: "部门" };

/* 布局：给每个节点分配 x（叶子槽位）与 y（深度） */
function ocBuildLayout(tree) {
  const nodes = [];
  let leaf = 0;
  let maxDepth = 0;
  (function visit(list, depth) {
    list.forEach((n) => {
      if (n.children && n.children.length) {
        visit(n.children, depth + 1);
        n._x = (n.children[0]._x + n.children[n.children.length - 1]._x) / 2;
      } else {
        n._x = leaf++;
      }
      n._y = depth;
      if (depth > maxDepth) maxDepth = depth;
      nodes.push(n);
    });
  })(tree, 0);
  return { nodes, leafCount: leaf, maxDepth };
}

BM.renderOrgChart = function (container, tree, opts) {
  opts = opts || {};
  const editable = !!opts.editable;
  container.innerHTML = "";

  const layout = ocBuildLayout(tree || []);
  const BW = 200, BH = 56, HGAP = 26, VGAP = 72, MX = 24, MY = 24;
  const slotX = (m) => MX + m * (BW + HGAP) + BW / 2;
  const yOf = (d) => MY + d * (BH + VGAP);
  const idMap = {};
  layout.nodes.forEach((n) => (idMap[n.id] = n));

  const W = MX * 2 + Math.max(1, layout.leafCount) * (BW + HGAP) - HGAP;
  const H = MY * 2 + (layout.maxDepth + 1) * (BH + VGAP);

  /* 连线 */
  let paths = "";
  layout.nodes.forEach((n) => {
    if (n.children && n.children.length) {
      const sx = slotX(n._x), sy = yOf(n._y) + BH;
      n.children.forEach((c) => {
        const cx = slotX(c._x), cy = yOf(c._y);
        const midY = (sy + cy) / 2;
        paths += `<path class="oc-link" d="M${sx},${sy} V${midY} H${cx} V${cy}"/>`;
      });
    }
  });

  /* 方框 */
  let boxes = "";
  layout.nodes.forEach((n) => {
    const left = slotX(n._x) - BW / 2;
    const top = yOf(n._y);
    const cx = slotX(n._x);
    const badge = OC_LEVEL_LABEL[n.level] || n.level || "";
    const typeCls = (n.type === "center" ? "center" : n.type === "group" ? "group" : n.type === "dept" ? "dept" : "unit");
    boxes += `<g class="oc-node oc-type-${typeCls}" data-id="${n.id}">
      <rect class="oc-box" x="${left}" y="${top}" width="${BW}" height="${BH}" rx="7"/>
      <rect class="oc-badge" x="${left}" y="${top}" width="6" height="${BH}" rx="3"/>
      <text class="oc-name" x="${cx}" y="${top + 24}" text-anchor="middle">${ocEsc(ocTrunc(n.name, 14))}</text>
      <text class="oc-code" x="${cx}" y="${top + 44}" text-anchor="middle">${ocEsc(ocTrunc(n.code, 18))}</text>
      ${badge ? `<text class="oc-badge-t" x="${left + 14}" y="${top + 18}" text-anchor="middle">${ocEsc(badge)}</text>` : ""}
    </g>`;
  });

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("class", "oc-svg");
  svg.innerHTML = paths + boxes;
  container.appendChild(svg);

  /* 编辑模式：节点点击 + 顶部新增按钮 */
  if (editable) {
    const bar = document.createElement("div");
    bar.className = "oc-toolbar";
    bar.innerHTML = `<button class="btn btn-primary btn-sm" id="ocAdd">＋ 新增组织</button>
      <span class="oc-hint">点击节点可改名 / 调整隶属 / 删除</span>`;
    container.insertBefore(bar, svg);
    bar.querySelector("#ocAdd").addEventListener("click", () => opts.onAdd && opts.onAdd());
    layout.nodes.forEach((n) => {
      const g = svg.querySelector(`.oc-node[data-id="${n.id}"]`);
      if (g) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => opts.onNodeClick && opts.onNodeClick(n));
      }
    });
  }
};

/* 只读封装（供独立组织架构页） */
BM.renderOrgChartReadonly = function (container, tree) {
  BM.renderOrgChart(container, tree, { editable: false });
};

window.BM = BM;
