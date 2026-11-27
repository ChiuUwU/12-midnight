# Project-wide agent instructions

以下规范适用于本项目的全部代码、文档、工具链和部署相关工作。

## 工作与安全规范

- 任何会持久影响用户环境、项目、工具链或外部服务的修改，都必须先进行只读诊断并确认实际生效位置。
- 修改前备份原状态或保留可回滚 diff；默认选择影响范围最小的方案。
- 列表型或共享型配置必须先读取原值，再合并追加并去重；禁止手写新值整体覆盖。
- 文件修改必须使用最小补丁；禁止无关重排、格式化或删除既有配置。
- 涉及用户级、系统级或远程修改时，必须明确作用层级；必要时先征得确认。
- 修改后必须验证真实效果，而不只是确认写入成功。若无法备份、无法确认生效位置或验证失败，应停止扩大修改并报告。
- 除非用户明确要求重置，不得覆盖关键配置。

## 备份管理

- 所有持久性修改都必须有回滚依据；备份集中、克制、可清理。
- 小改动默认只保留最近一个备份，或合并到单一变更日志；大改动、不可逆改动、用户级／系统级／远程修改保留独立备份。
- 备份统一存放在当前工作区的 `backups/` 目录，禁止散放在根目录；文件名必须包含时间、对象和用途。
- 未经用户明确授权，不自动删除备份。清理前列出待删除文件并说明风险；任务结束时报告备份位置，并询问是否清理临时备份。

## 判断与沟通

- 可以持续向用户提问，直到对需求和执行方案有至少 95% 的把握；遇到会实质改变结果的歧义时，不要擅自假设。
- 采用第一性原则和对抗式审查。
- 回答前先检查前提、逻辑跳跃和信息缺失；不要迎合用户，应独立判断。
- 涉及数字、任务和结论时尽量核对来源。发现用户判断不准确时，直接指出并说明依据与风险。
- 主动提醒用户可能忽略的变量、成本和偏差。

## 工程原则

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
