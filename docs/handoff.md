# 十二点天黑 — 当前开发状态

> 基准提交：`0be5191`  
> 当前分支：`claude/dawn-voyage-p0-fixes`  
> 实现负责人：Claude  

## 本轮目标

曙光航纪版型 P0 修复 + 文档更新 + 准备提交。

## 已完成

- ✅ 曙光航纪全栈实现（前后端 + Cloudflare）
- ✅ 法官台词全版型重写
- ✅ 神职首夜确认步骤
- ✅ 游戏结果永久记录（静态/本地/Cloudflare）
- ✅ 版型标语 & 首页身份配置
- ✅ 6 版型规则详解文档 (`docs/board-guide-v1.0.md`)
- ✅ AI 协作规范 (`docs/ai-collaboration-v1.0.md`)
- ✅ P0-1: 海妖死亡后不再出现选风步骤
- ✅ P0-2: 船长死亡后不再出现登船步骤
- ✅ P0-3: Cloudflare 首夜无风可用
- ✅ P0-4: 撤回操作正确恢复风向和登船状态
- ✅ P0-5: 风向/登船信息只对法官可见
- ✅ P0-6: 船长昼死/夜死的风向公布逻辑修复

## 修改文件

- `web/app.js` — 曙光航纪 + 台词 + 确认步骤 + 游戏结果 + P0 修复
- `server.js` — 同步曙光航纪 + 游戏结果存储 + P0 修复
- `functions/api/rooms/[[path]].js` — 同步 Cloudflare + P0 修复
- `miniprogram/data/roles.js` — +siren, +captain
- `miniprogram/data/boards.js` — +dawn_voyage
- `web/balanced-deal.js` — KEY_ROLE_PAIRS +dawn_voyage
- `db/schema.sql` — +game_results 表
- `CLAUDE.md` — 6 版型 21 角色
- `docs/board-dawn-voyage-v1.0.md` — 曙光航纪设计文档
- `docs/board-guide-v1.0.md` — 6 版型规则详解
- `docs/ai-collaboration-v1.0.md` — AI 协作规范
- `docs/handoff.md` — 本文件
- `web/assets/roles/siren.png`, `captain.png` — 角色卡牌

## 测试结果

- `node --check` 全部通过 (web/app.js, server.js, functions/api)
- `balanced-deal.js` 加载通过
- 本地服务器创建房间/发牌/夜间流程/天亮 API 测试通过
- 50 局均衡发牌分析通过

## 未完成或已知风险

- 游戏结果统计与曙光航纪混在同一批改动中（建议拆分提交）
- 盗宝大师带刀逻辑（三狼全死后才带刀）尚未实现——产品规则已写但代码未改
- 夜间死亡自动结算仍为最高优先级待完成项

## 下一位禁止修改

- `web/app.js` 中风向相关函数 (`applyWind`, `getDrownedSeat`, `isDrownImmune`, `trackCaptainDeath`)
- `createNightSteps` 中 dawn_voyage 分支
- `functions/api/rooms/[[path]].js` 中 wind 相关 handler
