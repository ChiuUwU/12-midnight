const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

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
  throw new Error("local server did not start");
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  await waitForServer();
});

test.after(() => {
  if (server) server.kill();
});

test("dawn voyage preserves wind rules across undo, witch action and daybreak", async () => {
  const created = await post("/api/rooms", { clientId: "audit-judge", boardId: "dawn_voyage", mode: "JUDGE" });
  assert.equal(created.status, 200);
  const roomId = created.body.room.id;
  const auth = { clientId: "audit-judge", judgeToken: created.body.judgeToken };
  const roomPath = `/api/rooms/${roomId}`;

  assert.equal((await post(`${roomPath}/fill-test`, auth)).status, 200);
  const dealt = await post(`${roomPath}/deal`, auth);
  assert.equal(dealt.status, 200);
  const witchSeat = dealt.body.room.assignments.find((assignment) => assignment.roleId === "witch").seat;
  const killSeat = witchSeat === 2 ? 3 : 2;
  const poisonSeat = killSeat === 4 ? 5 : 4;

  assert.equal((await post(`${roomPath}/night-start`, auth)).status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, windDirection: "tailwind", targetSeats: [] })).status, 200);

  const undoneWind = await post(`${roomPath}/night-undo`, auth);
  assert.equal(undoneWind.status, 200);
  assert.equal(undoneWind.body.room.windDirection, "calm");
  assert.equal(undoneWind.body.room.lastWindDirection, "calm");
  assert.equal(undoneWind.body.room.currentNightSteps[undoneWind.body.room.currentNightStepIndex].id, "siren_wind");

  assert.equal((await post(`${roomPath}/night-action`, { ...auth, windDirection: "tailwind", targetSeats: [] })).status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, targetSeats: [killSeat], skipped: false })).status, 200);

  const doublePotion = await post(`${roomPath}/night-action`, { ...auth, antidoteUsed: true, poisonTargetSeat: poisonSeat });
  assert.equal(doublePotion.status, 400);
  assert.match(doublePotion.body.error, /不能同时使用/);

  assert.equal((await post(`${roomPath}/night-action`, { ...auth, antidoteUsed: true, poisonTargetSeat: 0 })).status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, targetSeats: [1], skipped: false })).status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, targetSeats: [], skipped: false })).status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, targetSeats: [], skipped: false })).status, 200);
  assert.equal((await post(`${roomPath}/night-finish`, auth)).status, 200);

  const playerResponse = await fetch(`${baseUrl}${roomPath}?clientId=test-1`);
  const playerRoom = (await playerResponse.json()).room;
  assert.equal(playerRoom.announcedWindDirection, "tailwind");
  assert.equal(playerRoom.windDirection, "");
  assert.equal(playerRoom.boardedSeat, 0);

  const secondNight = await post(`${roomPath}/night-start`, auth);
  assert.equal(secondNight.status, 200);
  assert.equal((await post(`${roomPath}/night-action`, { ...auth, windDirection: "headwind", targetSeats: [] })).status, 200);
  const afterWind = await fetch(`${baseUrl}${roomPath}?clientId=${auth.clientId}&judgeToken=${auth.judgeToken}`).then((response) => response.json());
  const captainStep = afterWind.room.currentNightSteps[afterWind.room.currentNightStepIndex];
  assert.equal(captainStep.id, "captain_board");
  const boardTarget = captainStep.allowedSeats[0];
  const boarded = await post(`${roomPath}/night-action`, { ...auth, targetSeats: [boardTarget], skipped: false });
  assert.equal(boarded.body.room.boardedSeat, boardTarget);

  const undoneBoard = await post(`${roomPath}/night-undo`, auth);
  assert.equal(undoneBoard.status, 200);
  assert.equal(undoneBoard.body.room.boardedSeat, 0);
  assert.equal(undoneBoard.body.room.currentNightSteps[undoneBoard.body.room.currentNightStepIndex].id, "captain_board");
});

test("remote first-night flows include each board's identity confirmation steps", async () => {
  const expectedConfirmations = {
    pre_witch_hunter_idiot_mixed: ["hunter_confirm", "idiot_confirm"],
    masquerade: ["dancer_confirm", "idiot_confirm"],
    treasure_master: ["hunter_confirm", "masked_man_confirm"],
    mechanical_wolf_spirit_medium: ["hunter_confirm"],
    realm_of_trickery: ["order_prince_confirm"],
    dawn_voyage: ["captain_confirm", "idiot_confirm"]
  };

  for (const [boardId, expectedSteps] of Object.entries(expectedConfirmations)) {
    const clientId = `audit-${boardId}`;
    const created = await post("/api/rooms", { clientId, boardId, mode: "JUDGE" });
    const roomId = created.body.room.id;
    const auth = { clientId, judgeToken: created.body.judgeToken };
    const roomPath = `/api/rooms/${roomId}`;
    await post(`${roomPath}/fill-test`, auth);
    await post(`${roomPath}/deal`, auth);
    const started = await post(`${roomPath}/night-start`, auth);
    const stepIds = started.body.room.currentNightSteps.map((step) => step.id);
    expectedSteps.forEach((stepId) => assert.ok(stepIds.includes(stepId), `${boardId} missing ${stepId}`));
  }
});
