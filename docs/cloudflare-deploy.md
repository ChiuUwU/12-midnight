# Cloudflare 免费部署

目标：用 Cloudflare Pages 托管网页，用 Pages Functions 提供 `/api/rooms`，用 D1 保存房间。这样电脑和手机不需要在同一个 Wi-Fi，也不需要一直开着本地 `cmd`。

## 这次新增的文件

- `web/`：静态网页，Cloudflare Pages 会直接发布这个目录。
- `functions/api/rooms/[[path]].js`：线上 API，接口路径和本地 `server.js` 保持一致。
- `db/schema.sql`：D1 数据库表结构。
- `wrangler.toml`：Cloudflare 项目配置。

## 第一次配置

1. 进入 Cloudflare Dashboard，打开 Workers & Pages。
2. 创建 Pages 项目并连接 GitHub 仓库 `ChiuUwU/12-midnight`。
3. Pages 构建设置：

- Framework preset：None
- Build command：留空
- Build output directory：`web`

4. 创建一个 D1 数据库，名字建议填 `12-midnight`。
5. 初始化数据库表。可以在 Cloudflare D1 控制台里执行 `db/schema.sql` 的内容，也可以在项目目录执行：

```bash
npx wrangler d1 execute 12-midnight --file=./db/schema.sql --remote
```

6. 在 Pages 项目的 Settings -> Functions -> D1 database bindings 里绑定：

- Variable name：`DB`
- D1 database：`12-midnight`

7. 重新部署 Pages。

## 部署后怎么用

打开 Cloudflare Pages 给你的网址，例如：

```text
https://12-midnight.pages.dev
```

创建房间后，把房间分享链接发给其他玩家。法官设备保留法官口令；如果换设备当法官，用口令进入法官席。

## 当前线上版限制

- D1 保存的是整个房间 JSON，适合当前 MVP。后续如果房间量变大，再拆成多张表。
- 现在没有实时 WebSocket，前端靠刷新/自动轮询拿最新房间状态。
- 夜间行动仍是记录器，不自动结算女巫、守卫、摄梦等复杂死亡结果。
