const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let DatabaseSync;
try { ({ DatabaseSync } = require("node:sqlite")); } catch { /* Node 18/20 do not provide the optional SQLite test runtime. */ }
const { pathToFileURL } = require("node:url");

function loadFunction(relative) {
  const file = path.resolve(__dirname, "..", relative);
  const source = fs.readFileSync(file, "utf8").replace(/from "\.\.\/\.\.\/\.\.\/web\/([^"]+)"/g, (_, dependency) => `from "${pathToFileURL(path.resolve(__dirname, "../web", dependency)).href}"`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`).then((module) => module.onRequest);
}

class SQLiteD1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("CREATE TABLE rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  }
  prepare(sql) {
    const database = this.db;
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async run() { const result = database.prepare(sql).run(...this.args); return { meta: { changes: Number(result.changes) } }; },
      async first() { return database.prepare(sql).get(...this.args) || null; },
      async all() { return { results: database.prepare(sql).all(...this.args) }; }
    };
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.db.exec("COMMIT");
      return results;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}

test("Pages persists live and finished archives atomically in SQLite, accessible only after admin login", { skip: !DatabaseSync && "node:sqlite requires a newer Node version" }, async () => {
  const roomHandler = await loadFunction("functions/api/rooms/[[path]].js");
  const adminHandler = await loadFunction("functions/api/admin/[[path]].js");
  const env = { DB: new SQLiteD1(), ADMIN_PASSWORD: "test-strong-password-123" };
  async function call(handler, pathname, body, cookie) {
    const headers = { "CF-Connecting-IP": "203.0.113.12" };
    if (cookie) headers.Cookie = cookie;
    if (body) headers["Content-Type"] = "application/json";
    const request = new Request(`https://example.test${pathname}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    const response = await handler({ request, env });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("Set-Cookie") };
  }
  const created = await call(roomHandler, "/api/rooms", { clientId: "judge", mode: "JUDGE", boardId: "pre_witch_hunter_idiot_mixed" });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const auth = { clientId: "judge", judgeToken: created.body.judgeToken };
  for (let seat = 1; seat <= 12; seat += 1) assert.equal((await call(roomHandler, `/api/rooms/${id}/seat`, { clientId: `player-${seat}`, seat })).status, 200);
  const dealt = await call(roomHandler, `/api/rooms/${id}/deal`, auth);
  assert.equal(dealt.status, 200, JSON.stringify(dealt.body));
  const mixedSeat = dealt.body.room.assignments.find((item) => item.roleId === "mixed_blood").seat;
  assert.equal((await call(roomHandler, `/api/rooms/${id}/night-start`, auth)).status, 200);
  assert.equal((await call(roomHandler, `/api/rooms/${id}/night-action`, { ...auth, targetSeats: [mixedSeat === 1 ? 2 : 1] })).status, 200);
  const archivedRow = env.DB.db.prepare("SELECT id, phase, data FROM game_archives").get();
  assert.equal(archivedRow.phase, "NIGHT");
  const snapshot = JSON.parse(archivedRow.data);
  assert.equal(snapshot.assignments.length, 12);
  assert.equal(snapshot.nightActions.length, 1);
  assert.equal(archivedRow.data.includes(auth.judgeToken), false);
  assert.equal(archivedRow.data.includes("player-1"), false);
  assert.equal((await call(adminHandler, "/api/admin/archives")).status, 401);
  const login = await call(adminHandler, "/api/admin/login", { password: env.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.cookie.split(";")[0];
  const detail = await call(adminHandler, `/api/admin/archives/${archivedRow.id}`, null, cookie);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.archive.nightActions.length, 1);
  assert.equal((await call(roomHandler, `/api/rooms/${id}/game-end`, auth)).status, 200);
  assert.equal(env.DB.db.prepare("SELECT phase FROM game_archives WHERE id = ?").get(archivedRow.id).phase, "GAME_OVER");
  env.DB.db.close();
});
