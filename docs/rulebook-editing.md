# 版型规则编辑与构建

> 文档定位：网页规则的源文件、生成和发布说明；产品需求与当前进度分别见 [PRD](./product-requirements.md)、[当前状态](./current-status.md)。规则正文修改需先取得确认。

网站规则正文由项目内 Markdown 生成：六个版型使用 `board-guide-v1.0.md` 的对应章节，唯邻是从、狼王守卫和暗黑破坏 2.0 使用各自的独立规则文档。不要直接编辑生成的 `web/rulebook-data.json`。

在项目目录运行 `npm run build:rulebook` 生成规则数据；运行 `npm run watch:rulebook` 可在本地监听规则源变化并自动重新生成，之后刷新通过本地服务打开的网页即可预览。`node scripts/build-rulebook.js --check` 可检查生成结果是否与源文档一致。

本地编辑或 GitHub 在线编辑只改变源文件，不会瞬间修改生产网站。要让 Cloudflare Pages 自动生成新规则，先检查现有 Pages 构建配置，在不覆盖其他必要配置的前提下确认构建命令包含 `npm run build`，输出目录仍指向当前项目的 `web`；也可以在本地构建并将生成数据与源文件一起提交。合并并部署成功后，线上刷新才会读取新版本。

网站中的法官夜间流程词来自现有 `createNightSteps` 和 `getJudgeScript`，示例按全员存活且技能未消耗构造；实际流程随游戏状态改变。规则正文与系统代码必须一起校对，不能因为文档重新生成就认为玩法代码已改变。新增版型需要同时增加规则文档、生成器映射和测试。
