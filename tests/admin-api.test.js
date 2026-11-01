const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../functions/api/admin/[[path]].js"), "utf8");
const handler = import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`).then((module) => module.onRequest);

class AdminMemoryD1 {
  attempts = new Map();
  archives = new Map();
  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() {
        if (sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
        if (sql.startsWith("INSERT INTO admin_login_attempts")) {
          const [key, now, cutoff] = this.values;
          const previous = db.attempts.get(key);
          db.attempts.set(key, previous && previous.at > cutoff ? { at: previous.at, attempts: previous.attempts + 1 } : { at: now, attempts: 1 });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM admin_login_attempts")) { db.attempts.delete(this.values[0]); return { meta: { changes: 1 } }; }
        throw new Error(`unsupported ${sql}`);
      },
      async first() {
        if (sql.startsWith("SELECT attempts")) return db.attempts.get(this.values[0]) || null;
        if (sql.startsWith("SELECT data FROM game_archives")) return db.archives.get(this.values[0]) || null;
        throw new Error(`unsupported ${sql}`);
      },
      async all() {
        if (sql.startsWith("SELECT id, room_id")) return { results: [...db.archives.entries()].map(([id]) => ({ id, room_id: "123456", board_id: "follow_neighbor", mode: "SYSTEM", phase: "NIGHT" })) };
        throw new Error(`unsupported ${sql}`);
      }
    };
  }
}

async function request(env, pathname, { method = "GET", body, cookie, ip = "203.0.113.10" } = {}) {
  const headers = { "CF-Connecting-IP": ip };
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";
  const response = await (await handler)({ env, request: new Request(`https://example.test${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined }) });
  return { status: response.status, cookie: response.headers.get("Set-Cookie"), body: await response.json() };
}

test("admin API is fail-closed, password protected, rate-limited and returns only authorized archives", async () => {
  const db = new AdminMemoryD1();
  const env = { DB: db, ADMIN_PASSWORD: "test-strong-password-123" };
  const archiveId = "a".repeat(32);
  db.archives.set(archiveId, { data: JSON.stringify({ roomId: "123456", assignments: [{ seat: 1, roleId: "wolf" }] }) });
  assert.equal((await request({ DB: db }, "/api/admin/archives")).status, 503);
  assert.equal((await request(env, "/api/admin/archives")).status, 401);
  for (let index = 0; index < 5; index += 1) assert.equal((await request(env, "/api/admin/login", { method: "POST", body: { password: "wrong" } })).status, 401);
  assert.equal((await request(env, "/api/admin/login", { method: "POST", body: { password: env.ADMIN_PASSWORD } })).status, 429);
  const login = await request(env, "/api/admin/login", { method: "POST", body: { password: env.ADMIN_PASSWORD }, ip: "203.0.113.11" });
  assert.equal(login.status, 200);
  assert.match(login.cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal(JSON.stringify(login.body).includes(env.ADMIN_PASSWORD), false);
  const cookie = login.cookie.split(";")[0];
  assert.equal((await request(env, "/api/admin/archives", { cookie })).body.archives.length, 1);
  assert.equal((await request(env, `/api/admin/archives/${archiveId}`, { cookie })).body.archive.assignments[0].roleId, "wolf");
  assert.equal((await request(env, "/api/admin/archives", { cookie: `${cookie}x` })).status, 401);
});
