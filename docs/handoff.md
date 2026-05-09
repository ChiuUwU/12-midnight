# 十二点天黑交接文档

## 当前目标

做一个手机友好的狼人杀发牌/法官辅助网页。当前优先有法官版本：法官创建房间、玩家手机加入选座、看身份，法官推进夜间流程和白天关键记录。

## 运行方式

- 静态演示：直接打开 `web/index.html`，数据只在当前浏览器。
- 本地联机：双击 `start-web-server.cmd` 或执行 `node server.js`，访问 `http://localhost:5173`，同 Wi-Fi 手机访问电脑 IP。
- 线上免费版：Cloudflare Pages + Functions + D1，见 `docs/cloudflare-deploy.md`。

## 主要文件

- `web/index.html`：网页入口。
- `web/styles.css`：手机端界面样式。
- `web/app.js`：前端状态、页面渲染、本地模式逻辑、远程 API 调用。
- `server.js`：本地 Node HTTP 服务，内存保存房间。
- `functions/api/rooms/[[path]].js`：Cloudflare Pages Functions 线上 API，D1 保存房间。
- `db/schema.sql`：D1 表结构。
- `web/assets/roles/`：角色牌图。
- `web/assets/app-icon.png`：应用头像。

## 关键产品规则

- 默认 12 人局、屠边、可上警、有遗言，夜死无遗言。
- 法官是“法官席”，不占 1-12 号座位。创建房间者自动拿到法官权限，其他设备可用 4 位法官口令进入法官席。
- 盗宝大师当前固定狼人阵营，三张盗宝牌固定包含狼人、平民、一张神职牌；神职牌和场上好人神职不重复。当前不允许盗宝蒙面人，但代码规则留了 `allowMaskedManInTreasureCards`。
- 白痴公开文本目前可按需求在“白痴/白神”之间调整，内部 role id 保持 `idiot`。

## 已有功能

- 创建/加入房间、分享链接、选座、补齐测试座位。
- 四个固定版型：预女猎白混、盗宝大师、机械狼通灵师、假面舞会。
- 随机发牌、玩家看自己身份、法官看全局身份、复盘。
- 夜间流程页：按版型生成步骤，记录目标、跳过、盗宝牌选择。
- 第一天上警、实时退水、警徽投票、PK 后警徽流失。
- 天亮死亡记录、白天放逐投票、手动放逐记录、警徽移交/撕毁、随时结束游戏。

## API 概览

本地和 Cloudflare 保持同一套接口：

- `POST /api/rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms/:id/join`
- `POST /api/rooms/:id/judge-claim`
- `POST /api/rooms/:id/seat`
- `POST /api/rooms/:id/fill-test`
- `POST /api/rooms/:id/deal`
- `POST /api/rooms/:id/reveal`
- `POST /api/rooms/:id/night-start`
- `POST /api/rooms/:id/night-action`
- `POST /api/rooms/:id/night-finish`
- `POST /api/rooms/:id/sheriff-candidates`
- `POST /api/rooms/:id/sheriff-withdraw`
- `POST /api/rooms/:id/sheriff-vote`
- `POST /api/rooms/:id/death-record`
- `POST /api/rooms/:id/day-vote`
- `POST /api/rooms/:id/exile-record`
- `POST /api/rooms/:id/sheriff-badge`
- `POST /api/rooms/:id/game-end`

## 下一步优先级

1. 夜间规则校验：女巫药瓶次数、首夜不可自救、守卫不可连续同守、摄梦连续摄死亡、预言家/通灵师不可空验。
2. 夜间死亡半自动结算：狼刀、救药、毒药、守卫、摄梦、同守同救死亡。
3. 普通白天投票继续细化：记录发言顺序、PK 先发言顺序、弃票统计展示。
4. UI 继续压缩按钮高度和页面滚动，重点优化法官页手机单手操作。
5. Cloudflare 部署后做一次真机多人测试，确认房间同步和身份隐藏没有泄漏。
