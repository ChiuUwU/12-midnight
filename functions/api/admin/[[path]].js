const COOKIE = "lastnight_admin";
const WINDOW_MS = 5 * 60 * 1000;
const SESSION_MS = 30 * 60 * 1000;
const encoder = new TextEncoder();

function respond(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders } });
}
function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unbase64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)), (character) => character.charCodeAt(0));
}
async function digest(value) { return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
async function sign(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function createSession(secret) {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Date.now() + SESSION_MS, nonce: base64url(nonce) })));
  return `${payload}.${base64url(await sign(secret, payload))}`;
}
async function validSession(request, secret) {
  const cookie = (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [payload, signature, extra] = cookie.slice(COOKIE.length + 1).split(".");
  if (!payload || !signature || extra) return false;
  try {
    const expected = await sign(secret, payload);
    if (!bytesEqual(expected, unbase64url(signature))) return false;
    const data = JSON.parse(new TextDecoder().decode(unbase64url(payload)));
    return Number.isFinite(data.exp) && data.exp > Date.now() && data.exp <= Date.now() + SESSION_MS;
  } catch { return false; }
}
async function countAttempt(env, request) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return null;
  const key = base64url(await digest(ip));
  const now = Date.now();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_login_attempts (id TEXT PRIMARY KEY, window_started_at INTEGER NOT NULL, attempts INTEGER NOT NULL)").run();
  await env.DB.prepare("INSERT INTO admin_login_attempts (id, window_started_at, attempts) VALUES (?, ?, 1) ON CONFLICT(id) DO UPDATE SET attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END, window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END").bind(key, now, now - WINDOW_MS, now - WINDOW_MS).run();
  const row = await env.DB.prepare("SELECT attempts FROM admin_login_attempts WHERE id = ?").bind(key).first();
  return { key, attempts: Number(row?.attempts || 0) };
}

export async function onRequest({ request, env }) {
  try {
    if (!env.DB || typeof env.ADMIN_PASSWORD !== "string" || env.ADMIN_PASSWORD.length < 12) return respond({ error: "管理员入口尚未配置" }, 503);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/api/admin/login" && request.method === "POST") {
      const attempt = await countAttempt(env, request);
      if (!attempt) return respond({ error: "无法确认请求来源" }, 403);
      if (attempt.attempts > 5) return respond({ error: "尝试次数过多，请五分钟后重试" }, 429);
      const text = await request.text();
      if (text.length > 2048) return respond({ error: "请求过长" }, 400);
      let body;
      try { body = JSON.parse(text); } catch { return respond({ error: "请求格式不正确" }, 400); }
      if (typeof body.password !== "string" || body.password.length > 256 || !bytesEqual(await digest(body.password), await digest(env.ADMIN_PASSWORD))) return respond({ error: "管理员密码错误" }, 401);
      await env.DB.prepare("DELETE FROM admin_login_attempts WHERE id = ?").bind(attempt.key).run();
      const token = await createSession(env.ADMIN_PASSWORD);
      return respond({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=${token}; Path=/api/admin; Max-Age=1800; HttpOnly; Secure; SameSite=Strict` });
    }
    if (path === "/api/admin/logout" && request.method === "POST") return respond({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });
    if (!(await validSession(request, env.ADMIN_PASSWORD))) return respond({ error: "请先登录管理员账号" }, 401);
    if (request.method !== "GET") return respond({ error: "方法不支持" }, 405);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS game_archives (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, board_id TEXT NOT NULL, mode TEXT NOT NULL, phase TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL)").run();
    if (path === "/api/admin/archives") {
      const offset = Math.min(1000000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
      const rows = await env.DB.prepare("SELECT id, room_id, board_id, mode, phase, created_at, updated_at FROM game_archives ORDER BY updated_at DESC LIMIT 50 OFFSET ?").bind(offset).all();
      return respond({ archives: rows.results || [], nextOffset: (rows.results || []).length === 50 ? offset + 50 : null });
    }
    const match = path.match(/^\/api\/admin\/archives\/([a-f0-9]{32})$/);
    if (match) {
      const row = await env.DB.prepare("SELECT data FROM game_archives WHERE id = ?").bind(match[1]).first();
      if (!row) return respond({ error: "对局档案不存在" }, 404);
      return respond({ archive: JSON.parse(row.data) });
    }
    return respond({ error: "接口不存在" }, 404);
  } catch { return respond({ error: "管理员服务不可用" }, 500); }
}
