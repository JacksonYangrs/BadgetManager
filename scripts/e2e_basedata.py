#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B6 · 基础数据管理 E2E（Playwright）
覆盖：
  1. 管理员真实登录 → 顶部导航含「基础数据」
  2. 进入基础数据页 → 经济事项 / 会计科目 两 Tab 渲染 + 行数正确
  3. 会计科目 CRUD：新增 → 出现 → 删除（含被引用拦截由后端保证，此处验证可删）
  4. 经济事项 新增（关联科目）→ 出现
  5. 基层员工（staff）登录 → 导航不含「基础数据」；直链进入呈只读（无编辑按钮）
断言失败即抛异常，最终打印 PASS/FAIL 汇总。
"""
import sys, os, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8300/"
SHOTS = os.path.join(os.path.dirname(__file__), "e2e_shots")
os.makedirs(SHOTS, exist_ok=True)

results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)
    return cond

def settle(page):
    """等 toast 消失，避免遮挡模态按钮（toast z-index 高于 modal）"""
    try:
        page.wait_for_selector(".toast", state="detached", timeout=4000)
    except Exception:
        pass
    page.wait_for_timeout(150)

def login(page, username, password):
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector(".login-field input", timeout=8000)
    inputs = page.query_selector_all(".login-field input")
    inputs[0].fill(username)
    inputs[1].fill(password)
    page.click(".login-submit")
    page.wait_for_selector("#appRoot", state="visible", timeout=8000)
    page.wait_for_selector("#quicknav", timeout=8000)

def nav_has(page, label):
    btns = page.query_selector_all("#quicknav .qn-btn")
    return any((b.inner_text() or "").strip() == label for b in btns)

def open_basedata(page):
    btns = page.query_selector_all("#quicknav .qn-btn")
    for b in btns:
        if (b.inner_text() or "").strip() == "基础数据":
            b.click()
            break
    page.wait_for_selector(".bd-tabs", timeout=8000)
    page.wait_for_selector(".bd-table tbody tr", timeout=8000)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ---------- 管理员 ----------
        ctx = browser.new_context()
        page = ctx.new_page()
        page.on("pageerror", lambda e: print("PAGEERROR:", e))
        login(page, "admin", "Admin@2026")

        check("admin 导航含『基础数据』", nav_has(page, "基础数据"))

        open_basedata(page)
        check("基础数据页标题正确", "基础数据管理" in (page.query_selector(".page-title").inner_text() or ""))

        # 等经济事项数据加载完成（计数文案不再是“加载中”）
        page.wait_for_function("(() => { const e=document.querySelector('.bd-count'); return e && e.textContent.indexOf('加载中')<0; })()", timeout=8000)
        # 默认经济事项 Tab
        rows_events = page.query_selector_all(".bd-table tbody tr")
        check("经济事项表有数据行(>0)", len(rows_events) > 0)
        # 行数文案
        cnt_txt = page.query_selector(".bd-count").inner_text() or ""
        check("经济事项计数文案", "经济事项" in cnt_txt)
        if "经济事项" not in cnt_txt:
            print("  DEBUG cnt_txt =", repr(cnt_txt))

        # 切到会计科目
        tabs = page.query_selector_all(".bd-tab")
        for t in tabs:
            if (t.inner_text() or "").strip() == "会计科目":
                t.click(); break
        page.wait_for_function("(() => { const e=document.querySelector('.bd-count'); return e && e.textContent.indexOf('加载中')<0; })()", timeout=8000)
        rows_sub = page.query_selector_all(".bd-table tbody tr")
        check("会计科目表有数据行(>0)", len(rows_sub) > 0)
        sub_cnt = page.query_selector(".bd-count").inner_text() or ""
        check("会计科目计数文案", "会计科目" in sub_cnt)

        # ---- 会计科目 新增（唯一编码，保证可重复运行）----
        ts = str(int(time.time()))[-6:]
        sub_code = "E2E" + ts
        page.click("text=新增科目")
        page.wait_for_selector(".modal-mask #f_code", timeout=5000)
        page.fill("#f_code", sub_code)
        page.fill("#f_name", "E2E测试科目")
        page.fill("#f_center", "总办")
        page.click("#f_save")
        page.wait_for_timeout(600)
        settle(page)
        # 验证出现
        sub_rows = page.query_selector_all(".bd-table tbody tr")
        found = any(sub_code in (r.inner_text() or "") for r in sub_rows)
        check("新增科目后出现在列表", found)
        page.screenshot(path=os.path.join(SHOTS, "admin_subjects.png"))

        # ---- 会计科目 删除（先确保未被引用）----
        for r in page.query_selector_all(".bd-table tbody tr"):
            if sub_code in (r.inner_text() or ""):
                r.query_selector(".bd-del").click()
                break
        page.wait_for_selector(".modal-mask #bdYes", timeout=4000)
        settle(page)
        page.click("#bdYes")
        page.wait_for_timeout(700)
        sub_rows2 = page.query_selector_all(".bd-table tbody tr")
        del_ok = not any(sub_code in (r.inner_text() or "") for r in sub_rows2)
        check("删除科目后从列表消失", del_ok)

        # ---- 经济事项 新增（关联科目）----
        # 回到经济事项 tab
        for t in page.query_selector_all(".bd-tab"):
            if (t.inner_text() or "").strip() == "经济事项":
                t.click(); break
        page.wait_for_function("(() => { const e=document.querySelector('.bd-count'); return e && e.textContent.indexOf('加载中')<0; })()", timeout=8000)
        before = len(page.query_selector_all(".bd-table tbody tr"))
        page.click("text=新增经济事项")
        page.wait_for_selector(".modal-mask #e_cat", timeout=5000)
        ev_cat = "E2E事项" + ts
        page.fill("#e_cat", ev_cat)
        page.fill("#e_center", "总办")
        page.fill("#e_amount", "888000")
        # 关联第一个科目
        sel = page.query_selector("#e_sub")
        if sel and len(sel.query_selector_all("option")) > 1:
            sel.select_option(index=1)  # 跳过“未关联”
        page.click("#e_save")
        page.wait_for_timeout(700)
        after = len(page.query_selector_all(".bd-table tbody tr"))
        check("新增经济事项后行数+1", after == before + 1)
        if after != before + 1:
            print(f"  DEBUG before={before} after={after} count='{page.query_selector('.bd-count').inner_text() if page.query_selector('.bd-count') else ''}'")
        # 清理该测试事项
        for r in page.query_selector_all(".bd-table tbody tr"):
            if ev_cat in (r.inner_text() or ""):
                r.query_selector(".bd-del").click()
                break
        page.wait_for_selector(".modal-mask #bdYes", timeout=4000)
        page.click("#bdYes")
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(SHOTS, "admin_events.png"))
        ctx.close()

        # ---------- 基层员工（staff）----------
        ctx2 = browser.new_context()
        page2 = ctx2.new_page()
        page2.on("pageerror", lambda e: print("PAGEERROR(staff):", e))
        login(page2, "zhangwei", "Admin@2026")
        check("staff 导航不含『基础数据』", not nav_has(page2, "基础数据"))
        # 直链进入 → 应只读
        page2.goto(BASE + "#basedata", wait_until="networkidle")
        page2.wait_for_timeout(500)
        has_ro = page2.query_selector(".bd-readonly") is not None
        check("staff 直链进入呈只读提示", has_ro)
        # 无新增按钮
        no_add = page2.query_selector("text=新增科目") is None
        check("staff 无新增科目按钮", no_add)
        page2.screenshot(path=os.path.join(SHOTS, "staff_readonly.png"))
        ctx2.close()

        browser.close()

    failed = [n for n, ok in results if not ok]
    print("\n==== E2E 汇总 ====")
    print(f"总计 {len(results)} · 通过 {len(results)-len(failed)} · 失败 {len(failed)}")
    if failed:
        print("失败项:", failed)
        sys.exit(1)
    print("ALL_BD_E2E_PASS")

if __name__ == "__main__":
    main()
