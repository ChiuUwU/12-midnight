# 最后一夜 Last-Night — 交接记录

> 已推送检查点：`2f38680`（Codex 夜间结算审查修复）
> 当前分支：`codex/night-resolution-review-fixes`
> 实现负责人：Codex（审查修复）

## Codex 审查修复（2026-06-28）

## 无法官模式基础（开发分支）

- 分支：`codex/no-judge-foundation`
- 基线：已部署的 `e8ac595`
- 控制设备与法官权限已分离；无法官房主不再获得身份总览。
- 当前身份玩家可在自己的手机提交夜间行动，非当前玩家由服务端拒绝。
- 等待玩家响应已隐藏当前角色名称；查验结果只返回提交者。
- 公共设备支持夜间语音播报、重播、撤回、天亮公开死讯和公共事件播报。
- 蒙面延迟死亡与死亡技能采用本人私密待办，不向控制设备泄漏座位。
- 白天线上只记录最终出局结果，不记录上警、投票和唱票。
- 六个当前版型均已完成无法官首夜端到端测试，五个复杂版型已完成连续两夜测试。
- 详细边界见 `docs/no-judge-mode-v0.1.md`。

当前验证：`npm.cmd test` 21/21 通过；Node 服务、网页脚本和 Pages Function 均通过语法检查。

- 无法官模式会在所有公开死亡与私人死亡技能处理完成后自动判断屠边结果并播报胜方。
- 混血儿跟随狼人时仍计入平民边，不加入狼队；同夜双方达成条件时按狼人先行动判狼人胜。
- 无法官模式支持狼人本人在白天自爆并跳过剩余白天；不公布具体身份牌。普通狼人直接进入下一夜，带死亡技能的狼人先处理技能。

### 结算完整化（待提交）

- 服务端在结束夜晚时生成权威结算；法官确认前不能进入下一夜。
- 完成舞池少数阵营、面具临时阵营、舞者普通狼刀保护与毒药免疫。
- 完成盗宝牌主动技能、毒药次数、连续选牌限制、技能刀与盗宝猎人判定。
- 完成机械守卫挡刀挡毒和女巫弹毒、机械毒/查验/技能刀、通灵师查看模仿身份。
- 完成蒙面人发言后延迟死亡待办。
- 完成猎人、狼王、机械猎人、盗宝猎人的死因与最后一神/狼限制，以及开枪结算。
- 白痴被放逐后公开身份；普通玩家仍看不到私密死因与待处理技能。
- 夜间目标必须存活；盗宝牌必须来自本人牌堆；假面不能连续两晚重复验人或给同一人面具。
- 本地服务、静态本地模式和 Cloudflare Pages Function 保持同一行为。
- 自动测试扩展至 15 项，覆盖权威结算、跨夜阻断、死亡技能和主要复杂版型。

### 无法官模式边界

- 线下玩法不迁移上警、投票、发言和放逐。
- 玩家只在自己的手机上进行私密夜间行动。
- 公共设备只负责语音播报流程与公开死讯。
- 下一阶段应实现步骤领取/提交权限、公共播报状态和自动推进；不要恢复旧文档中的“公共手机集中选择目标”。

- 将死亡建议算法提取到 `web/night-resolution.js`，网页和 Node 测试调用同一实现。
- 普通玩家的房间响应仅包含死亡号码，不再泄露狼刀、毒药等死亡原因。
- Node 与 Cloudflare 后端只保存已确认死亡座位对应的有限字符串原因。
- 法官手动新增死亡座位时记录“法官手动确认”。
- 法官日志和复盘时间线显示已确认的死亡原因。
- 更新前端缓存版本，确保部署后加载新结算模块。
- 从 Git 跟踪中移除误提交的 `.claude/skills`，本机文件保持不变。
- 测试扩展至 11 项，直接覆盖狼刀、女巫毒、同守同救、曙光风向与溺亡，以及普通玩家权限过滤。

验证结果：`npm.cmd test` 11/11 通过；前端、结算模块、本地服务端、Pages Function 和测试文件均通过 `node --check`。

当前状态：等待用户批准提交、合并和部署。

## Claude 提交快照

## 本轮目标

夜间结算 v1：死亡建议显示原因，法官可修改确认，三端同步。

## 已完成

- `renderDeathRecord()` 显示系统建议死亡面板，每个座位标注死亡原因（狼刀/女巫毒/溺亡等）
- `death-submit` 将 `reasons` 存入 `deathRecords`
- `server.js` / `functions/api/rooms/[[path]].js` 接受并持久化 `reasons`
- 新增 `state.deathDraftReasons` 在组件间传递原因数据
- 新增 `tests/night-resolution.test.js` 2/2 通过

## 修改文件

| 文件 | 改动 |
|------|------|
| `web/app.js` | renderDeathRecord 原因面板、death-submit reasons 存储、deathDraftReasons 状态 |
| `server.js` | death-record handler 接受 reasons 字段 |
| `functions/api/rooms/[[path]].js` | 同上 |
| `tests/night-resolution.test.js` | 新增 |
| `docs/handoff.md` | 本文件 |

## 测试结果

```
node --check web/app.js server.js "functions/api/rooms/[[path]].js"  # 全部通过
node --test tests/night-resolution.test.js                           # 2/2 pass
```

## 未完成

- 舞池结算
- 盗宝大师带刀逻辑（三狼全死后才带刀）
- 盗宝技能生效
- 自动胜负判断

## 数据库/部署影响

无。仅 deathRecords 条目新增 `reasons` 字段（JSON 内，不需迁移）。

## 建议下一步

Codex 审查后合并到 main。下一功能：舞池结算或盗宝技能。

## 对 Codex 的说明

1. `calculateSuggestedDeaths()` 核心逻辑**未改动**，只在 death-record 存储和 UI 加了 reasons
2. 前端 `deathDraftReasons` 在 night-finish / use-suggested-deaths / night-start 时与 `deathDraftSeats` 同步更新
3. reasons 格式：`{ "3": ["狼刀"], "5": ["溺亡", "狼刀"] }`（seat→reasons[]）
4. 本分支基于 `b291656`（你的 Fix Dawn Voyage online flow），已包含你的审查修复
5. 不小心多提交了 `.claude/skills/` 目录，合并前请过滤
