const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { BOARDS } = require("../miniprogram/data/boards");
const { dealBoard } = require("../miniprogram/utils/deal");
const { createBalancedDeal, getFollowNeighborStats, scoreCandidate } = require("../web/balanced-deal");

const seats = Array.from({ length: 12 }, (_, index) => index + 1);
const randomInt = (maximum) => crypto.randomInt(maximum);

function deal(boardId, history = [], candidateCount = 200) {
  return createBalancedDeal({
    boardId,
    history,
    candidateCount,
    randomInt,
    createCandidate: () => dealBoard(boardId, seats)
  });
}

test("all configured boards keep twelve unique seat assignments", () => {
  BOARDS.forEach((board) => {
    const result = deal(board.id);
    assert.equal(result.assignments.length, 12);
    assert.deepEqual(result.assignments.map((assignment) => assignment.seat).sort((a, b) => a - b), seats);
    assert.equal(result.meta.candidateCount, 200);
    assert.ok(Number.isFinite(result.meta.totalPenalty));
  });
});

test("ordinary board role counts remain unchanged", () => {
  BOARDS.filter((board) => Array.isArray(board.roles)).forEach((board) => {
    const result = deal(board.id);
    const counts = result.assignments.reduce((map, assignment) => {
      map[assignment.roleId] = (map[assignment.roleId] || 0) + 1;
      return map;
    }, {});
    board.roles.forEach((entry) => assert.equal(counts[entry.roleId], entry.count, `${board.id}:${entry.roleId}`));
  });
});

test("treasure master keeps wolf, villager and one god card including masked man", () => {
  const result = deal("treasure_master");
  const treasure = result.assignments.find((assignment) => assignment.roleId === "treasure_master");
  const cards = treasure.abilityState.treasureCards;
  assert.equal(cards.length, 3);
  assert.ok(cards.includes("wolf"));
  assert.ok(cards.includes("villager"));
  const god = cards.find((roleId) => !["wolf", "villager"].includes(roleId));
  assert.ok(god);
  assert.ok(["spirit_medium", "poisoner", "hunter", "dreamer", "masked_man"].includes(god));
});

test("treasure master can draw the masked man card", () => {
  const drawnCards = new Set(Array.from({ length: 300 }, () => deal("treasure_master", [], 1).assignments
    .find((assignment) => assignment.roleId === "treasure_master").abilityState.treasureCards[2]));
  assert.ok(drawnCards.has("masked_man"));
});

test("history is capped at ten games across rooms and boards", () => {
  let history = [];
  for (let index = 0; index < 14; index += 1) {
    const boardId = BOARDS[index % BOARDS.length].id;
    history = deal(boardId, history, 80).history;
  }
  assert.equal(history.length, 10);
  assert.ok(history.every((game) => game.assignments.length === 12));
});

test("balance metadata records hidden strength and target inputs", () => {
  const result = deal("realm_of_trickery");
  assert.equal(result.meta.skillProfile.length, 12);
  assert.ok(result.meta.skillProfile.every((value) => value >= 0 && value <= 100));
  assert.ok(["WEAK", "EVEN", "SLIGHTLY_STRONG", "STRONG"].includes(result.meta.wolfTarget.type));
  assert.ok(["STANDARD", "RELAXED", "FREE"].includes(result.meta.keyRoleMode));
  assert.ok(result.meta.components.keyRolePenalty >= 0);
});

test("treasure master applies the hidden median and other-three-wolves soft constraint", () => {
  const assignments = [
    { seat: 1, roleId: "treasure_master", camp: "WOLF" },
    { seat: 2, roleId: "wolf_king", camp: "WOLF" },
    { seat: 3, roleId: "wolf", camp: "WOLF" },
    { seat: 4, roleId: "wolf", camp: "WOLF" },
    ...[5, 6, 7, 8, 9, 10, 11, 12].map((seat) => ({ seat, roleId: "villager", camp: "GOOD" }))
  ];
  const skills = [20, 30, 40, 50, 60, 70, 80, 90, 100, 60, 60, 60];
  const zeroMatrix = Array.from({ length: 12 }, () => Array(12).fill(0));
  const context = {
    skills,
    wolfTarget: { value: 0 },
    referenceWolves: new Set([1, 2, 3, 4]),
    pairOppositeCounts: zeroMatrix,
    pairWolfWolfCounts: zeroMatrix,
    pairHistoryLength: 0,
    targetOppositeRate: 0,
    targetWolfWolfRate: 0,
    keyRoleMode: { coefficient: 0, threshold: 0 }
  };
  const score = scoreCandidate(assignments, "treasure_master", [], context);
  // T=20, M=60, W=(30+40+50)/3=40, S=80: 0.45*40 + 1.5*(20-6.4) + 4*(20-12.8).
  assert.ok(Math.abs(score.components.treasureRolePenalty - 67.2) < 0.000001);
});

test("Follow Neighbor keeps every wolf layout legal and scores unique adjacent gods", () => {
  const assignments = [
    { seat: 1, roleId: "wolf", camp: "WOLF" },
    { seat: 2, roleId: "wolf", camp: "WOLF" },
    { seat: 3, roleId: "wolf_king", camp: "WOLF" },
    { seat: 4, roleId: "seer", camp: "GOOD" },
    { seat: 5, roleId: "witch", camp: "GOOD" },
    { seat: 6, roleId: "guard", camp: "GOOD" },
    { seat: 7, roleId: "hunter", camp: "GOOD" },
    ...[8, 9, 10, 11, 12].map((seat) => ({ seat, roleId: "villager", camp: "GOOD" }))
  ];
  const stats = getFollowNeighborStats(assignments);
  assert.deepEqual(stats.wolfSeats, [1, 2, 3]);
  assert.deepEqual(stats.adjacentSeats, [4, 12]);
  assert.equal(stats.adjacentGodCount, 1);

  const result = deal("follow_neighbor", [], 500);
  assert.ok(result.meta.followNeighbor);
  assert.ok(result.meta.followNeighbor.adjacentGodCount >= 0);
  assert.ok(result.meta.components.adjacentGodPenalty >= 0);
});

test("Follow Neighbor deal average stays in the agreed two-to-three adjacent-god range", () => {
  let history = [];
  const counts = [];
  for (let index = 0; index < 100; index += 1) {
    const result = deal("follow_neighbor", history, 500);
    history = result.history;
    counts.push(result.meta.followNeighbor.adjacentGodCount);
  }
  const average = counts.reduce((sum, value) => sum + value, 0) / counts.length;
  assert.ok(average >= 2 && average <= 3, `adjacent God average was ${average}`);
});
