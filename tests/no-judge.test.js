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

async function createSystemRoom(suffix) {
  const controllerId = `controller-${suffix}-${Date.now()}`;
  const created = await post("/api/rooms", {
    clientId: controllerId,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200);
  const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `${suffix}-player-${index + 1}`, seat: index + 1 }));
  for (const player of players) assert.equal((await post(`/api/rooms/${created.body.room.id}/seat`, player)).status, 200);
  const controllerAuth = { clientId: controllerId, judgeToken: created.body.judgeToken };
  assert.equal((await post(`/api/rooms/${created.body.room.id}/deal`, controllerAuth)).status, 200);
  const views = [];
  for (const player of players) views.push({ player, room: await getRoom(created.body.room.id, player.clientId) });
  return { id: created.body.room.id, controllerId, controllerAuth, players, views };
}

async function findSystemActor(id, players) {
  for (const player of players) {
    const room = await getRoom(id, player.clientId);
    if (room.systemNight?.canAct) return { player, room, step: room.currentNightSteps[0] };
  }
  return null;
}

async function completeSafeSystemNight(game) {
  assert.equal((await post(`/api/rooms/${game.id}/night-start`, game.controllerAuth)).status, 200);
  while (true) {
    const controllerRoom = await getRoom(game.id, game.controllerId, game.controllerAuth.judgeToken);
    if (controllerRoom.systemNight.complete) break;
    const actor = await findSystemActor(game.id, game.players);
    assert.ok(actor, `no actor for ${controllerRoom.systemNight.stepId}`);
    const fallbackSeat = actor.room.aliveSeats.find((seat) => seat !== actor.room.assignments[0].seat) || actor.room.aliveSeats[0];
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (actor.step.id === "wolves_kill") payload.skipped = true;
    else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (actor.step.targetCount > 0) payload.targetSeats = Array.from({ length: actor.step.targetCount }, (_, index) => actor.room.aliveSeats[(actor.room.aliveSeats.indexOf(fallbackSeat) + index) % actor.room.aliveSeats.length]);
    const acted = await post(`/api/rooms/${game.id}/night-action`, payload);
    assert.equal(acted.status, 200, `${actor.step.id}: ${acted.body.error || "failed"}`);
  }
  assert.equal((await post(`/api/rooms/${game.id}/night-finish`, game.controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${game.id}/system-publish-daybreak`, game.controllerAuth)).status, 200);
}

test.before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", SYSTEM_STEP_ANNOUNCEMENT_DELAY_MS: "0" },
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

test("an ownerless seat request cannot create a phantom occupant", async () => {
  const created = await post("/api/rooms", {
    clientId: `phantom-controller-${Date.now()}`,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const invalid = await post(`/api/rooms/${id}/seat`, { seat: 7 });
  assert.equal(invalid.status, 400);
  const observer = await getRoom(id, "phantom-observer");
  assert.equal(observer.seats.find((seat) => seat.seat === 7).occupied, false);
});

test("public room responses never expose player credentials", async () => {
  const game = await createSystemRoom("private-seat-token");
  const observer = await getRoom(game.id, "unseated-observer");
  const serialized = JSON.stringify(observer);
  for (const player of game.players) assert.equal(serialized.includes(player.clientId), false);
  observer.seats.forEach((seat) => {
    assert.equal(Object.hasOwn(seat, "clientId"), false);
    assert.equal(Object.hasOwn(seat, "userId"), false);
  });
  assert.equal(observer.mySeat, null);
  const playerRoom = await getRoom(game.id, game.players[0].clientId);
  assert.equal(Object.hasOwn(playerRoom.mySeat, "clientId"), false);
  assert.equal(Object.hasOwn(playerRoom.mySeat, "userId"), false);
});

test("judge-code claims lock after repeated failures", async () => {
  const controllerId = `judge-lock-${Date.now()}`;
  const created = await post("/api/rooms", {
    clientId: controllerId,
    mode: "JUDGE",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rejected = await post(`/api/rooms/${id}/judge-claim`, { clientId: `attacker-${attempt}`, judgeCode: "0000" });
    assert.equal(rejected.status, 403);
  }
  const locked = await post(`/api/rooms/${id}/judge-claim`, { clientId: "attacker-final", judgeCode: "0000" });
  assert.equal(locked.status, 429);
  const validDuringLock = await post(`/api/rooms/${id}/judge-claim`, { clientId: "legitimate-judge", judgeCode: created.body.room.judgeCode });
  assert.equal(validDuringLock.status, 429);
});

test("system mode publicly reveals an exiled idiot as white god", async () => {
  const game = await createSystemRoom("white-god-reveal");
  const idiot = game.views.find((item) => item.room.assignments[0].roleId === "idiot");
  assert.ok(idiot);
  await completeSafeSystemNight(game);
  const exiled = await post(`/api/rooms/${game.id}/exile-record`, {
    ...game.controllerAuth,
    seat: idiot.room.assignments[0].seat,
    noExile: false
  });
  assert.equal(exiled.status, 200);
  assert.equal(exiled.body.room.latestPublicAnnouncement.text, `${idiot.room.assignments[0].seat}号玩家出局，翻牌为白神。`);
  assert.deepEqual(exiled.body.room.publicReveals, [{ seat: idiot.room.assignments[0].seat, roleId: "idiot" }]);
});

test("system witch rules reject first-night self-save and invalid potion reuse", async () => {
  const selfSave = await createSystemRoom("witch-self-save");
  const witchView = selfSave.views.find((item) => item.room.assignments[0].roleId === "witch");
  assert.ok(witchView);
  const witchSeat = witchView.room.assignments[0].seat;
  assert.equal((await post(`/api/rooms/${selfSave.id}/night-start`, selfSave.controllerAuth)).status, 200);
  while (true) {
    const actor = await findSystemActor(selfSave.id, selfSave.players);
    assert.ok(actor);
    if (actor.step.id === "witch_action") {
      const rejected = await post(`/api/rooms/${selfSave.id}/night-action`, {
        clientId: actor.player.clientId,
        antidoteUsed: true,
        poisonTargetSeat: 0
      });
      assert.equal(rejected.status, 400);
      assert.match(rejected.body.error, /首夜不能自救/);
      break;
    }
    const payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (actor.step.id === "wolves_kill") payload.targetSeats = [witchSeat];
    else if (actor.step.targetCount > 0) payload.targetSeats = [selfSave.views.find((item) => item.player.clientId !== actor.player.clientId).room.assignments[0].seat];
    assert.equal((await post(`/api/rooms/${selfSave.id}/night-action`, payload)).status, 200);
  }

  const potionReuse = await createSystemRoom("witch-potion-reuse");
  const secondWitch = potionReuse.views.find((item) => item.room.assignments[0].roleId === "witch");
  const exileTarget = potionReuse.views.find((item) => item.room.assignments[0].roleId === "villager").room.assignments[0].seat;
  const savedTarget = potionReuse.views.find((item) => !["witch", "villager"].includes(item.room.assignments[0].roleId)).room.assignments[0].seat;
  assert.equal((await post(`/api/rooms/${potionReuse.id}/night-start`, potionReuse.controllerAuth)).status, 200);
  while (true) {
    const controllerRoom = await getRoom(potionReuse.id, potionReuse.controllerId, potionReuse.controllerAuth.judgeToken);
    if (controllerRoom.systemNight.complete) break;
    const actor = await findSystemActor(potionReuse.id, potionReuse.players);
    assert.ok(actor);
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (actor.step.id === "wolves_kill") payload.targetSeats = [savedTarget];
    else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: true, poisonTargetSeat: 0 };
    else if (actor.step.targetCount > 0) payload.targetSeats = [exileTarget];
    assert.equal((await post(`/api/rooms/${potionReuse.id}/night-action`, payload)).status, 200);
  }
  assert.equal((await post(`/api/rooms/${potionReuse.id}/night-finish`, potionReuse.controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${potionReuse.id}/system-publish-daybreak`, potionReuse.controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${potionReuse.id}/exile-record`, { ...potionReuse.controllerAuth, noExile: false, seat: exileTarget })).status, 200);
  assert.equal((await post(`/api/rooms/${potionReuse.id}/night-start`, potionReuse.controllerAuth)).status, 200);
  while (true) {
    const actor = await findSystemActor(potionReuse.id, potionReuse.players);
    assert.ok(actor);
    if (actor.step.id === "witch_action") {
      const reused = await post(`/api/rooms/${potionReuse.id}/night-action`, {
        clientId: secondWitch.player.clientId,
        antidoteUsed: true,
        poisonTargetSeat: 0
      });
      assert.equal(reused.status, 400);
      assert.match(reused.body.error, /解药已经使用/);
      const poisonedDead = await post(`/api/rooms/${potionReuse.id}/night-action`, {
        clientId: secondWitch.player.clientId,
        antidoteUsed: false,
        poisonTargetSeat: exileTarget
      });
      assert.equal(poisonedDead.status, 400);
      assert.match(poisonedDead.body.error, /存活玩家/);
      break;
    }
    const payload = { clientId: actor.player.clientId, targetSeats: [], skipped: actor.step.allowSkip };
    if (!payload.skipped && actor.step.targetCount > 0) payload.targetSeats = [savedTarget];
    assert.equal((await post(`/api/rooms/${potionReuse.id}/night-action`, payload)).status, 200);
  }
});

test("system mode automatically ends after the final wolf is exiled", async () => {
  const game = await createSystemRoom("automatic-outcome");
  const wolfSeats = game.views
    .filter((item) => item.room.assignments[0].camp === "WOLF")
    .map((item) => item.room.assignments[0].seat);
  assert.equal(wolfSeats.length, 4);

  for (let index = 0; index < wolfSeats.length; index += 1) {
    assert.equal((await post(`/api/rooms/${game.id}/night-start`, game.controllerAuth)).status, 200);
    while (true) {
      const controllerRoom = await getRoom(game.id, game.controllerId, game.controllerAuth.judgeToken);
      if (controllerRoom.systemNight.complete) break;
      const actor = await findSystemActor(game.id, game.players);
      assert.ok(actor);
      let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
      if (actor.step.id === "wolves_kill") payload.skipped = true;
      else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
      else if (actor.step.id === "mixed_blood_model") payload.targetSeats = [wolfSeats[0]];
      else if (actor.step.targetCount > 0) payload.targetSeats = [actor.room.aliveSeats[0]];
      assert.equal((await post(`/api/rooms/${game.id}/night-action`, payload)).status, 200);
    }
    assert.equal((await post(`/api/rooms/${game.id}/night-finish`, game.controllerAuth)).status, 200);
    assert.equal((await post(`/api/rooms/${game.id}/system-publish-daybreak`, game.controllerAuth)).status, 200);
    const exiled = await post(`/api/rooms/${game.id}/exile-record`, {
      ...game.controllerAuth,
      noExile: false,
      seat: wolfSeats[index]
    });
    assert.equal(exiled.status, 200);
    if (index < wolfSeats.length - 1) assert.equal(exiled.body.room.phase, "DAY");
    else {
      assert.equal(exiled.body.room.phase, "GAME_OVER");
      assert.equal(exiled.body.room.gameOutcome.result, "GOOD_WIN");
      assert.equal(exiled.body.room.assignments.length, 12);
      assert.match(exiled.body.room.latestPublicAnnouncement.text, /好人阵营获胜/);
    }
  }
});

test("a system-mode wolf can self-destruct and immediately end the day", async () => {
  const game = await createSystemRoom("wolf-self-destruct");
  const wolf = game.views.find((item) => item.room.assignments[0].roleId === "wolf");
  const good = game.views.find((item) => item.room.assignments[0].camp === "GOOD");
  assert.ok(wolf);
  assert.ok(good);

  assert.equal((await post(`/api/rooms/${game.id}/night-start`, game.controllerAuth)).status, 200);
  while (true) {
    const controllerRoom = await getRoom(game.id, game.controllerId, game.controllerAuth.judgeToken);
    if (controllerRoom.systemNight.complete) break;
    const actor = await findSystemActor(game.id, game.players);
    assert.ok(actor);
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (actor.step.id === "wolves_kill") payload.skipped = true;
    else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (actor.step.id === "mixed_blood_model") payload.targetSeats = [wolf.room.assignments[0].seat];
    else if (actor.step.targetCount > 0) payload.targetSeats = [actor.room.aliveSeats[0]];
    assert.equal((await post(`/api/rooms/${game.id}/night-action`, payload)).status, 200);
  }
  assert.equal((await post(`/api/rooms/${game.id}/night-finish`, game.controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${game.id}/system-publish-daybreak`, game.controllerAuth)).status, 200);

  assert.equal((await post(`/api/rooms/${game.id}/wolf-self-destruct`, { clientId: good.player.clientId })).status, 403);
  const exploded = await post(`/api/rooms/${game.id}/wolf-self-destruct`, { clientId: wolf.player.clientId });
  assert.equal(exploded.status, 200);
  assert.equal(exploded.body.room.phase, "NIGHT");
  assert.equal(exploded.body.room.night, 2);
  assert.equal(exploded.body.room.publicReveals.some((item) => item.seat === wolf.room.assignments[0].seat), false);
  assert.match(exploded.body.room.latestPublicAnnouncement.text, /自爆/);
  const observer = await getRoom(game.id, "self-destruct-observer");
  assert.equal(observer.aliveSeats.includes(wolf.room.assignments[0].seat), false);
});

test("system controller transfer rotates authority and only permits the old controller to take a seat before dealing", async () => {
  const controllerId = `transfer-old-${Date.now()}`;
  const created = await post("/api/rooms", {
    clientId: controllerId,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const oldAuth = { clientId: controllerId, judgeToken: created.body.judgeToken };
  const started = await post(`/api/rooms/${id}/controller-transfer-start`, oldAuth);
  assert.equal(started.status, 200);
  assert.match(started.body.controllerTransferCode, /^\d{6}$/);
  const newControllerId = `transfer-new-${Date.now()}`;
  const claimed = await post(`/api/rooms/${id}/controller-transfer-claim`, {
    clientId: newControllerId,
    controllerTransferCode: started.body.controllerTransferCode
  });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.room.isController, true);
  assert.notEqual(claimed.body.judgeToken, oldAuth.judgeToken);
  assert.equal((await getRoom(id, controllerId, oldAuth.judgeToken)).isController, false);
  assert.equal((await post(`/api/rooms/${id}/seat`, { ...oldAuth, seat: 1 })).status, 200);

  const afterDeal = await createSystemRoom("transfer-after-deal");
  const transfer = await post(`/api/rooms/${afterDeal.id}/controller-transfer-start`, afterDeal.controllerAuth);
  const secondControllerId = `transfer-after-${Date.now()}`;
  const secondClaim = await post(`/api/rooms/${afterDeal.id}/controller-transfer-claim`, {
    clientId: secondControllerId,
    controllerTransferCode: transfer.body.controllerTransferCode
  });
  assert.equal(secondClaim.status, 200);
  assert.equal((await post(`/api/rooms/${afterDeal.id}/seat`, { ...afterDeal.controllerAuth, seat: 1 })).status, 400);
});

test("stale remote mutations are rejected before they can overwrite the first valid write", async () => {
  const created = await post("/api/rooms", {
    clientId: `revision-controller-${Date.now()}`,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  const id = created.body.room.id;
  const revision = created.body.room.revision;
  const first = await post(`/api/rooms/${id}/seat`, { clientId: `revision-a-${Date.now()}`, seat: 1, expectedRevision: revision });
  const second = await post(`/api/rooms/${id}/seat`, { clientId: `revision-b-${Date.now()}`, seat: 2, expectedRevision: revision });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  const observer = await getRoom(id, "revision-observer");
  assert.equal(observer.seats.find((seat) => seat.seat === 1).occupied, true);
  assert.equal(observer.seats.find((seat) => seat.seat === 2).occupied, false);
});

test("system timeout is optional, starts with the actionable step, and cannot be skipped early", async () => {
  const controllerId = `timeout-controller-${Date.now()}`;
  const created = await post("/api/rooms", {
    clientId: controllerId,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed",
    systemStepTimeoutSeconds: 60
  });
  const id = created.body.room.id;
  const controllerAuth = { clientId: controllerId, judgeToken: created.body.judgeToken };
  for (let seat = 1; seat <= 12; seat += 1) assert.equal((await post(`/api/rooms/${id}/seat`, { clientId: `timeout-player-${Date.now()}-${seat}`, seat })).status, 200);
  assert.equal((await post(`/api/rooms/${id}/deal`, controllerAuth)).status, 200);
  const started = await post(`/api/rooms/${id}/night-start`, controllerAuth);
  assert.equal(started.status, 200);
  assert.equal(started.body.room.systemNight.timeout.seconds, 60);
  assert.ok(started.body.room.systemNight.timeout.deadlineAt > Date.now());
  assert.equal((await post(`/api/rooms/${id}/system-timeout-skip`, controllerAuth)).status, 400);
});

test("all complex boards can complete two system-guided nights", async () => {
  const boardIds = ["masquerade", "treasure_master", "mechanical_wolf_spirit_medium", "realm_of_trickery", "dawn_voyage", "follow_neighbor"];
  const expectedSecondNightSteps = {
    masquerade: ["dancer_dance", "mask_check", "mask_give"],
    treasure_master: ["treasure_pick", "treasure_skill", "wolves_kill"],
    mechanical_wolf_spirit_medium: ["mechanical_guard", "mechanical_mimic"],
    realm_of_trickery: ["magician_swap", "trickster_swap"],
    dawn_voyage: ["siren_wind", "captain_board"],
    follow_neighbor: []
  };
  for (const boardId of boardIds) {
    const controllerId = `controller-${boardId}-${Date.now()}`;
    const created = await post("/api/rooms", { clientId: controllerId, mode: "SYSTEM", boardId });
    const id = created.body.room.id;
    const token = created.body.judgeToken;
    const controllerAuth = { clientId: controllerId, judgeToken: token };
    const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `${boardId}-player-${index + 1}`, seat: index + 1 }));
    for (const player of players) assert.equal((await post(`/api/rooms/${id}/seat`, player)).status, 200);
    assert.equal((await post(`/api/rooms/${id}/deal`, controllerAuth)).status, 200);
    const roleViews = [];
    for (const player of players) roleViews.push({ player, room: await getRoom(id, player.clientId) });
    const roleSeat = (roleId) => roleViews.find((item) => item.room.assignments[0].roleId === roleId)?.room.assignments[0].seat || 0;
    const goodSeats = roleViews.filter((item) => item.room.assignments[0].camp === "GOOD").map((item) => item.room.assignments[0].seat);
    let danceSeats = [];

    async function runNight(nightNumber) {
      assert.equal((await post(`/api/rooms/${id}/night-start`, controllerAuth)).status, 200);
      const stepIds = [];
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
        stepIds.push(step.id);
        const candidates = (step.allowedSeats?.length ? step.allowedSeats : actor.room.aliveSeats).filter(Boolean);
        let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
        if (step.id === "wolves_kill") payload.skipped = true;
        else if (["poisoner_poison", "mechanical_poison", "mechanical_kill"].includes(step.id)) payload.skipped = true;
        else if (step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
        else if (step.id === "siren_wind") payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false, windDirection: nightNumber === 1 ? "calm" : "tailwind" };
        else if (step.id === "treasure_pick") {
          const cards = actor.room.assignments[0].abilityState.treasureCards;
          payload.cardRoleId = nightNumber === 1 ? "villager" : cards.find((card) => !["wolf", "villager"].includes(card));
        } else if (step.id === "treasure_skill") {
          const card = actor.room.systemNight.privateContext.treasureCardRoleId;
          const requiredTarget = ["spirit_medium", "dreamer"].includes(card);
          payload.skipped = !requiredTarget;
          payload.targetSeats = requiredTarget ? [candidates[0]] : [];
        } else if (step.id === "mechanical_mimic" && nightNumber === 1) payload.targetSeats = [roleSeat("guard")];
        else if (step.id === "dancer_dance") {
          danceSeats = goodSeats.filter((seat) => candidates.includes(seat)).slice(0, 3);
          payload.targetSeats = danceSeats;
        } else if (step.id === "mask_check") payload.targetSeats = [danceSeats[0]];
        else if (step.id === "mask_give") payload.targetSeats = [candidates.find((seat) => !danceSeats.includes(seat))];
        else if (step.targetCount > 0) payload.targetSeats = candidates.slice(nightNumber - 1, nightNumber - 1 + step.targetCount);
        const acted = await post(`/api/rooms/${id}/night-action`, payload);
        assert.equal(acted.status, 200, `${boardId}/night${nightNumber}/${step.id}: ${acted.body.error || "failed"}`);
      }
      assert.equal((await post(`/api/rooms/${id}/night-finish`, controllerAuth)).status, 200, boardId);
      assert.equal((await post(`/api/rooms/${id}/system-publish-daybreak`, controllerAuth)).status, 200, boardId);
      return stepIds;
    }

    const firstNightSteps = await runNight(1);
    if (boardId === "follow_neighbor") assert.ok(firstNightSteps.includes("puppet_select"));
    assert.equal((await post(`/api/rooms/${id}/exile-record`, { ...controllerAuth, noExile: true, seat: 0 })).status, 200);
    const secondNightSteps = await runNight(2);
    expectedSecondNightSteps[boardId].forEach((stepId) => assert.ok(secondNightSteps.includes(stepId), `${boardId} missing ${stepId}`));
  }
});
