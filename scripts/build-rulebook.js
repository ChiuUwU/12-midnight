"use strict";

// Public rulebook is derived from the project's editable Markdown documents.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "web", "rulebook-data.json");
const sources = ["docs/board-guide-v1.0.md", "docs/board-follow-neighbor-v0.1.md", "docs/board-wolf-king-guard-v0.1.md", "docs/board-dark-destruction-v2.0.md"];
const guideSections = {
  treasure_master: "一、盗宝大师",
  realm_of_trickery: "二、诡术之境",
  dawn_voyage: "三、曙光航纪",
  pre_witch_hunter_idiot_mixed: "四、预女猎白混",
  mechanical_wolf_spirit_medium: "五、机械狼通灵师",
  masquerade: "六、假面舞会"
};

function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n"); }
function section(guide, heading) {
  const marker = `## ${heading}`;
  const start = guide.indexOf(marker);
  if (start < 0) throw new Error(`缺少规则章节：${heading}`);
  const end = guide.indexOf("\n## ", start + marker.length);
  return guide.slice(start, end < 0 ? undefined : end).trim();
}
function fromHeading(document, heading, endHeading) {
  const start = document.indexOf(`\n## ${heading}`);
  if (start < 0) throw new Error(`缺少规则章节：${heading}`);
  const end = endHeading ? document.indexOf(`\n## ${endHeading}`, start + 1) : -1;
  return document.slice(start + 1, end < 0 ? undefined : end).trim();
}
function compile() {
  const guide = read(sources[0]);
  const boards = Object.fromEntries(Object.entries(guideSections).map(([id, heading]) => [id, section(guide, heading)]));
  boards.follow_neighbor = fromHeading(read(sources[1]), "1. 身份组成", "5. 发牌平衡规则");
  boards.wolf_king_guard = fromHeading(read(sources[2]), "身份组成", "实现验收");
  boards.dark_destruction_2 = fromHeading(read(sources[3]), "1. 身份组成与胜利条件", "6. 文档状态");
  const version = crypto.createHash("sha256").update(JSON.stringify(boards)).digest("hex").slice(0, 12);
  return `${JSON.stringify({ version, boards })}\n`;
}
function build() {
  const data = compile();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== data) throw new Error("规则文档未同步，请运行 npm run build:rulebook");
  } else {
    fs.writeFileSync(output, data, "utf8");
    process.stdout.write("规则文档已生成。\n");
  }
}
build();
if (process.argv.includes("--watch")) {
  let timer;
  sources.forEach((file) => fs.watch(path.join(root, file), () => {
    clearTimeout(timer);
    timer = setTimeout(() => { try { build(); } catch (error) { process.stderr.write(`${error.message}\n`); } }, 150);
  }));
  process.stdout.write("监听规则文档修改；更新后刷新浏览器预览。\n");
}
