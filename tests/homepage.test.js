const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function loadApp(saved) {
  let click;
  const classes = new Set();
  const app = { innerHTML: '', addEventListener(name, fn) { if (name === 'click') click = fn; } };
  const context = {
    document: { title: '', querySelector: () => app, body: { classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } } } },
    location: { protocol: 'file:', search: '' }, localStorage: { getItem: () => saved ? JSON.stringify(saved) : null, setItem() {} },
    crypto: webcrypto, URLSearchParams, Image: class {}, console, setTimeout, clearTimeout,
    WolfKnifePolicy: require('../web/wolf-knife-policy'),
    fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '../web/rulebook-data.json'), 'utf8')) })
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8'), context);
  return { app, classes, async action(action, dataset = {}) { const target = { dataset: { action, ...dataset }, closest() { return this; } }; await click({ target }); } };
}

test('homepage uses the approved portrait scene with real room, rules and admin entry actions', () => {
  const { app, classes } = loadApp();
  assert.equal(app.className, 'app home-root');
  assert.ok(classes.has('home-theme'));
  assert.match(app.innerHTML, /home-moonlit-council-20261101\.png/);
  assert.match(app.innerHTML, /<h1 id="landing-title"><img[^>]+alt="最后一夜"/);
  assert.ok(fs.existsSync(path.join(__dirname, '../web/assets/branding/last-night-wordmark-v1.svg')));
  assert.match(app.innerHTML, /data-view="create"/);
  assert.match(app.innerHTML, /data-view="join"/);
  assert.match(app.innerHTML, /data-action="admin-open"/);
  assert.match(app.innerHTML, /<dialog[^>]+aria-labelledby="home-board-title"/);
  assert.equal((app.innerHTML.match(/class="landing-board"/g) || []).length, 9);
  assert.doesNotMatch(app.innerHTML, /home-hero|home-board-disclosure|设计样例|仅演示/);
  assert.match(app.innerHTML, /版型与规则/);
  assert.doesNotMatch(app.innerHTML, /探索版型|规则手册|月色之下|各执一词|灯火已燃|等你入席/);
  assert.equal((app.innerHTML.match(/aria-haspopup="dialog"/g) || []).length, 1);
  assert.ok(fs.existsSync(path.join(__dirname, '../web/assets/home-moonlit-council-20261101.png')));
});

test('homepage rulebook gets its own palette, preserving rule content and back navigation', async () => {
  const page = loadApp();
  await page.action('open-rulebook', { boardId: 'follow_neighbor' });
  assert.equal(page.app.className, 'app home-related');
  assert.ok(page.classes.has('home-theme'));
  assert.match(page.app.innerHTML, /法官夜间流程词参考/);
  await page.action('rulebook-back');
  assert.equal(page.app.className, 'app home-root');
});

test('resuming a room removes the homepage theme and room rulebooks keep existing design', async () => {
  const room = { id: '123456', boardId: 'follow_neighbor', mode: 'JUDGE', phase: 'WAITING', night: 0, seats: [], assignments: [], logs: [], nightActions: [], currentNightSteps: [] };
  const page = loadApp({ currentUserId: 'judge', currentRoomId: room.id, view: 'home', rooms: { [room.id]: room }, judgeTokens: {} });
  assert.match(page.app.innerHTML, /landing-resume/);
  assert.match(page.app.innerHTML, /123456 · 唯邻是从/);
  await page.action('view', { view: 'room' });
  assert.equal(page.app.className, 'app');
  assert.equal(page.classes.has('home-theme'), false);
  await page.action('open-rulebook', { boardId: 'follow_neighbor' });
  assert.equal(page.app.className, 'app');
  assert.equal(page.classes.has('home-theme'), false);
});

test('homepage styles are separately loaded and do not redefine the shared app or global typography', () => {
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../web/home.css'), 'utf8');
  assert.match(html, /href="\.\/home\.css\?v=/);
  assert.ok(html.indexOf('./home.css') > html.indexOf('./styles.css'));
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|:root|\.app|\.button|h1|h2|button|input)\s*\{/);
  assert.doesNotMatch(css, /@media\s*\(min-width/);
  assert.match(css, /width: min\(100%, 480px\)/);
  assert.match(css, /font-size: 18px/);
});
