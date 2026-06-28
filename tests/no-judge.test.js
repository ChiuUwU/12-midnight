const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");

const port = crypto.randomInt(40001, 50000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function post(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function getRoom(id, clientId, judgeToken = "") {
  const query = new URLSearchParams({ clientId, judgeToken });
  return (await (await fetch(`${baseUrl}/api/rooms/${id}?${query}`)).json()).room;
}

test.before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("server did not start");
});

test.after(() => {
  if (server) server.kill();
});

test("system mode keeps roles private and lets only the current role act", async () => {
  const controllerId = `controller-${Date.now()}`;
  const created = await post("/api/rooms", {
    clientId: controllerId,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const token = created.body.judgeToken;
  const controllerAuth = { clientId: controllerId, judgeToken: token };
  assert.equal(created.body.room.isController, true);
  assert.equal(created.body.room.isJudge, false);
  assert.deepEqual(created.body.room.assignments, []);

  const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `system-player-${index + 1}`, seat: index + 1 }));
  for (const player of players) {
    const seated = await post(`/api/rooms/${id}/seat`, player);
    assert.equal(seated.status, 200);
  }
  const dealt = await post(`/api/rooms/${id}/deal`, controllerAuth);
  assert.equal(dealt.status, 200);
  assert.deepEqual(dealt.body.room.assignments, []);
  assert.equal(dealt.body.room.isController, true);

  const playerRooms = [];
  for (const player of players) playerRooms.push(await getRoom(id, player.clientId));
  playerRooms.forEach((room) => assert.equal(room.assignments.length, 1));
  const villagerRoom = playerRooms.find((room) => room.assignments[0].roleId === "villager");
  assert.ok(villagerRoom);
  const villagerSeat = villagerRoom.assignments[0].seat;
  const hunterIndex = playerRooms.findIndex((room) => room.assignments[0].roleId === "hunter");
  const hunterSeat = playerRooms[hunterIndex].assignments[0].seat;
  const hunterPlayer = players[hunterIndex];
  const nonHunterPlayer = players.find((player) => player.clientId !== hunterPlayer.clientId);

  const started = await post(`/api/rooms/${id}/night-start`, controllerAuth);
  assert.equal(started.status, 200);
  assert.equal(started.body.room.systemNight.canControl, true);
  assert.equal((await post(`/api/rooms/${id}/night-finish`, controllerAuth)).status, 400);

  let checkedUnauthorized = false;
  let sawWitchContext = false;
  let seerResult = null;
  while (true) {
    const controllerRoom = await getRoom(id, controllerId, token);
    if (controllerRoom.systemNight.complete) break;
    const views = [];
    for (const player of players) views.push({ player, room: await getRoom(id, player.clientId) });
    const actor = views.find((item) => item.room.systemNight?.canAct);
    assert.ok(actor, `no actor for ${controllerRoom.systemNight.stepId}`);
    const step = actor.room.currentNightSteps[0];

    if (!checkedUnauthorized) {
      const outsider = views.find((item) => !item.room.systemNight?.canAct);
      const rejected = await post(`/api/rooms/${id}/night-action`, {
        clientId: outsider.player.clientId,
        targetSeats: [villagerSeat],
        skipped: false
      });
      assert.equal(rejected.status, 403);
      assert.equal(outsider.room.systemNight.stepId, "");
      assert.equal(outsider.room.systemNight.announcement, "夜间流程进行中");
      checkedUnauthorized = true;
    }

    if (step.id === "witch_action") {
      assert.equal(actor.room.systemNight.privateContext.wolfVictimSeat, hunterSeat);
      sawWitchContext = true;
    }
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (step.id === "wolves_kill") payload.targetSeats = [hunterSeat];
    else if (step.targetCount === 1) payload.targetSeats = [villagerSeat];
    const acted = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(acted.status, 200, `${step.id}: ${acted.body.error || "failed"}`);
    if (step.id === "seer_check") seerResult = acted.body.privateResult;
  }

  assert.equal(sawWitchContext, true);
  assert.deepEqual(seerResult, { kind: "CAMP", seat: villagerSeat, value: "GOOD" });
  const finished = await post(`/api/rooms/${id}/night-finish`, controllerAuth);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.room.systemDaybreakReady, true);
  assert.equal(finished.body.room.pendingNightResolution, null);

  const published = await post(`/api/rooms/${id}/system-publish-daybreak`, controllerAuth);
  assert.equal(published.status, 200);
  assert.match(published.body.announcement, new RegExp(`${hunterSeat}号`));
  assert.equal(published.body.room.systemDaybreakReady, false);
  assert.equal(published.body.room.latestPublicAnnouncement.text, published.body.announcement);
  const observerRoom = await getRoom(id, "observer");
  assert.deepEqual(observerRoom.deathRecords.at(-1).seats, [hunterSeat]);
  assert.equal(Object.hasOwn(observerRoom.deathRecords.at(-1), "reasons"), false);
  const hunterAfterDeath = await getRoom(id, hunterPlayer.clientId);
  assert.equal(hunterAfterDeath.myDeathSkill.seat, hunterSeat);
  assert.equal((await post(`/api/rooms/${id}/death-skill`, { clientId: nonHunterPlayer.clientId, seat: hunterSeat, targetSeat: 0 })).status, 403);
  assert.equal((await post(`/api/rooms/${id}/death-skill`, { clientId: hunterPlayer.clientId, seat: hunterSeat, targetSeat: 0 })).status, 200);
  assert.equal((await post(`/api/rooms/${id}/night-start`, controllerAuth)).status, 400);
  assert.equal((await post(`/api/rooms/${id}/exile-record`, { ...controllerAuth, noExile: true, seat: 0 })).status, 200);
  assert.equal((await post(`/api/rooms/${id}/night-start`, controllerAuth)).status, 200);
});

test("all complex boards can complete the first system-guided night", async () => {
  const boardIds = ["masquerade", "treasure_master", "mechanical_wolf_spirit_medium", "realm_of_trickery", "dawn_voyage"];
  for (const boardId of boardIds) {
    const controllerId = `controller-${boardId}-${Date.now()}`;
    const created = await post("/api/rooms", { clientId: controllerId, mode: "SYSTEM", boardId });
    const id = created.body.room.id;
    const token = created.body.judgeToken;
    const controllerAuth = { clientId: controllerId, judgeToken: token };
    const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `${boardId}-player-${index + 1}`, seat: index + 1 }));
    for (const player of players) assert.equal((await post(`/api/rooms/${id}/seat`, player)).status, 200);
    assert.equal((await post(`/api/rooms/${id}/deal`, controllerAuth)).status, 200);
    assert.equal((await post(`/api/rooms/${id}/night-start`, controllerAuth)).status, 200);

    while (true) {
      const controllerRoom = await getRoom(id, controllerId, token);
      if (controllerRoom.systemNight.complete) break;
      let actor = null;
      for (const player of players) {
        const room = await getRoom(id, player.clientId);
        if (room.systemNight?.canAct) {
          actor = { player, room };
          break;
        }
      }
      assert.ok(actor, `${boardId}: no acting player for ${controllerRoom.systemNight.stepId}`);
      const step = actor.room.currentNightSteps[0];
      let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
      if (step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
      else if (step.id === "siren_wind") payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false, windDirection: "calm" };
      else if (step.id === "treasure_pick") payload.cardRoleId = actor.room.assignments[0].abilityState.treasureCards[0];
      else if (step.id === "treasure_skill") {
        const card = actor.room.systemNight.privateContext.treasureCardRoleId;
        const canTarget = ["spirit_medium", "dreamer", "poisoner"].includes(card) || (card === "wolf" && actor.room.systemNight.privateContext.treasureWolfEligible);
        payload.skipped = !canTarget;
        payload.targetSeats = canTarget ? [1] : [];
      } else if (step.targetCount === 1) payload.targetSeats = [1];
      else if (step.targetCount === 2) payload.targetSeats = [1, 2];
      else if (step.targetCount === 3) payload.targetSeats = [1, 2, 3];
      const acted = await post(`/api/rooms/${id}/night-action`, payload);
      assert.equal(acted.status, 200, `${boardId}/${step.id}: ${acted.body.error || "failed"}`);
    }
    assert.equal((await post(`/api/rooms/${id}/night-finish`, controllerAuth)).status, 200, boardId);
  }
});
