const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

test("published rulebook matches its editable Markdown sources and covers every board", () => {
  const root = path.resolve(__dirname, "..");
  execFileSync(process.execPath, [path.join(root, "scripts/build-rulebook.js"), "--check"], { cwd: root });
  const data = JSON.parse(fs.readFileSync(path.join(root, "web/rulebook-data.json"), "utf8"));
  const ids = ["pre_witch_hunter_idiot_mixed", "masquerade", "treasure_master", "mechanical_wolf_spirit_medium", "realm_of_trickery", "dawn_voyage", "wolf_king_guard", "follow_neighbor", "dark_destruction_2"];
  assert.deepEqual(Object.keys(data.boards).sort(), ids.sort());
  for (const id of ids) assert.ok(data.boards[id].length > 100, `${id} has no usable rules`);
  assert.match(data.version, /^[a-f0-9]{12}$/);
  assert.doesNotMatch(data.boards.follow_neighbor, /发牌平衡规则/);
});

test("each rulebook page renders its board and judge cues without a live room", async () => {
  const root = path.resolve(__dirname, "..");
  const data = JSON.parse(fs.readFileSync(path.join(root, "web/rulebook-data.json"), "utf8"));
  let click;
  const app = { innerHTML: "", addEventListener: (name, handler) => { if (name === "click") click = handler; } };
  const context = {
    document: { title: "", querySelector: () => app },
    location: { protocol: "file:", search: "" },
    localStorage: { getItem: () => null, setItem: () => {} },
    crypto: webcrypto, URLSearchParams, Image: class {}, console,
    WolfKnifePolicy: require("../web/wolf-knife-policy"),
    fetch: async () => ({ ok: true, json: async () => data })
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(root, "web/app.js"), "utf8"), context);
  assert.ok(click);
  for (const id of Object.keys(data.boards)) {
    const target = { dataset: { action: "open-rulebook", boardId: id }, closest() { return this; } };
    await click({ target });
    assert.match(app.innerHTML, /法官夜间流程词参考/, `${id} did not render`);
    assert.match(app.innerHTML, /法官白天流程词参考/);
    assert.match(app.innerHTML, /class="rulebook-toolbar"/);
    assert.ok(app.innerHTML.indexOf('data-action="rulebook-back"') < app.innerHTML.indexOf('class="rulebook-hero"'), 'back button must precede the long document');
    assert.match(app.innerHTML, /href="#rulebook-rules"/);
    assert.match(app.innerHTML, /id="rulebook-night"/);
    assert.match(app.innerHTML, /id="rulebook-day"/);
    assert.match(app.innerHTML, /<ul>|<ol start="/);
    assert.doesNotMatch(app.innerHTML, /规则文档加载失败/);
  }
  context.fetch = async () => { throw new Error('offline'); };
  await click({target:{dataset:{action:'open-rulebook',boardId:'follow_neighbor'},closest(){return this;}}});
  assert.match(app.innerHTML,/规则文档加载失败/);
  assert.match(app.innerHTML,/class="rulebook-toolbar"/);
  await click({target:{dataset:{action:'rulebook-back'},closest(){return this;}}});
  assert.match(app.innerHTML,/创建房间/);
});
