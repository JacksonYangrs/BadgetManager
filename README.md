# 三安光电 AI 费用预决算管理系统

本项目是面向集团型企业的 AI 费用预算管理产品 Demo 与需求调研资料。

## 目录入口

- [`website/`](./website/)：可运行的桌面版与移动版 Demo
- [`docs/`](./docs/)：项目文档唯一权威来源
- [`docs/product/`](./docs/product/)：需求稿与产品/Demo设计稿
- [`archive/`](./archive/)：旧版本设计稿、重复文档和历史代码
- [`tests/`](./tests/)：测试工程与测试样本目录
- [`reports/`](./reports/)：测试、分析和生成结果目录
- [`runtime/`](./runtime/)：本机运行数据目录，不放入普通源码版本
- [`governance/`](./governance/)：项目开发与协作规则目录

## Demo 启动

桌面版：

```bash
python3 -m http.server 4173 --directory website
```

访问 `http://localhost:4173/`。

移动版：

```bash
python3 -m http.server 4175 --directory website/mobile
```

访问 `http://localhost:4175/`，建议使用移动设备或浏览器移动视口。

## 当前核心文档

- [三安光电 AI 费用预决算管理系统需求调研稿 V1](./docs/product/三安光电AI行政费用预决算管理系统需求调研稿V1.md)
- [AI 费用预算智能管理平台 Demo 设计方案 v0.5](./docs/product/demo-design-v0.5.md)
- [软件设计架构分析 V1](./docs/architecture/软件设计架构分析V1.md)
- [文档中心说明](./docs/README.md)

## 归档原则

旧版本和重复材料暂存于 `archive/`，不直接删除。确认新目录、引用和启动路径均正确后，再单独决定是否清理历史副本。
