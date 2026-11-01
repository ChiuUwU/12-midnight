const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { calculateNightResolution, getDeathSkillResolution } = require("../web/night-resolution");

const port = crypto.randomInt(20000, 30000);
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
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", SYSTEM_STEP_ANNOUNCEMENT_DELAY_MS: "0" },
    stdio: "ignore"
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("dark destruction test server did not start");
});

test.after(() => {
  if (server) server.kill();
});

test("Dark binding blocks ordinary and repeated-dream damage while Angel blessing still kills Lilith", () => {
  const assignments = [
    [1, "archangel", "GOOD"], [2, "cain", "GOOD"], [3, "witch", "GOOD"], [4, "dreamer", "GOOD"],
    [5, "wolf", "WOLF"], [6, "wolf_king", "WOLF"], [7, "lilith", "WOLF"], [8, "lia", "WOLF"],
    ...[9, 10, 11, 12].map((seat) => [seat, "villager", "GOOD"])
  ].map(([seat, roleId, camp]) => ({ seat, roleId, camp, alive: true }));
  const room = {
    boardId: "dark_destruction_2",
    night: 2,
    assignments,
    nightActions: [
      { night: 1, stepId: "dreamer_dream", targetSeats: [9] },
      { night: 2, stepId: "lilith_bind", targetSeats: [9] },
      { night: 2, stepId: "dreamer_dream", targetSeats: [9] },
      { night: 2, stepId: "wolves_kill", targetSeats: [9] },
      { night: 2, stepId: "witch_action", poisonTargetSeat: 9 },
      { night: 2, stepId: "archangel_bless", targetSeats: [7] }
    ]
  };
  assert.deepEqual(calculateNightResolution(room), {
    deaths: [{ seat: 7, reasons: ["天使长祝福"] }],
    delayedDeaths: []
  });
});

test("a bound wolf king cannot use its daytime death skill", () => {
  const room = { boardId: "dark_destruction_2", night: 1, assignments: [
    { seat: 1, roleId: "wolf_king", camp: "WOLF", alive: false },
    { seat: 2, roleId: "wolf", camp: "WOLF", alive: true }
  ], nightActions: [{ night: 1, stepId: "lilith_bind", targetSeats: [1] }] };
  assert.equal(getDeathSkillResolution(room, { seat: 1, phase: "SELF_DESTRUCT" }).eligible, false);
});

test('bound dreamer may select but neither protects nor causes repeated-dream death', () => {
  const room={boardId:'dark_destruction_2',night:2,assignments:[{seat:1,roleId:'dreamer',alive:true},{seat:2,roleId:'villager',alive:true},{seat:3,roleId:'wolf',alive:true}],nightActions:[
    {night:1,stepId:'dreamer_dream',targetSeats:[2]},
    {night:2,stepId:'lilith_bind',targetSeats:[1]},
    {night:2,stepId:'dreamer_dream',targetSeats:[2]},
    {night:2,stepId:'wolves_kill',targetSeats:[2]}
  ]};
  const deaths=calculateNightResolution(room).deaths;
  assert.deepEqual(deaths,[{seat:2,reasons:['狼刀']}]);
  room.nightActions[3].targetSeats=[1];
  assert.deepEqual(calculateNightResolution(room).deaths,[]);
});

test("judge night flow blocks a bound witch or archangel without blocking the wolf team's knife", async () => {
  const clientId = `dark-bind-roles-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, boardId: "dark_destruction_2" });
  const id = created.body.room.id;
  const auth = { clientId, judgeToken: created.body.judgeToken };
  await post(`/api/rooms/${id}/fill-test`, auth);
  const dealt = await post(`/api/rooms/${id}/deal`, auth);
  const seatFor = (role) => dealt.body.room.assignments.find((item) => item.roleId === role).seat;
  await post(`/api/rooms/${id}/night-start`, auth);
  for (const [role, omitted] of [["witch", "witch_action"], ["archangel", "archangel_bless"], ["wolf", null]]) {
    const result = await post(`/api/rooms/${id}/night-action`, { ...auth, targetSeats: [seatFor(role)] });
    assert.equal(result.status, 200);
    const steps = result.body.room.currentNightSteps.map((step) => step.id);
    assert.ok(steps.includes("wolves_kill"));
    if (omitted) assert.ok(!steps.includes(omitted), `${role} should not act while bound`);
    if (role !== "wolf") assert.equal((await post(`/api/rooms/${id}/night-undo`, auth)).status, 200);
  }
  let room = await getRoom(id, clientId, auth.judgeToken);
  while (room.currentNightSteps[room.currentNightStepIndex]) {
    const step = room.currentNightSteps[room.currentNightStepIndex];
    let payload = { ...auth, targetSeats: [], skipped: false };
    if (step.id === "dreamer_dream" || step.id === "lia_charge") payload.targetSeats = [seatFor("villager")];
    else if (step.id === "wolves_kill" || step.id === "archangel_bless" || step.id === "lia_fog") payload.skipped = true;
    else if (step.id === "witch_action") payload = { ...auth, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (step.id === "cain_check") payload.targetSeats = dealt.body.room.assignments.filter((item) => item.seat !== seatFor("cain")).slice(0, 2).map((item) => item.seat);
    const result = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(result.status, 200, `${step.id}: ${result.body.error || "failed"}`);
    room = result.body.room;
  }
  assert.equal((await post(`/api/rooms/${id}/night-finish`, auth)).status, 200);
  const rejected = await post(`/api/rooms/${id}/sheriff-election-self-destruct`, { ...auth, seat: seatFor("wolf") });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /禁锢/);
  assert.equal((await post(`/api/rooms/${id}/death-record`, { ...auth, seats: [] })).status, 200);
  assert.equal((await post(`/api/rooms/${id}/sheriff-stage-close`, auth)).status, 200);
  const announced = await post(`/api/rooms/${id}/dark-fog-announce`, auth);
  assert.equal(announced.status, 200);
  assert.match(announced.body.room.latestPublicAnnouncement.text, /迷雾未开启/);
  assert.match(announced.body.room.latestPublicAnnouncement.text, new RegExp(`昨夜${seatFor("wolf")}号玩家被禁锢`));
});

test("Dark Destruction undo restores Lilith in the single ordered night flow", async () => {
  const clientId = `dark-undo-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, boardId: "dark_destruction_2" });
  const id = created.body.room.id;
  const judgeToken = created.body.judgeToken;
  const auth = { clientId, judgeToken };
  await post(`/api/rooms/${id}/fill-test`, auth);
  const dealt = await post(`/api/rooms/${id}/deal`, auth);
  const assignments = dealt.body.room.assignments;
  const seatFor = (roleId) => assignments.find((item) => item.roleId === roleId).seat;
  const villagerSeat = seatFor("villager");
  const cainSeat = seatFor("cain");

  let response = await post(`/api/rooms/${id}/night-start`, auth);
  assert.equal(response.body.room.currentNightSteps[0].id, "lilith_bind");
  response = await post(`/api/rooms/${id}/night-action`, { ...auth, targetSeats: [villagerSeat] });
  assert.equal(response.status, 200);
  assert.equal(response.body.room.currentNightSteps[response.body.room.currentNightStepIndex].id, "lia_raise");

  response = await post(`/api/rooms/${id}/night-undo`, auth);
  assert.equal(response.status, 200);
  assert.equal(response.body.room.currentNightSteps[response.body.room.currentNightStepIndex].id, "lilith_bind");
  assert.equal(response.body.room.nightActions.some((action) => action.night === 1 && action.stepId === "lilith_bind"), false);

  response = await post(`/api/rooms/${id}/night-action`, { ...auth, targetSeats: [villagerSeat] });
  assert.equal(response.status, 200);
  const flowActionIds = ["lilith_bind"];
  while (true) {
    const room = response.body.room;
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) break;
    flowActionIds.push(step.id);
    let payload = { ...auth, targetSeats: [], skipped: false };
    if (step.id === "lia_raise") payload.targetSeats = [];
    else if (step.id === "dreamer_dream") payload.targetSeats = [villagerSeat];
    else if (step.id === "wolves_kill" || step.id === "archangel_bless" || step.id === "lia_fog") payload.skipped = true;
    else if (step.id === "witch_action") payload = { ...auth, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (step.id === "cain_check") payload.targetSeats = assignments.filter((item) => item.seat !== cainSeat).slice(0, 2).map((item) => item.seat);
    else if (step.id === "lia_charge") payload.targetSeats = [villagerSeat];
    response = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(response.status, 200, `${step.id}: ${response.body.error || "failed"}`);
  }

  assert.equal(flowActionIds[1], "lia_raise");
  assert.ok(flowActionIds.indexOf("lia_charge") > flowActionIds.indexOf("cain_check"));
  assert.equal(flowActionIds.at(-1), "lia_fog");
  assert.equal(new Set(flowActionIds).size, flowActionIds.length, "night roles must not be re-added after the dynamic steps rebuild");
  response = await post(`/api/rooms/${id}/night-finish`, auth);
  assert.equal(response.status, 200);
  assert.ok(response.body.room.currentNightStepIndex >= response.body.room.currentNightSteps.length);
  assert.equal((await post(`/api/rooms/${id}/death-record`, { ...auth, seats: [] })).status, 200);
  const boundExile = await post(`/api/rooms/${id}/exile-record`, { ...auth, seat: villagerSeat });
  assert.equal(boundExile.status, 400);
  assert.match(boundExile.body.error, /禁锢/);
  const directExile = await post(`/api/rooms/${id}/exile-record`, { ...auth, seat: cainSeat });
  assert.equal(directExile.status, 200);
  assert.equal(directExile.body.room.exileRecords.at(-1).seat, cainSeat);
  assert.equal(directExile.body.room.pendingArchangelRevival.seat, cainSeat);
});

test("Dark Destruction keeps first-day sheriff election and fog ballot visibility ordered", async () => {
  const clientId = `dark-judge-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, boardId: "dark_destruction_2" });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const judgeToken = created.body.judgeToken;
  const auth = { clientId, judgeToken };
  const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `dark-player-${index + 1}-${Date.now()}`, seat: index + 1 }));
  for (const player of players) {
    const seated = await post(`/api/rooms/${id}/seat`, player);
    assert.equal(seated.status, 200);
  }
  const dealt = await post(`/api/rooms/${id}/deal`, auth);
  assert.equal(dealt.status, 200);
  const dealtAssignments = dealt.body.room.assignments;
  const newSeatFor = (roleId) => dealtAssignments.find((item) => item.roleId === roleId).seat;
  const currentLilith = newSeatFor("lilith");
  const currentCain = newSeatFor("cain");
  const currentVillagers = dealtAssignments.filter((item) => item.roleId === "villager").map((item) => item.seat);

  let response = await post(`/api/rooms/${id}/night-start`, auth);
  assert.equal(response.status, 200);
  let testedSelfBind = false;
  while (true) {
    const room = response.body.room;
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) break;
    let payload = { ...auth, targetSeats: [], skipped: false };
    if (step.id === "lilith_bind") {
      if (!testedSelfBind) {
        const rejected = await post(`/api/rooms/${id}/night-action`, { ...auth, targetSeats: [currentLilith], skipped: false });
        assert.equal(rejected.status, 400);
        assert.match(rejected.body.error, /不能禁锢自己/);
        testedSelfBind = true;
      }
      payload.targetSeats = [currentVillagers[0]];
    } else if (step.id === "dreamer_dream") payload.targetSeats = [currentVillagers[1]];
    else if (step.id === "wolves_kill") payload.skipped = true;
    else if (step.id === "witch_action") payload = { ...auth, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (step.id === "archangel_bless") payload.targetSeats = [currentLilith];
    else if (step.id === "cain_check") payload.targetSeats = dealtAssignments.filter((item) => item.seat !== currentCain).slice(0, 2).map((item) => item.seat);
    else if (step.id === "lia_charge") payload.targetSeats = [currentVillagers[0]];
    else if (step.id === "lia_fog") payload.targetSeats = [];
    else if (step.id === "lia_raise") payload.targetSeats = [];
    response = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(response.status, 200, `${step.id}: ${response.body.error || "failed"}`);
  }
  assert.equal(testedSelfBind, true);
  response = await post(`/api/rooms/${id}/night-finish`, auth);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.room.pendingNightResolution.deaths.map((item) => item.seat), [currentLilith]);
  assert.deepEqual(response.body.room.pendingNightResolution.deaths[0].reasons, ["天使长祝福"]);
  assert.equal((await post(`/api/rooms/${id}/sheriff-election-self-destruct`, { ...auth, seat: newSeatFor("lia") })).status, 400);

  response = await post(`/api/rooms/${id}/death-record`, { ...auth, seats: [currentLilith] });
  assert.equal(response.status, 200);
  assert.equal(response.body.room.pendingArchangelRevival.seat, currentLilith);
  response = await post(`/api/rooms/${id}/archangel-revival`, { ...auth, use: false });
  assert.equal(response.status, 200);

  const earlyBallot = await post(`/api/rooms/${id}/dark-ballot-open`, { ...auth, round: 1 });
  assert.equal(earlyBallot.status, 403, "judge mode must not use player phone voting");
  assert.equal((await post(`/api/rooms/${id}/sheriff-candidates`, { ...auth, seats: [] })).status, 200);
  const ballotBeforeFogAnnouncement = await post(`/api/rooms/${id}/day-vote`, { ...auth, round: 1, votes: [] });
  assert.equal(ballotBeforeFogAnnouncement.status, 400, "fog status must be announced before voting starts");
  assert.match(ballotBeforeFogAnnouncement.body.error, /先公布本日迷雾状态/);
  response = await post(`/api/rooms/${id}/dark-fog-announce`, auth);
  assert.equal(response.status, 200);
  assert.equal(response.body.room.darkFogDay, 1);
  assert.match(response.body.room.latestPublicAnnouncement.text, /警下宣布：迷雾开启/);
  const roleOwner = (roleId) => {
    const seat = newSeatFor(roleId);
    return players.find((player) => player.seat === seat);
  };
  const lia = roleOwner("lia");
  const voter = players.find((player) => player.seat !== lia.seat && player.seat !== currentLilith);
  const targetSeat = response.body.room.aliveSeats.find((seat) => seat !== currentVillagers[0]);
  const votes = response.body.room.aliveSeats.map((seat) => ({ voterSeat: seat, targetSeat: seat === voter.seat ? targetSeat : 0 }));
  response = await post(`/api/rooms/${id}/day-vote`, { ...auth, round: 1, votes });
  assert.equal(response.status, 200);
  const liaView = await getRoom(id, lia.clientId);
  const otherView = await getRoom(id, players.find((player) => player.seat !== lia.seat && player.seat !== voter.seat && player.seat !== currentLilith).clientId);
  const judgeView = await getRoom(id, clientId, judgeToken);
  assert.equal(judgeView.dayVoteRecord.votes.find((vote) => vote.voterSeat === voter.seat).targetSeat, targetSeat);
  assert.equal(Object.hasOwn(liaView.dayVoteRecord, "votes"), false, "the judge tells Lia privately offline");
  assert.equal(Object.hasOwn(otherView.dayVoteRecord, "votes"), false);
  assert.equal((await post(`/api/rooms/${id}/dark-ballot-vote`, { clientId: voter.clientId, targetSeat })).status, 403);
});

test("Dark Destruction system mode announces fog in two stages without exposing ballots to the controller", async () => {
  const clientId = `dark-system-controller-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, mode: "SYSTEM", boardId: "dark_destruction_2" });
  assert.equal(created.status, 200);
  const id = created.body.room.id;
  const judgeToken = created.body.judgeToken;
  const controllerAuth = { clientId, judgeToken };
  const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `dark-system-player-${index + 1}-${Date.now()}`, seat: index + 1 }));
  for (const player of players) assert.equal((await post(`/api/rooms/${id}/seat`, player)).status, 200);
  assert.equal((await post(`/api/rooms/${id}/deal`, controllerAuth)).status, 200);
  const roleViews = await Promise.all(players.map(async (player) => ({ player, room: await getRoom(id, player.clientId) })));
  const seatFor = (roleId) => roleViews.find((item) => item.room.assignments[0].roleId === roleId)?.room.assignments[0].seat || 0;
  const villagerSeat = seatFor("villager");
  assert.ok(villagerSeat);

  assert.equal((await post(`/api/rooms/${id}/night-start`, controllerAuth)).status, 200);
  let cainResult;
  let chargeResult;
  while (true) {
    const controllerRoom = await getRoom(id, clientId, judgeToken);
    if (controllerRoom.systemNight.complete) break;
    let actor;
    for (const item of roleViews) {
      const room = await getRoom(id, item.player.clientId);
      if (room.systemNight?.canAct) {
        actor = { player: item.player, room, step: room.currentNightSteps[0] };
        break;
      }
    }
    assert.ok(actor, `no acting player for ${controllerRoom.systemNight.stepId}`);
    const ownSeat = actor.room.mySeat.seat;
    const candidates = actor.room.aliveSeats.filter((seat) => seat !== ownSeat);
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (actor.step.id === "lilith_bind") payload.targetSeats = [villagerSeat];
    else if (actor.step.id === "dreamer_dream") payload.targetSeats = [candidates[0]];
    else if (actor.step.id === "wolves_kill" || actor.step.id === "archangel_bless") payload.skipped = true;
    else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (actor.step.id === "cain_check") payload.targetSeats = candidates.slice(0, 2);
    else if (actor.step.id === "lia_charge") payload.targetSeats = [villagerSeat];
    const action = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(action.status, 200, `${actor.step.id}: ${action.body.error || "failed"}`);
    if (actor.step.id === "cain_check") cainResult = action.body.privateResult;
    if (actor.step.id === "lia_charge") chargeResult = action.body.privateResult;
  }
  assert.equal(cainResult?.kind, "CAIN");
  assert.equal(chargeResult?.kind, "CHARGE");
  assert.equal(chargeResult?.success, true);
  assert.equal((await post(`/api/rooms/${id}/night-finish`, controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${id}/system-publish-daybreak`, controllerAuth)).status, 200);
  assert.equal((await post(`/api/rooms/${id}/wolf-self-destruct`, { clientId: roleViews.find((item) => item.room.assignments[0].roleId === "lia").player.clientId })).status, 403);

  assert.equal((await post(`/api/rooms/${id}/dark-fog-announce`, controllerAuth)).status, 400);
  assert.equal((await post(`/api/rooms/${id}/sheriff-stage-close`, controllerAuth)).status, 200);
  const announced = await post(`/api/rooms/${id}/dark-fog-announce`, controllerAuth);
  assert.equal(announced.status, 200);
  assert.match(announced.body.room.latestPublicAnnouncement.text, /警下宣布：迷雾开启/);
  assert.match(announced.body.room.latestPublicAnnouncement.text, new RegExp(`昨夜${villagerSeat}号玩家被禁锢`));

  const opened = await post(`/api/rooms/${id}/dark-ballot-open`, { ...controllerAuth, round: 1 });
  assert.equal(opened.status, 200);
  assert.match(opened.body.room.latestPublicAnnouncement.text, /公投前再次提醒：迷雾开启/);
  assert.equal(Object.hasOwn(opened.body.room.activeDarkBallot, "votes"), false);
  const lia = roleViews.find((item) => item.room.assignments[0].roleId === "lia").player;
  const voter = players.find((player) => player.seat !== seatFor("lia"));
  const targetSeat = opened.body.room.activeDarkBallot.allowedTargets.find((seat) => seat !== voter.seat);
  assert.equal((await post(`/api/rooms/${id}/dark-ballot-vote`, { clientId: voter.clientId, targetSeat })).status, 200);
  const liaView = await getRoom(id, lia.clientId);
  const controllerView = await getRoom(id, clientId, judgeToken);
  assert.equal(liaView.activeDarkBallot.votes[String(voter.seat)], targetSeat);
  assert.equal(Object.hasOwn(controllerView.activeDarkBallot, "votes"), false);
});

test("system revival timeout gives the following wolf king skill its own five-second window", async () => {
  const clientId = `dark-sequential-${Date.now()}-${crypto.randomInt(10000)}`;
  const created = await post("/api/rooms", { clientId, mode: "SYSTEM", boardId: "dark_destruction_2" });
  const id = created.body.room.id;
  const auth = { clientId, judgeToken: created.body.judgeToken };
  const players = Array.from({ length: 12 }, (_, index) => ({ clientId: `${clientId}-${index + 1}`, seat: index + 1 }));
  for (const player of players) assert.equal((await post(`/api/rooms/${id}/seat`, player)).status, 200);
  assert.equal((await post(`/api/rooms/${id}/deal`, auth)).status, 200);
  const views = await Promise.all(players.map(async (player) => ({ player, room: await getRoom(id, player.clientId) })));
  const owner = (roleId) => views.find((item) => item.room.assignments[0].roleId === roleId);
  const wolfKing = owner("wolf_king");
  const villagerSeat = owner("villager").player.seat;
  assert.equal((await post(`/api/rooms/${id}/night-start`, auth)).status, 200);
  while (true) {
    const controller = await getRoom(id, clientId, auth.judgeToken);
    if (controller.systemNight.complete) break;
    let actor;
    for (const item of views) {
      const room = await getRoom(id, item.player.clientId);
      if (room.systemNight?.canAct) { actor = { player: item.player, room, step: room.currentNightSteps[0] }; break; }
    }
    assert.ok(actor);
    const candidates = actor.room.aliveSeats.filter((seat) => seat !== actor.player.seat);
    let payload = { clientId: actor.player.clientId, targetSeats: [], skipped: false };
    if (["lilith_bind", "dreamer_dream", "lia_charge"].includes(actor.step.id)) payload.targetSeats = [villagerSeat];
    else if (actor.step.id === "wolves_kill") payload.targetSeats = [wolfKing.player.seat];
    else if (actor.step.id === "archangel_bless") payload.skipped = true;
    else if (actor.step.id === "witch_action") payload = { clientId: actor.player.clientId, antidoteUsed: false, poisonTargetSeat: 0 };
    else if (actor.step.id === "cain_check") payload.targetSeats = candidates.slice(0, 2);
    const acted = await post(`/api/rooms/${id}/night-action`, payload);
    assert.equal(acted.status, 200, `${actor.step.id}: ${acted.body.error || "failed"}`);
  }
  assert.equal((await post(`/api/rooms/${id}/night-finish`, auth)).status, 200);
  assert.equal((await post(`/api/rooms/${id}/system-publish-daybreak`, auth)).status, 200);
  const angel = await getRoom(id, owner("archangel").player.clientId);
  assert.equal(angel.myPendingArchangelRevival.seat, wolfKing.player.seat);
  await new Promise((resolve) => setTimeout(resolve, 5200));
  assert.equal((await post(`/api/rooms/${id}/system-skill-timeout`, auth)).status, 200);
  const kingView = await getRoom(id, wolfKing.player.clientId);
  assert.equal(kingView.myDeathSkill.seat, wolfKing.player.seat);
  assert.ok(kingView.myDeathSkill.deadlineAt >= Date.now() + 4000, "wolf king must receive a fresh window after revival times out");
  assert.equal((await post(`/api/rooms/${id}/death-skill`, { clientId: wolfKing.player.clientId, seat: wolfKing.player.seat, targetSeat: 0 })).status, 200);
});
