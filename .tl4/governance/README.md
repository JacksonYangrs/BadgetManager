# OPC 项目启动治理规范

本目录是 OPC 项目的公共开发治理规则源。新项目必须在启动时通过 `scripts/init_project.sh` 发布这些规则；项目内的 `AGENTS.md` 应引用本目录发布到 `.tl4/governance/` 的版本。

## 规则文件

- `AI_WORKING_AGREEMENT.md`：人与 AI/Codex/WorkBuddy 的协作边界；
- `DEVELOPMENT_RULES.md`：开发、目录、依赖和验证规则；
- `SECURITY_RULES.md`：凭据、危险操作和测试副作用规则；
- `DATA_HANDLING_RULES.md`：数据、日志、样本和脱敏规则；
- `CHANGE_CONTROL.md`：变更、评审、提交和回滚规则；
- `DOCUMENTATION_RULES.md`：设计、代码、事件和测试文档同步规则；
- `TESTING_STANDARD.md`：L1–L4 测试和证据标准；
- `AGENTS.md`：供 Codex、WorkBuddy 等开发 Agent 发现的入口规则。

这些规则是项目启动基础设施，不替代具体项目的业务设计和安全审批。

