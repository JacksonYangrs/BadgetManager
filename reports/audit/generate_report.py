import base64
import json
from pathlib import Path

ROOT = Path('/Users/yangjackson/AIProjects/BadgetManager/reports/audit')
ASSETS = ROOT / 'assets'

def b64(path):
    data = path.read_bytes()
    mime = 'image/png' if path.suffix == '.png' else 'image/svg+xml'
    return f'data:{mime};base64,' + base64.b64encode(data).decode()

# Load captured data
cap = json.loads((ROOT / 'capture.json').read_text())

logo_b64 = b64(Path('/Users/yangjackson/Downloads/sanan.png'))
login_desktop_b64 = b64(ASSETS / 'login-desktop.png')
app_desktop_b64 = b64(ASSETS / 'app-desktop.png')
login_mobile_b64 = b64(ASSETS / 'login-mobile.png')
app_mobile_b64 = b64(ASSETS / 'app-mobile.png')

scores = {
    'brand-expression': 45,
    'visual-hierarchy-craft': 62,
    'conversion-focus': 55,
    'accessibility': 70,
    'technical-seo': 35,
    'content-llm-visibility': 25,
    'performance': 75,
}
weights = {
    'brand-expression': 0.15,
    'visual-hierarchy-craft': 0.15,
    'conversion-focus': 0.10,
    'accessibility': 0.10,
    'technical-seo': 0.15,
    'content-llm-visibility': 0.15,
    'performance': 0.20,
}
overall = round(sum(scores[k] * weights[k] for k in scores))

findings = [
    {
        'severity': 'P1',
        'dimension': 'brand-expression',
        'evidence': 'logo sanan.png 主色 #003CB4；site CSS --c-primary #1E2A4A，brand-mark 为通用柱状图 SVG，无 Sanan 图形/文字标识',
        'impact': '访问者无法将界面与 Sanan / 三安制造品牌建立关联，信任感与品牌一致性受损',
        'fix': '以 logo 蓝 (#003CB4) 替换当前深蓝主色；在登录页与顶栏置入 Sanan 图形标识+"三安制造"文字标；删除/弱化金色，仅作为状态点缀',
    },
    {
        'severity': 'P1',
        'dimension': 'content-llm-visibility / technical-seo',
        'evidence': 'capture.json: loginMeta/appMeta h1s=[], h2s=[], h3s=[]；页面内容通过 JS 渲染',
        'impact': '搜索引擎与 AI 摘要几乎无法识别页面主题、角色与价值主张，自然流量与 AI 推荐为零',
        'fix': '为登录页/落地页补充语义化 h1/h2；增加一段静态价值主张文本；对关键视图做预渲染或 SSR',
    },
    {
        'severity': 'P1',
        'dimension': 'technical-seo / content-llm-visibility',
        'evidence': 'curl 探测：/robots.txt、/sitemap.xml、/llms.txt 均返回 404；HTML 无 canonical、无 JSON-LD、无 OG',
        'impact': '站点对爬虫不可索引、对 LLM 不可引用，Demo 无法被外部发现',
        'fix': '添加 robots.txt 允许抓取、sitemap.xml、canonical 自引用、Organization/Product JSON-LD、llms.txt；补充 OG 标签',
    },
    {
        'severity': 'P2',
        'dimension': 'conversion-focus',
        'evidence': 'appMeta.navLabels: 工作台首页/预算编制/预算跟踪/预算规划/预算工作人员/基础数据；copilot suggestions: "我负责的项目还剩多少预算？" 等；CTA 标签体系不一致',
        'impact': '用户在不同入口看到不同词汇，增加认知负荷，降低 AI Copilot 采纳率',
        'fix': '统一导航与 Copilot 快捷问题的术语；将问句改为动作按钮文案（如"查看剩余预算"）',
    },
    {
        'severity': 'P2',
        'dimension': 'visual-hierarchy-craft',
        'evidence': 'app-mobile.png 顶栏标题截断、导航未做响应式折叠',
        'impact': '移动端首屏信息丢失，关键导航被隐藏或拥挤',
        'fix': '移动端将长标题缩写为"三安 AI 费控"，导航收进抽屉菜单；为信息卡片增加视觉分组与图标色区分',
    },
    {
        'severity': 'P2',
        'dimension': 'accessibility',
        'evidence': 'CSS --c-text-3: #9098AB 在 #FFFFFF 上对比度 2.89:1（< 4.5:1），用于时间戳/提示小字',
        'impact': '低视力用户难以阅读辅助说明文字',
        'fix': '将次要文字色加深至 #6B7280 或更大字号，确保小字对比度 ≥ 4.5:1',
    },
    {
        'severity': 'P2',
        'dimension': 'technical-seo',
        'evidence': 'HEAD 探测无 og:title/og:image；无 canonical',
        'impact': '社交分享与搜索引擎结果缺少吸引力片段，权重分散',
        'fix': '补全 og:title、og:description、og:image、twitter:card；添加 <link rel="canonical">',
    },
    {
        'severity': 'P3',
        'dimension': 'brand-expression',
        'evidence': 'theme-color meta 为 #1e2a4a，与 logo 蓝不一致',
        'impact': '浏览器/ PWA 标题栏颜色与品牌主色脱节',
        'fix': 'theme-color 改为 #003CB4，与 Sanan 品牌一致',
    },
]

redesign = [
    {
        'id': 'A',
        'name': 'Faithful + Fixes（品牌校准）',
        'what': '保留现有功能布局与信息架构，将视觉系统全面迁移到 Sanan 品牌色。',
        'changes': [
            '主色：#003CB4（logo 蓝）替代 #1E2A4A；深色背景仅在需要时使用 #002A7E',
            '登录页与顶栏使用 Sanan 图形标 + "三安制造" 文字标',
            '金色仅保留为成功/高亮状态色，降低视觉噪音',
            '补充 h1/h2 语义、静态价值主张、robots/sitemap/JSON-LD/llms.txt',
        ],
        'solves': ['P1 品牌断裂', 'P1 无语义标题', 'P1 SEO/LLM 不可见', 'P3 theme-color'],
    },
    {
        'id': 'B',
        'name': 'Amplify "Precision"（精准感放大）',
        'what': '将 logo 中 C 形弧线提炼为"精准仪表盘"视觉母题，强化 AI 费控的可靠感。',
        'changes': [
            '顶栏/仪表盘使用 C 弧线进度环与动态数据卡片',
            '保留蓝白基调，关键数字使用大字号 tabular-nums',
            'Copilot 面板使用品牌弧线装饰，提示问题分组为"查预算 / 追流程 / 审风险"',
        ],
        'solves': ['P2 CTA 词汇碎片化', 'P2 移动端层级混乱', 'P1 品牌无记忆点'],
    },
    {
        'id': 'C',
        'name': 'Cinematic Motion（克制动效身份）',
        'what': '以 C 弧线扫过作为页面切换与加载的签名动效，保持 B2B 产品稳重感。',
        'changes': [
            '页面进入：内容从右向左淡入，时长 240ms，ease-out',
            '加载状态：logo C 弧线 120° 旋转，脉冲 1.2s',
            '卡片 hover：微妙上浮 + 阴影加深，避免过度炫技',
            '注册：calm-measured（冷静、可度量）',
        ],
        'solves': ['P2 视觉层级弱', 'P1 品牌无差异化'],
    },
]

def score_color(score):
    if score >= 70: return '#16a34a'
    if score >= 50: return '#ca8a04'
    return '#dc2626'

def severity_badge(sev):
    colors = {'P1': '#dc2626', 'P2': '#ca8a04', 'P3': '#4b5563'}
    return f'<span style="background:{colors[sev]};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600">{sev}</span>'

scorecard_html = ''.join(
    f'<div class="score-row"><span class="score-name">{k}</span><div class="score-bar"><div class="score-fill" style="width:{v}%;background:{score_color(v)}"></div></div><span class="score-val" style="color:{score_color(v)}">{v}</span></div>'
    for k, v in scores.items()
)

findings_html = ''.join(
    f'''<div class="finding">
      <div class="finding-head">{severity_badge(f['severity'])} <span class="finding-dim">{f['dimension']}</span></div>
      <p><b>证据：</b>{f['evidence']}</p>
      <p><b>业务影响：</b>{f['impact']}</p>
      <p><b>修复：</b>{f['fix']}</p>
    </div>'''
    for f in findings
)

redesign_html = ''.join(
    f'''<div class="direction">
      <h3>方向 {r['id']}：{r['name']}</h3>
      <p><b>定位：</b>{r['what']}</p>
      <ul>{''.join(f'<li>{c}</li>' for c in r['changes'])}</ul>
      <p><b>解决：</b>{' · '.join(r['solves'])}</p>
    </div>'''
    for r in redesign
)

html = f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sanan / 三安制造 UI 审计报告</title>
<style>
:root {{ --brand:#003CB4; --brand-dark:#002A7E; --accent:#C9A44A; --bg:#F7F8FB; --surface:#fff; --text:#111827; --text-2:#4B5563; --border:#E5E7EB; }}
* {{ box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--text); line-height:1.6; margin:0; padding:0; }}
.container {{ max-width:960px; margin:0 auto; padding:32px 20px; }}
header {{ display:flex; align-items:center; gap:16px; border-bottom:1px solid var(--border); padding-bottom:20px; margin-bottom:24px; }}
header img {{ height:56px; }}
header h1 {{ margin:0; font-size:26px; }}
header p {{ margin:0; color:var(--text-2); }}
section {{ background:var(--surface); border-radius:12px; padding:22px; margin-bottom:18px; box-shadow:0 1px 3px rgba(0,0,0,.04); }}
h2 {{ margin-top:0; font-size:20px; color:var(--brand-dark); border-left:4px solid var(--brand); padding-left:10px; }}
h3 {{ font-size:16px; margin:18px 0 8px; }}
.meta {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; color:var(--text-2); font-size:13px; margin-bottom:8px; }}
.overall {{ display:flex; align-items:center; gap:20px; }}
.overall-score {{ width:96px; height:96px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:32px; font-weight:700; color:#fff; background:conic-gradient(var(--brand) {overall}%, #E5E7EB 0); }}
.overall-score span {{ width:78px; height:78px; border-radius:50%; background:#fff; color:var(--brand); display:flex; align-items:center; justify-content:center; }}
.score-row {{ display:flex; align-items:center; gap:12px; margin:8px 0; }}
.score-name {{ width:160px; font-size:13px; color:var(--text-2); }}
.score-bar {{ flex:1; height:10px; background:#E5E7EB; border-radius:5px; overflow:hidden; }}
.score-fill {{ height:100%; border-radius:5px; }}
.score-val {{ width:36px; text-align:right; font-weight:700; }}
.finding {{ border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:12px; }}
.finding-head {{ display:flex; align-items:center; gap:10px; margin-bottom:8px; }}
.finding-dim {{ color:var(--text-2); font-size:13px; }}
.direction {{ border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:12px; }}
.direction h3 {{ margin-top:0; color:var(--brand); }}
ul {{ padding-left:20px; }}
li {{ margin:4px 0; }}
.gallery {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }}
.gallery figure {{ margin:0; }}
.gallery img {{ width:100%; border:1px solid var(--border); border-radius:8px; }}
.gallery figcaption {{ font-size:12px; color:var(--text-2); margin-top:4px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th,td {{ text-align:left; padding:8px; border-bottom:1px solid var(--border); }}
th {{ color:var(--text-2); font-weight:600; }}
.degradation {{ background:#FEF3C7; border-left:4px solid var(--accent); padding:12px; border-radius:6px; font-size:13px; color:#92400E; }}
</style>
</head>
<body>
<div class="container">
  <header>
    <img src="{logo_b64}" alt="Sanan 三安制造 logo">
    <div>
      <h1>Sanan / 三安制造 网站 UI 审计报告</h1>
      <p>审计对象：http://localhost:8300/（三安光电 AI 费用预决算管理系统 Demo）</p>
    </div>
  </header>

  <section>
    <div class="meta">
      <div><b>审计时间：</b>2026-08-26 21:50 (CST)</div>
      <div><b>审计范围：</b>单页应用（登录页 + admin 工作台）</div>
      <div><b>工具降级：</b>未安装 impeccable/marketing-skills/refero，采用原生 Playwright + curl 手工探测</div>
    </div>
  </section>

  <section>
    <h2>执行摘要</h2>
    <p>当前 Demo 功能框架清晰，但品牌表达与外部可见性薄弱：界面主色与提供的 Sanan logo 蓝 (#003CB4) 完全脱节，顶栏/登录页使用通用图标；页面无 h1/h2/h3、无 robots/sitemap/JSON-LD/llms.txt，搜索引擎与 AI 几乎不可见。移动端顶栏标题截断、导航未折叠。性能与对比度基本合格。</p>
    <div class="overall">
      <div class="overall-score"><span>{overall}</span></div>
      <div>
        <div style="font-size:22px;font-weight:700">综合健康度 {overall}/100</div>
        <div style="color:var(--text-2)">最高杠杆：品牌校准 + 语义化/SEO 骨架</div>
      </div>
    </div>
  </section>

  <section>
    <h2>七维评分卡</h2>
    {scorecard_html}
  </section>

  <section>
    <h2>发现清单</h2>
    {findings_html}
  </section>

  <section>
    <h2>基于 Logo 的 Redesign 方向</h2>
    {redesign_html}
  </section>

  <section>
    <h2>截图证据</h2>
    <div class="gallery">
      <figure><img src="{login_desktop_b64}" alt="登录页桌面"><figcaption>登录页（桌面）</figcaption></figure>
      <figure><img src="{app_desktop_b64}" alt="工作台桌面"><figcaption>admin 工作台（桌面）</figcaption></figure>
      <figure><img src="{login_mobile_b64}" alt="登录页移动"><figcaption>登录页（移动）</figcaption></figure>
      <figure><img src="{app_mobile_b64}" alt="工作台移动"><figcaption>admin 工作台（移动）</figcaption></figure>
    </div>
  </section>

  <section>
    <h2>关键测量值</h2>
    <table>
      <tr><th>测量项</th><th>结果</th><th>方法</th></tr>
      <tr><td>当前主色</td><td>#1E2A4A（深蓝）</td><td>CSS 变量提取</td></tr>
      <tr><td>Logo 主色</td><td>#003CB4（取样 360 次出现）</td><td>PNG 像素采样</td></tr>
      <tr><td>品牌色像素占比</td><td>~0% Sanan 蓝；约 18% 深蓝 + 金色</td><td>截图估算</td></tr>
      <tr><td>页面 h1/h2/h3</td><td>0 / 0 / 0</td><td>渲染后 DOM</td></tr>
      <tr><td>可见文本词数</td><td>登录页 ≈ 40；工作台 ≈ 111</td><td>innerText 分词</td></tr>
      <tr><td>加载完成时间</td><td>桌面 38.4 ms / 移动 28.5 ms</td><td>Navigation Timing</td></tr>
      <tr><td>robots / sitemap / llms.txt</td><td>均 404</td><td>curl</td></tr>
      <tr><td>canonical / OG / JSON-LD</td><td>缺失</td><td>HTML 解析</td></tr>
      <tr><td>对比度风险</td><td>--c-text-3 #9098AB 在白色上 2.89:1</td><td>WCAG 2.1</td></tr>
    </table>
  </section>

  <section>
    <h2>建议的设计 Token（基于 Logo）</h2>
    <table>
      <tr><th>Token</th><th>值</th><th>用途</th></tr>
      <tr><td>--brand-primary</td><td>#003CB4</td><td>顶栏、主按钮、链接、主题色</td></tr>
      <tr><td>--brand-primary-dark</td><td>#002A7E</td><td>hover、强调背景</td></tr>
      <tr><td>--brand-primary-light</td><td>#E8F0FE</td><td>浅蓝背景、选中态</td></tr>
      <tr><td>--brand-accent</td><td>#C9A44A</td><td>成功/高亮/AI 建议强调（限量使用）</td></tr>
      <tr><td>--surface</td><td>#FFFFFF</td><td>卡片、登录页</td></tr>
      <tr><td>--text-secondary</td><td>#5B6478</td><td>保证对比度 ≥ 4.5</td></tr>
    </table>
  </section>

  <section>
    <div class="degradation">
      <b>工具降级说明：</b>由于当前环境未安装 stardust/extract、impeccable、marketing-skills 与 refero MCP，本报告采用 Puppeteer + curl + 源码分析手工完成。评分与测量均基于实际可观察证据；部分品牌色像素占比为合理估算，已注明。
    </div>
  </section>
</div>
</body>
</html>
'''

(ROOT / 'report.html').write_text(html, encoding='utf-8')
print('report written:', ROOT / 'report.html')
