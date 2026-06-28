const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const port = crypto.randomInt(20000, 40000);
const baseUrl = `http://127.0.0.1:${port}`;

let srv;
async function wait() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(baseUrl); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("not started");
}

async function post(p, body) {
  const r = await fetch(`${baseUrl}${p}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}

test.before(async () => {
  srv = require("node:child_process").spawn("node", ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "pipe"
  });
  await wait();
});

test.after(() => { if (srv) srv.kill(); });

// Run all 6 night steps for mechanical_wolf_spirit_medium (night 1 has hunter_confirm)
async function runNight1(id, c, t) {
  await post(`/api/rooms/${id}/night-start`, { clientId: c, judgeToken: t });
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [8], skipped: false }); // guard
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [3], skipped: false }); // wolf
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, antidoteUsed: true, poisonTargetSeat: 0 }); // witch save
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [5], skipped: false }); // mimic
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [1], skipped: false }); // spirit
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [], skipped: false }); // hunter_confirm
  await post(`/api/rooms/${id}/night-finish`, { clientId: c, judgeToken: t });
}

async function runNight2(id, c, t, wolfTarget, poisonSeat) {
  await post(`/api/rooms/${id}/night-start`, { clientId: c, judgeToken: t });
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [8], skipped: false }); // guard
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [wolfTarget], skipped: false }); // wolf
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, antidoteUsed: false, poisonTargetSeat: poisonSeat || 0 }); // witch
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [5], skipped: false }); // mimic
  await post(`/api/rooms/${id}/night-action`, { clientId: c, judgeToken: t, targetSeats: [1], skipped: false }); // spirit
  await post(`/api/rooms/${id}/night-finish`, { clientId: c, judgeToken: t });
}

async function newRoom() {
  const c = `c-${Date.now()}-${crypto.randomInt(10000)}`;
  const r = await post("/api/rooms", { clientId: c, boardId: "mechanical_wolf_spirit_medium" });
  const id = r.body.room.id;
  const t = r.body.judgeToken;
  await post(`/api/rooms/${id}/fill-test`, { clientId: c, judgeToken: t });
  await post(`/api/rooms/${id}/deal`, { clientId: c, judgeToken: t });
  await runNight1(id, c, t);
  // Sheriff + day 1 death (平安夜, antidote saved)
  await post(`/api/rooms/${id}/sheriff-candidates`, { clientId: c, judgeToken: t, seats: [1] });
  await post(`/api/rooms/${id}/death-record`, { clientId: c, judgeToken: t, seats: [] });
  return { clientId: c, id, token: t };
}

test("death record stores reasons on night 2", async () => {
  const { clientId: c, id, token: t } = await newRoom();
  console.log("Room ID:", id, "Token:", t.substring(0,8));
  await runNight2(id, c, t, 7, 9);
  // Check room state first
  const g = await (await fetch(`${baseUrl}/api/rooms/${id}?clientId=${c}&judgeToken=${t}`)).json();
  console.log("Phase:", g.room.phase, "Night:", g.room.night, "SheriffDone:", g.room.sheriffElectionDone);
  const r = await post(`/api/rooms/${id}/death-record`, {
    clientId: c, judgeToken: t, seats: [7, 9],
    reasons: { "7": ["狼刀"], "9": ["女巫毒"] }
  });
  assert.equal(r.status, 200);
  const last = r.body.room.deathRecords[r.body.room.deathRecords.length - 1];
  assert.ok(last.reasons);
  assert.deepEqual(last.seats, [7, 9]);
});

test("death record without reasons still works", async () => {
  const { clientId: c, id, token: t } = await newRoom();
  await runNight2(id, c, t, 4, 0);
  const r = await post(`/api/rooms/${id}/death-record`, {
    clientId: c, judgeToken: t, seats: [4]
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.room.deathRecords[r.body.room.deathRecords.length - 1].seats, [4]);
});
