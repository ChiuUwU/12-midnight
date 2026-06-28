const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const {
  calculateNightResolution,
  calculateSuggestedDeaths,
  getDeathSkillResolution
} = require("../web/night-resolution");

const port = crypto.randomInt(20000, 40000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("server did not start");
}

async function post(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  server = require("node:child_process").spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: "pipe"
  });
  await waitForServer();
});

test.after(() => {
  if (server) server.kill();
});

async function runMechanicalNight(id, clientId, judgeToken, { wolfTarget = 3, poisonSeat = 0, useAntidote = false } = {}) {
  const auth = { clientId, judgeToken };
  let response = await post(`/api/rooms/${id}/night-start`, auth);
  assert.equal(response.status, 200);
  while (true) {
    const room = response.body.room;
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) break;
    const villagerSeat = room.assignments.find((item) => item.roleId === "villager" && item.alive !== false)?.seat || 1;
    let payload = { ...auth, targetSeats: [], skipped: false };
    if (step.id === "guard_guard") payload.targetSeats = [room.night === 1 ? 8 : 9];
    else if (step.id === "wolves_kill") payload.targetSeats = [wolfTarget];
    else if (step.id === "witch_action") payload = { ...auth, antidoteUsed: useAntidote, poisonTargetSeat: poisonSeat };
    else if (["mechanical_guard", "mechanical_poison", "mechanical_kill"].includes(step.id)) payload.skipped = true;
    else if (["mechanical_check", "spirit_medium_check"].includes(step.id)) payload.targetSeats = [1];
    else if (step.id === "mechanical_mimic") payload.targetSeats = [villagerSeat];
    response = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(response.status, 200, `${step.id}: ${response.body.error || "failed"}`);
  }
  response = await post(`/api/rooms/${id}/night-finish`, auth);
  assert.equal(response.status, 200);
  return response.body.room;
}

async function newMechanicalRoom() {
  const clientId = `client-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, boardId: "mechanical_wolf_spirit_medium" });
  const id = created.body.room.id;
  const judgeToken = created.body.judgeToken;
  const auth = { clientId, judgeToken };
  await post(`/api/rooms/${id}/fill-test`, auth);
  await post(`/api/rooms/${id}/deal`, auth);
  await runMechanicalNight(id, clientId, judgeToken, { useAntidote: true });
  await post(`/api/rooms/${id}/sheriff-candidates`, { ...auth, seats: [1] });
  await post(`/api/rooms/${id}/sheriff-withdraw`, { ...auth, seats: [1] });
  const death = await post(`/api/rooms/${id}/death-record`, { ...auth, seats: [] });
  assert.equal(death.status, 200);
  return { clientId, id, judgeToken };
}

test("backend keeps explicit reasons private and stores authoritative fallback reasons", async () => {
  const { clientId, id, judgeToken } = await newMechanicalRoom();
  await runMechanicalNight(id, clientId, judgeToken, { wolfTarget: 7, poisonSeat: 9 });
  const auth = { clientId, judgeToken };
  const recorded = await post(`/api/rooms/${id}/death-record`, {
    ...auth,
    seats: [7, 9],
    reasons: { "7": [" custom ", "custom", 7], "12": ["ignored"] }
  });
  assert.equal(recorded.status, 200);
  const record = recorded.body.room.deathRecords.at(-1);
  assert.deepEqual(record.reasons, { "7": ["custom"], "9": ["女巫毒"] });
  assert.equal(recorded.body.room.pendingNightResolution, null);

  const publicRoom = await (await fetch(`${baseUrl}/api/rooms/${id}?clientId=player`)).json();
  assert.equal(Object.hasOwn(publicRoom.room.deathRecords.at(-1), "reasons"), false);
  assert.equal(publicRoom.room.pendingNightResolution, null);
});

test("backend blocks the next night until daybreak resolution is confirmed", async () => {
  const { clientId, id, judgeToken } = await newMechanicalRoom();
  await runMechanicalNight(id, clientId, judgeToken, { wolfTarget: 4 });
  const blocked = await post(`/api/rooms/${id}/night-start`, { clientId, judgeToken });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.error, /天亮死亡名单/);
  const recorded = await post(`/api/rooms/${id}/death-record`, { clientId, judgeToken, seats: [4] });
  assert.deepEqual(recorded.body.room.deathRecords.at(-1).reasons, { "4": ["狼刀"] });
});

test("backend resolves hunter shot and publishes an exiled idiot", async () => {
  const clientId = `skills-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, boardId: "pre_witch_hunter_idiot_mixed" });
  const id = created.body.room.id;
  const judgeToken = created.body.judgeToken;
  const auth = { clientId, judgeToken };
  await post(`/api/rooms/${id}/fill-test`, auth);
  let response = await post(`/api/rooms/${id}/deal`, auth);
  const hunterSeat = response.body.room.assignments.find((item) => item.roleId === "hunter").seat;
  const idiotSeat = response.body.room.assignments.find((item) => item.roleId === "idiot").seat;
  const shotTarget = response.body.room.assignments.find((item) => item.roleId === "villager").seat;
  response = await post(`/api/rooms/${id}/night-start`, auth);
  while (true) {
    const room = response.body.room;
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) break;
    let payload = { ...auth, targetSeats: [], skipped: false };
    if (["hybrid_choose", "mixed_blood_model"].includes(step.id)) payload.targetSeats = [shotTarget];
    else if (step.id === "wolves_kill") payload.targetSeats = [hunterSeat];
    else if (step.id === "witch_action") payload = { ...auth, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (step.id === "seer_check") payload.targetSeats = [shotTarget];
    response = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(response.status, 200, `${step.id}: ${response.body.error || "failed"}`);
  }
  await post(`/api/rooms/${id}/night-finish`, auth);
  await post(`/api/rooms/${id}/sheriff-candidates`, { ...auth, seats: [1] });
  await post(`/api/rooms/${id}/sheriff-withdraw`, { ...auth, seats: [1] });
  const death = await post(`/api/rooms/${id}/death-record`, { ...auth, seats: [hunterSeat] });
  assert.equal(death.body.room.pendingDeathSkills[0].seat, hunterSeat);
  const shot = await post(`/api/rooms/${id}/death-skill`, { ...auth, seat: hunterSeat, targetSeat: shotTarget });
  assert.equal(shot.status, 200);
  assert.equal(shot.body.room.assignments.find((item) => item.seat === shotTarget).alive, false);
  assert.equal(shot.body.room.pendingDeathSkills.length, 0);

  const exile = await post(`/api/rooms/${id}/exile-record`, { ...auth, seat: idiotSeat, noExile: false });
  assert.equal(exile.status, 200);
  const publicRoom = await (await fetch(`${baseUrl}/api/rooms/${id}?clientId=observer`)).json();
  assert.deepEqual(publicRoom.room.publicReveals, [{ seat: idiotSeat, roleId: "idiot" }]);
});

function resolutionRoom(boardId, actions, extra = {}) {
  return {
    boardId,
    night: 2,
    nightActions: actions,
    assignments: Array.from({ length: 12 }, (_, index) => ({
      seat: index + 1,
      roleId: index === 0 ? "witch" : "villager",
      camp: "GOOD",
      alive: true
    })),
    ...extra
  };
}

test("calculator derives knife, poison and same-guard-save deaths", () => {
  const ordinary = resolutionRoom("pre_witch_hunter_idiot_mixed", [
    { night: 2, stepId: "wolves_kill", targetSeats: [3] },
    { night: 2, stepId: "witch_action", antidoteUsed: false, poisonTargetSeat: 5 }
  ]);
  assert.deepEqual(calculateSuggestedDeaths(ordinary), [
    { seat: 3, reasons: ["狼刀"] },
    { seat: 5, reasons: ["女巫毒"] }
  ]);

  const guardedAndSaved = resolutionRoom("mechanical_wolf_spirit_medium", [
    { night: 2, stepId: "guard_guard", targetSeats: [3] },
    { night: 2, stepId: "wolves_kill", targetSeats: [3] },
    { night: 2, stepId: "witch_action", antidoteUsed: true, antidoteTargetSeat: 3, poisonTargetSeat: 0 }
  ]);
  assert.deepEqual(calculateSuggestedDeaths(guardedAndSaved), [{ seat: 3, reasons: ["同守同救"] }]);
});

test("calculator applies Dawn Voyage wind and drowning", () => {
  const room = resolutionRoom("dawn_voyage", [
    { night: 2, stepId: "wolves_kill", targetSeats: [2] }
  ], { windDirection: "tailwind", boardedSeat: 4 });
  assert.deepEqual(calculateSuggestedDeaths(room), [{ seat: 3, reasons: ["溺亡", "狼刀"] }]);
});

test("calculator resolves dance pool and mechanical guard reflection", () => {
  const danceRoom = resolutionRoom("masquerade", [
    { night: 2, stepId: "dancer_dance", targetSeats: [1, 3, 4] },
    { night: 2, stepId: "mask_give", targetSeats: [1] },
    { night: 2, stepId: "wolves_kill", targetSeats: [3] }
  ], {
    assignments: [
      { seat: 1, roleId: "dancer", camp: "GOOD", alive: true },
      { seat: 2, roleId: "villager", camp: "GOOD", alive: true },
      { seat: 3, roleId: "wolf", camp: "WOLF", alive: true },
      { seat: 4, roleId: "villager", camp: "GOOD", alive: true }
    ]
  });
  assert.deepEqual(calculateSuggestedDeaths(danceRoom), [{ seat: 4, reasons: ["舞池结算"] }]);

  const mechanical = resolutionRoom("mechanical_wolf_spirit_medium", [
    { night: 2, stepId: "wolves_kill", targetSeats: [5] },
    { night: 2, stepId: "witch_action", poisonTargetSeat: 5 },
    { night: 2, stepId: "mechanical_guard", targetSeats: [5] }
  ], {
    assignments: [
      { seat: 1, roleId: "witch", camp: "GOOD", alive: true },
      { seat: 5, roleId: "villager", camp: "GOOD", alive: true }
    ]
  });
  assert.deepEqual(calculateSuggestedDeaths(mechanical), [{ seat: 1, reasons: ["机械守卫弹毒"] }]);
});

test("calculator separates masked delayed death and treasure skills", () => {
  const delayed = resolutionRoom("treasure_master", [
    { night: 2, stepId: "wolves_kill", targetSeats: [6] }
  ], { assignments: [{ seat: 6, roleId: "masked_man", camp: "GOOD", alive: true }] });
  assert.deepEqual(calculateNightResolution(delayed), {
    deaths: [],
    delayedDeaths: [{ seat: 6, reasons: ["狼刀"], trigger: "AFTER_SPEECH" }]
  });

  const treasure = resolutionRoom("treasure_master", [
    { night: 2, stepId: "treasure_skill", cardRoleId: "poisoner", targetSeats: [7] }
  ]);
  assert.deepEqual(calculateSuggestedDeaths(treasure), [{ seat: 7, reasons: ["毒师毒"] }]);
});

test("death skills enforce poison, last-god and last-wolf restrictions", () => {
  const room = resolutionRoom("pre_witch_hunter_idiot_mixed", [], {
    assignments: [
      { seat: 1, roleId: "hunter", camp: "GOOD", alive: false },
      { seat: 2, roleId: "seer", camp: "GOOD", alive: true },
      { seat: 3, roleId: "wolf_king", camp: "WOLF", alive: false },
      { seat: 4, roleId: "wolf", camp: "WOLF", alive: true }
    ]
  });
  assert.equal(getDeathSkillResolution(room, { seat: 1, phase: "DAYBREAK", reasons: ["狼刀"] }).eligible, true);
  assert.match(getDeathSkillResolution(room, { seat: 1, phase: "DAYBREAK", reasons: ["女巫毒"] }).reason, /毒杀/);
  assert.equal(getDeathSkillResolution(room, { seat: 3, phase: "EXILE" }).eligible, true);
  room.assignments[1].alive = false;
  room.assignments[3].alive = false;
  assert.match(getDeathSkillResolution(room, { seat: 1, phase: "EXILE" }).reason, /最后一神/);
  assert.match(getDeathSkillResolution(room, { seat: 3, phase: "EXILE" }).reason, /最后一狼/);
});
