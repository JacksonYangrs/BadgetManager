/* ================================================================
 * role-hint.js — 角色说明条（共享内核，供所有页面复用）
 * 从 views/projects.js 抽出：原本寄生在领域视图里，违反「共享内核显式化」原则。
 * 现独立为 core 共享模块，所有视图通过 BM.renderRoleHint 复用。
 * ================================================================ */

var BM = window.BM || {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* 角色说明条（供所有页面复用） */
BM.renderRoleHint = function (container, viewKey) {
  const hints = (BM.ROLE_HINTS[viewKey] || {})[BM.state.role];
  if (!hints) return;
  const bar = el("div", "role-hint-bar");
  bar.innerHTML = `<span class="rhb-ico">▍</span>${esc(hints)}`;
  container.appendChild(bar);
};

window.BM = BM;
