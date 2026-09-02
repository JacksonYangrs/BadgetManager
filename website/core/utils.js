/* ================================================================
 * utils.js — 前端共享工具内核（唯一工具模块）
 * 职责：DOM 创建 el / HTML 转义 esc / 金额格式化 money · fmtMoney。
 * 原则：纯函数、无状态、无网络；先于 state.js / role-hint.js / 所有 view 加载。
 * 提供两类入口：全局函数（兼容既有裸调用）与 BM 命名空间（显式引用）。
 * ================================================================ */

var BM = window.BM || {};

/* DOM 元素创建：el(tag, cls, html) */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/* HTML 转义：完整转义 & < > " '（先 & 后 < > " '），null/undefined → 空串 */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* 金额缩写：≥1 亿 → 亿；≥1 万 → 万；否则原样 */
function money(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + " 亿";
  if (n >= 10000) return (n / 10000).toFixed(1) + " 万";
  return String(n);
}

/* 带货币符号的金额 */
function fmtMoney(n) {
  return "¥" + money(n);
}

/* 挂载到 BM 命名空间（显式引用入口） */
BM.el = el;
BM.esc = esc;
BM.money = money;
BM.fmtMoney = fmtMoney;

window.BM = BM;
