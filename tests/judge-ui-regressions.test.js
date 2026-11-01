const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function renderRoom(room, view) {
  const app = { innerHTML: "", addEventListener() {} };
  const saved = { currentUserId: "judge", currentRoomId: room.id, view, rooms: { [room.id]: room }, judgeTokens: {} };
  const context = {
    document: { title: "", querySelector: () => app }, location: { protocol: "file:", search: "" },
    localStorage: { getItem: () => JSON.stringify(saved), setItem() {} },
    crypto: webcrypto, URLSearchParams, Image: class {}, console, setTimeout, clearTimeout,
    NightResolution: require("../web/night-resolution.js"),
    WolfKnifePolicy: require("../web/wolf-knife-policy.js")
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../web/app.js"), "utf8"), context);
  return app.innerHTML;
}

function roomFixture() {
  const seats = Array.from({ length: 12 }, (_, i) => ({ seat: i + 1, occupied: true, userId: `p${i + 1}` }));
  const assignments = seats.map(({ seat }) => ({ seat, roleId: seat === 1 ? "wolf_king" : "villager", camp: seat === 1 ? "WOLF" : "GOOD", alive: seat !== 1, abilityState: {} }));
  return { id: "123456", boardId: "dark_destruction_2", mode: "JUDGE", phase: "DAY", night: 1, seats, assignments, nightActions: [], pendingDeathSkills: [{ seat: 1, day: 1 }], deathRecords: [{ day: 1, phase: "DAYBREAK", seats: [1] }], exileRecords: [], logs: [], currentNightSteps: [], currentNightStepIndex: 0, sheriffBadge: {} };
}

test("public night announcement uses the actual night and hides mechanical skill type", () => {
  const source = fs.readFileSync(path.join(__dirname, "../web/app.js"), "utf8");
  const app = { innerHTML: "", addEventListener() {} };
  const room = roomFixture();
  const saved = { currentUserId: "judge", currentRoomId: room.id, view: "room", rooms: { [room.id]: room }, judgeTokens: {} };
  const context = { document: { title: "", querySelector: () => app }, location: { protocol: "file:", search: "" }, localStorage: { getItem: () => JSON.stringify(saved), setItem() {} }, crypto: webcrypto, URLSearchParams, Image: class {}, console, setTimeout, clearTimeout, NightResolution: require("../web/night-resolution.js"), WolfKnifePolicy: require("../web/wolf-knife-policy.js") };
  context.window = context;
  vm.runInNewContext(source.replace("  function getJudgeScript(step, room) {", "  window.testJudgeScript = getJudgeScript;\n  function getJudgeScript(step, room) {"), context);
  assert.match(context.testJudgeScript({ id: "wolves_kill" }, { night: 1 }), /互认同伴/);
  assert.doesNotMatch(context.testJudgeScript({ id: "wolves_kill" }, { night: 2 }), /互认同伴/);
  assert.match(source, /\["mechanical_guard", "mechanical_poison", "mechanical_check", "mechanical_kill"\]\.includes\(systemNight\.stepId\)/);
  assert.match(source, /getJudgeScript\(\{ id: systemNight\.stepId, label: systemNight\.announcement \}, room\)/);
});

test("offline judge can see living targets for wolf king and record exile without vote details", () => {
  const initial = roomFixture();
  initial.sheriffStageClosedDay = 1;
  const html = renderRoom(initial, "room");
  assert.match(html, /id="deathSkillTarget-1"/);
  assert.match(html, /法官台词：等待 1号玩家决定是否发动技能/);
  assert.match(html, /<option value="2">2号<\/option>/);
  assert.doesNotMatch(html, /<option value="1">1号<\/option>/);
  assert.match(html, /等待出局玩家发动技能/);
  const room = roomFixture();
  room.sheriffStageClosedDay = 1;
  room.pendingDeathSkills = [];
  assert.match(renderRoom(room, "room"), /直接记录放逐结果/);
});

test("judge sees a resurrection cue without revealing the archangel seat", () => {
  const room = roomFixture();
  room.pendingDeathSkills = [];
  room.pendingArchangelRevival = { seat: 1, phase: "DAYBREAK" };
  const html = renderRoom(room, "room");
  assert.match(html, /法官台词：等待天使长决定是否复活 1号玩家/);
});

test("judge switches between sheriff and day panels and keeps urgent death skills visible", () => {
  const room = roomFixture();
  let html = renderRoom(room, "room");
  assert.match(html, /警上 · 首次竞选/);
  assert.doesNotMatch(html, /警下 · 天亮与白天流程/);
  assert.match(html, /id="deathSkillTarget-1"/);
  room.sheriffBadge = { holderSeat: 2, lost: false };
  html = renderRoom(room, "room");
  assert.doesNotMatch(html, /警上 · 首次竞选/);
  assert.match(html, /警下 · 天亮与白天流程/);
});

test("judge undo progress counts completed actions and zero-target steps have no seat grid", () => {
  const room = roomFixture();
  room.phase = "NIGHT";
  room.boardId = "realm_of_trickery";
  room.nightActions = [{ night: 1, stepId: "trickster_swap", label: "诡术师交换两个号码", targetSeats: [1, 11] }];
  room.currentNightSteps = [{ id: "order_prince_confirm", label: "定序王子确认身份", targetCount: 0 }];
  const html = renderRoom(room, "night");
  assert.match(html, /1\. 诡术师交换两个号码/);
  assert.match(html, /2\. 定序王子确认身份/);
  assert.doesNotMatch(html, /data-action="night-seat"/);
});

test("judge rewind cue displays raw vote and actual swapped exile privately", () => {
  const room = roomFixture();
  room.boardId = "realm_of_trickery";
  room.assignments[1].roleId = "order_prince";
  room.nightActions = [{ night: 1, stepId: "trickster_swap", targetSeats: [1, 11], skipped: false }];
  room.pendingExileResult = { record: { exiledSeat: 11, counts: {}, topSeats: [11] } };
  room.activeDaySkillWindow = { kind: "ORDER_PRINCE_REWIND", status: "OPEN" };
  const html = renderRoom(room, "orderPrince");
  assert.match(html, /等待定序王子发动技能/);
  assert.match(html, /昨夜交换 1号、11号；若不回溯，实际 1号出局/);
});

test("completed Lilith action remains first in the judge night progress list", () => {
  const room = roomFixture();
  room.phase = "NIGHT";
  room.nightActions = [{ night: 1, stepId: "lilith_bind", label: "莉莉丝选择禁锢目标", targetSeats: [2] }];
  room.currentNightSteps = [{ id: "lia_raise", label: "莉娅举手确认身份", targetCount: 0 }];
  const html = renderRoom(room, "night");
  assert.match(html, /1\. 莉莉丝选择禁锢目标/);
  assert.match(html, /2\. 莉娅举手确认身份/);
  assert.match(html, /2号（平民）被禁锢/);
});

test("the judge sees an unavailable archangel in night order without creating an action", () => {
  const room = roomFixture();
  room.phase = "NIGHT";
  room.assignments[2] = { seat: 3, roleId: "archangel", camp: "GOOD", alive: true, abilityState: {} };
  room.nightActions = [{ night: 1, stepId: "lilith_bind", label: "莉莉丝选择禁锢目标", targetSeats: [3] }];
  room.currentNightSteps = [{ id: "cain_check", label: "凯恩鉴定两名玩家的身份关系", targetCount: 2 }];
  const html = renderRoom(room, "night");
  assert.match(html, /天使长选择是否祝福/);
  assert.match(html, /不能行动：本夜被禁锢/);
  assert.ok(html.indexOf("天使长选择是否祝福") < html.indexOf("凯恩鉴定两名玩家的身份关系", html.indexOf("night-step-list")));
});

test("judge sees no-binding and no-fog announcement only after sheriff stage", () => {
  const room = roomFixture();
  room.pendingDeathSkills = [];
  assert.doesNotMatch(renderRoom(room, "room"), /法官警下台词：昨夜/);
  room.sheriffStageClosedDay = 1;
  const html = renderRoom(room, "room");
  assert.match(html, /法官警下台词：昨夜无人被禁锢；迷雾未开启/);
});

test("ordinary wolf identity uses the approved new card while older cards are retained", () => {
  const room = roomFixture();
  room.seats[0].userId = "judge";
  room.assignments[0].roleId = "wolf";
  room.assignments[0].alive = true;
  const html = renderRoom(room, "identity");
  assert.match(html, /assets\/roles\/illustrated-v2\/wolf-candidate-20261031\.png/);
  assert.ok(fs.existsSync(path.join(__dirname, "../web/assets/roles/wolf.png")));
  assert.ok(fs.existsSync(path.join(__dirname, "../web/assets/boards/dark_destruction_2/roles/wolf.png")));
});

test("dead Lilith keeps her judge cue without target choices", () => {
  const room = roomFixture();
  room.phase = "NIGHT";
  room.assignments[0].roleId = "lilith";
  room.currentNightSteps = [{ id: "lilith_bind", actor: "lilith", label: "莉莉丝选择禁锢目标", targetCount: 1, allowSkip: true, inactive: true }];
  const html = renderRoom(room, "night");
  assert.match(html, /莉莉丝请睁眼/);
  assert.match(html, /莉莉丝已出局/);
  assert.doesNotMatch(html, /data-action="night-seat"/);
  assert.match(html, /已宣读，继续/);
});

test("fog choice has no number grid and enable is disabled without a successful charge", () => {
  const room = roomFixture();
  room.phase = "NIGHT";
  room.assignments[1] = { seat: 2, roleId: "lia", camp: "WOLF", alive: true, abilityState: {} };
  room.currentNightSteps = [{ id: "lia_fog", actor: "lia", label: "莉娅选择是否开启迷雾", targetCount: 0, allowSkip: true }];
  let html = renderRoom(room, "night");
  assert.doesNotMatch(html, /data-action="night-seat"/);
  assert.match(html, /data-action="night-submit" disabled>开启迷雾/);
  assert.match(html, /不开启迷雾/);
  room.nightActions = [{ night: 1, stepId: "lia_charge", targetSeats: [3], success: true, skipped: false }];
  html = renderRoom(room, "night");
  assert.match(html, /data-action="night-submit" >开启迷雾/);
});

test("judge morning view includes binding and fog without publishing them", () => {
  const room = roomFixture();
  room.nightActions = [
    { night: 1, stepId: "lilith_bind", targetSeats: [3], skipped: false },
    { night: 1, stepId: "lia_fog", targetSeats: [], skipped: false }
  ];
  const html = renderRoom(room, "room");
  assert.match(html, /法官夜间信息：3号被禁锢；迷雾开启/);
  assert.match(html, /这些信息请在警下公布/);
});
