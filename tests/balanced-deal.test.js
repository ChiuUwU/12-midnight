const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { BOARDS } = require("../miniprogram/data/boards");
const { dealBoard } = require("../miniprogram/utils/deal");
const { createBalancedDeal } = require("../web/balanced-deal");

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

test("treasure master keeps wolf, villager and one allowed god card", () => {
  const result = deal("treasure_master");
  const treasure = result.assignments.find((assignment) => assignment.roleId === "treasure_master");
  const cards = treasure.abilityState.treasureCards;
  assert.equal(cards.length, 3);
  assert.ok(cards.includes("wolf"));
  assert.ok(cards.includes("villager"));
  const god = cards.find((roleId) => !["wolf", "villager"].includes(roleId));
  assert.ok(god);
  assert.notEqual(god, "masked_man");
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
