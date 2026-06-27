# 十二点天黑 Last-Night

狼人杀线下发牌/法官流程辅助网页工具。手机优先，口号「狼人杀还有一万个夏天」。

## 运行方式

| 模式 | 启动 | 数据存储 |
|------|------|----------|
| 静态演示 | 直接打开 `web/index.html` | localStorage |
| 本地联机 | `npm start` 或双击 `start-web-server.cmd` → `localhost:5173` | Node 内存 |
| 线上联机 | 部署到 Cloudflare Pages + D1 | D1 数据库 |

## 架构

```
web/index.html          ← 入口
web/app.js              ← 全部前端逻辑 (2778行 SPA)，含 17 个视图、事件委托、API 调用
web/styles.css          ← 移动端响应式样式 (898行)
web/balanced-deal.js    ← 均衡发牌算法 (UMD, 250行)
server.js               ← Node 本地服务器 (952行)，REST API + 内存房间
functions/api/rooms/    ← Cloudflare Pages Functions (1000行)，API 与 server.js 同构
miniprogram/            ← 微信小程序版（暂停），其中 data/roles.js 和 data/boards.js 是共享数据源
db/schema.sql           ← D1 表结构 (rooms + deal_histories)
```

三种模式共用同一套 REST API 接口（27个端点）。`server.js` 和 `functions/api/rooms/[[path]].js` 各自实现相同逻辑，未做代码共享——这是 MVP 的有意权衡。

## 核心概念

- **法官席**：法官不占 1-12 号座位。创建房间者自动得法官权限。其他设备用 4 位法官口令进入。
- **身份安全**：`sanitizeRoom()` 确保非法官玩家只能看到自己的身份牌。
- **均衡发牌**：每局 2000 套候选 → 温度加权随机抽取 → 记录最近 10 局历史避免重复。
- **房间过期**：12 小时无写入自动清理。

## 21 个角色 (ROLES)

**好人**: seer(预言家), witch(女巫), hunter(猎人), idiot(白痴), villager(平民), dancer(舞者), spirit_medium(通灵师), poisoner(毒师), dreamer(摄梦人), masked_man(蒙面人), guard(守卫), magician(魔术师), order_prince(定序王子)

**狼人**: wolf, wolf_king(狼王), mask(假面), mechanical_wolf(机械狼), treasure_master(盗宝大师), trickster(诡术师)

**好人(续)**: magician(魔术师), order_prince(定序王子), captain(船长)

**特殊**: mixed_blood(混血儿, FOLLOW阵营), siren(海妖, WOLF阵营)

## 6 个版型 (BOARDS)

| ID | 名称 | 特点 |
|----|------|------|
| pre_witch_hunter_idiot_mixed | 预女猎白混 | 经典+混血儿 |
| masquerade | 假面舞会 | 舞者+假面，舞池结算 |
| treasure_master | 盗宝大师 | 3张盗宝牌，首夜狼不刀 |
| mechanical_wolf_spirit_medium | 机械狼通灵师 | 机械狼模仿+守卫 |
| realm_of_trickery | 诡术之境 | 魔术师+诡术师互换+定序王子回溯 |
| dawn_voyage | 曙光航纪 | 海妖风向偏移+船长登船溺亡 |

## 关键代码模式

- `web/app.js` 是单文件 SPA：IIFE 包裹，事件委托在 `#app` 上，`state` 对象管理全局状态
- `state.view` 驱动视图切换（17个视图），`render()` 全量重绘
- 本地模式直接操作 `state.rooms[id]`，远程模式通过 `apiRequest()` / `remotePost()` 调 API
- `IS_REMOTE` 检测 `http:` 或 `https:` 协议判断运行模式
- 远程模式下每 2.5 秒自动轮询刷新（仅 room/identity/judge/review 视图）
- 夜间流程 `createNightSteps(boardId, night, room)` 按版型生成步骤列表
- 发牌走 `BalancedDeal.createBalancedDeal()` → 内部调用 `dealBoard()` 生成候选

## 当前状态

### 已完成
- 房间 CRUD、选座、补齐测试、分享链接
- 5 版型均衡发牌、玩家私密看身份、法官全局身份、复盘
- 夜间流程逐步记录（按版型生成步骤、撤回、跳过、盗宝牌选择）
- 守卫连续同守拦截、女巫用药状态跟踪
- 诡术师/魔术师换号冲突检测
- 上警/退水/警徽投票(含PK)/警徽移交撕毁
- 天亮死亡记录（半自动建议）、白天放逐投票(含PK)、手动放逐
- 定序王子回溯窗口 (诡术之境)
- 随机发言顺序工具
- Cloudflare D1 持久化

### 待完成（按优先级）
1. 夜间死亡半自动结算（目前只有建议，需法官确认）
2. 假面舞会舞池结算
3. 混血儿榜样选择后阵营跟随
4. 机械狼模仿后技能处理
5. 蒙面人延迟死亡
6. 盗宝大师牌技能生效
7. 猎人/狼王「最后一神/最后一狼」不能开枪判定
8. 白痴被放逐公布身份
9. 胜负自动判断
10. 无法官模式
11. 玩家手机夜间私密操作 (P2)

## 开发原则

- 先跑通闭环，复杂结算允许法官手动确认，但必须保留操作日志
- 新增版型前必须确认阵营实力、关键角色、特殊牌堆平衡规则
- 代码中的 `ponytail:` 注释标记刻意简化，注明升级路径
- 前端逻辑和后端 API 各有一份实现是 MVP 权衡，后续可提取共享模块

## 文档索引

- `docs/product-rules-v0.1.md` — 全部角色技能、版型规则、夜间结算
- `docs/rule-data-structure-v0.1.md` — TS 类型定义、均衡发牌算法
- `docs/app-flow-v0.1.md` — 17 个视图、状态机 15 阶段
- `docs/mvp-build-plan-v0.1.md` — P0/P1/P2 优先级
- `docs/cloudflare-deploy.md` — 部署指南
- `docs/handoff.md` — 交接文档（当前开发者视角）
