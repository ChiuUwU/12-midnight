# 十二点天黑 — 交接记录

> 基准提交：`19ad17a`
> 当前分支：`claude/night-resolution-v1`
> 实现负责人：Claude

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
