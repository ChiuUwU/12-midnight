const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require("../web/wolf-knife-policy.js");

test("hidden wolves inherit the ordinary knife only after the visible pack is gone", () => {
  for (const [board, hidden, pack] of [
    ["masquerade", "mask", ["wolf", "wolf", "wolf"]],
    ["mechanical_wolf_spirit_medium", "mechanical_wolf", ["wolf", "wolf", "wolf"]],
    ["treasure_master", "treasure_master", ["wolf", "wolf", "wolf_king"]],
    ["dark_destruction_2", "lia", ["wolf", "wolf_king", "lilith"]]
  ]) {
    const special = { roleId: hidden, alive: true };
    const wolves = pack.map((roleId) => ({ roleId, alive: true }));
    assert.equal(policy.privateKnifeState(board, special, [special, ...wolves]), "NO", board);
    wolves.forEach((wolf) => { wolf.alive = false; });
    assert.equal(policy.privateKnifeState(board, special, [special, ...wolves]), "YES", board);
    special.alive = false;
    assert.equal(policy.hasKnifeActor(board, [special, ...wolves]), false, board);
  }
});

test("visible pack roles share one ordinary knife and unrelated roles cannot use it", () => {
  for (const [board, role] of [["follow_neighbor", "wolf_king"], ["wolf_king_guard", "wolf_king"], ["realm_of_trickery", "trickster"], ["dawn_voyage", "siren"], ["pre_witch_hunter_idiot_mixed", "wolf"]]) {
    assert.equal(policy.mayUseNormalWolfKnife(board, { roleId: role, alive: true }, []), true, board);
    assert.equal(policy.mayUseNormalWolfKnife(board, { roleId: "villager", alive: true }, []), false, board);
  }
});
