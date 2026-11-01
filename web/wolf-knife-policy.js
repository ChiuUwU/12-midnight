(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WolfKnifePolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const groupRoles = {
    dark_destruction_2: ["wolf", "wolf_king", "lilith"],
    realm_of_trickery: ["wolf", "trickster"],
    dawn_voyage: ["wolf", "siren"],
    treasure_master: ["wolf", "wolf_king"],
    follow_neighbor: ["wolf", "wolf_king"],
    wolf_king_guard: ["wolf", "wolf_king"]
  };
  const inheritors = {
    masquerade: "mask",
    mechanical_wolf_spirit_medium: "mechanical_wolf",
    treasure_master: "treasure_master",
    dark_destruction_2: "lia"
  };

  function mayUseNormalWolfKnife(boardId, assignment, assignments) {
    if (!assignment || assignment.alive === false) return false;
    const group = groupRoles[boardId] || ["wolf"];
    if (group.includes(assignment.roleId)) return true;
    if (inheritors[boardId] !== assignment.roleId) return false;
    return !(assignments || []).some((item) => item.alive !== false && group.includes(item.roleId));
  }

  function privateKnifeState(boardId, assignment, assignments) {
    if (!assignment || inheritors[boardId] !== assignment.roleId) return null;
    return mayUseNormalWolfKnife(boardId, assignment, assignments) ? "YES" : "NO";
  }

  function hasKnifeActor(boardId, assignments) {
    return (assignments || []).some((item) => mayUseNormalWolfKnife(boardId, item, assignments));
  }

  return { mayUseNormalWolfKnife, privateKnifeState, hasKnifeActor };
});
