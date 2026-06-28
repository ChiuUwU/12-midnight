(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NightResolution = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function activeSwapPair(room, stepId, night) {
    const action = (room.nightActions || []).find((item) => item.night === night && item.stepId === stepId && !item.skipped && !item.invalidByConflict);
    return action && action.targetSeats && action.targetSeats.length === 2 ? action.targetSeats.map(Number) : [];
  }

  function mapWithPair(seat, pair) {
    const value = Number(seat || 0);
    if (!value || pair.length !== 2) return value;
    if (value === pair[0]) return pair[1];
    if (value === pair[1]) return pair[0];
    return value;
  }

  function mapNightSeat(room, seat, night) {
    return room.boardId === "realm_of_trickery" ? mapWithPair(seat, activeSwapPair(room, "magician_swap", night)) : Number(seat || 0);
  }

  function applyWind(seat, wind, boardedSeat) {
    if (!seat || wind === "calm") return seat;
    if (seat === boardedSeat) return seat;
    if (wind === "tailwind") return (seat % 12) + 1;
    if (wind === "headwind") return ((seat + 10) % 12) + 1;
    return seat;
  }

  function drownedSeat(boardedSeat, wind) {
    if (wind === "calm" || !boardedSeat) return 0;
    if (wind === "tailwind") return ((boardedSeat + 10) % 12) + 1;
    if (wind === "headwind") return (boardedSeat % 12) + 1;
    return 0;
  }

  function calculateSuggestedDeaths(room, night = room.night) {
    const actions = (room.nightActions || []).filter((item) => item.night === night);
    const previousActions = (room.nightActions || []).filter((item) => item.night === night - 1);
    const firstTarget = (stepId, source = actions) => {
      const action = source.find((item) => item.stepId === stepId && !item.skipped);
      return action && action.targetSeats && action.targetSeats.length ? Number(action.targetSeats[0]) : 0;
    };
    const roleAtSeat = (seat) => (room.assignments || []).find((item) => item.seat === seat)?.roleId || "";
    const deaths = new Map();
    const addDeath = (seat, reason) => {
      if (!seat) return;
      const reasons = deaths.get(seat) || [];
      reasons.push(reason);
      deaths.set(seat, reasons);
    };

    let wolfKill = mapNightSeat(room, firstTarget("wolves_kill"), night);
    const witchAction = actions.find((item) => item.stepId === "witch_action");
    let antidote = mapNightSeat(room, witchAction && witchAction.antidoteUsed ? Number(witchAction.antidoteTargetSeat) : firstTarget("witch_antidote"), night);
    let witchPoison = mapNightSeat(room, witchAction && Number(witchAction.poisonTargetSeat) ? Number(witchAction.poisonTargetSeat) : firstTarget("witch_poison"), night);
    const poisonerPoison = firstTarget("poisoner_poison");
    const guard = firstTarget("guard_guard");
    const dream = firstTarget("dreamer_dream");
    const previousDream = firstTarget("dreamer_dream", previousActions);
    const mechanicalMimicRole = roleAtSeat(firstTarget("mechanical_mimic"));
    const mechanicalGuard = room.boardId === "mechanical_wolf_spirit_medium" && mechanicalMimicRole === "guard" ? guard : 0;
    const witchPoisonImmuneRoles = room.boardId === "masquerade" ? ["dancer", "mask"] : [];

    if (room.boardId === "dawn_voyage") {
      const wind = room.windDirection || "calm";
      const boarded = room.boardedSeat || 0;
      wolfKill = applyWind(wolfKill, wind, boarded);
      antidote = applyWind(antidote, wind, boarded);
      witchPoison = applyWind(witchPoison, wind, boarded);
      const drowned = drownedSeat(boarded, wind);
      if (drowned && !["siren", "captain"].includes(roleAtSeat(drowned))) addDeath(drowned, "溺亡");
      if (wind === "calm" && boarded && wolfKill === boarded) wolfKill = 0;
    }

    addDeath(wolfKill, "狼刀");
    if (witchPoison && !witchPoisonImmuneRoles.includes(roleAtSeat(witchPoison))) addDeath(witchPoison, "女巫毒");
    addDeath(poisonerPoison, "毒师毒");
    if (dream && previousDream && dream === previousDream) addDeath(dream, "连续摄梦");

    if (antidote && deaths.has(antidote)) {
      const reasons = deaths.get(antidote).filter((reason) => reason !== "狼刀");
      if (reasons.length) deaths.set(antidote, reasons);
      else deaths.delete(antidote);
    }

    const sameGuardAndSave = guard && antidote && wolfKill && guard === antidote && antidote === wolfKill;
    if (sameGuardAndSave) deaths.set(wolfKill, ["同守同救"]);

    if (guard && deaths.has(guard) && !sameGuardAndSave) {
      const removable = mechanicalGuard === guard ? ["狼刀", "女巫毒"] : ["狼刀"];
      const remaining = deaths.get(guard).filter((reason) => !removable.includes(reason));
      if (remaining.length) deaths.set(guard, remaining);
      else deaths.delete(guard);
    }

    if (mechanicalGuard && witchPoison === mechanicalGuard) {
      const witchSeat = (room.assignments || []).find((item) => item.roleId === "witch")?.seat || 0;
      addDeath(witchSeat, "机械守卫弹毒");
    }

    if (dream && deaths.has(dream)) {
      const remaining = deaths.get(dream).filter((reason) => !["狼刀", "女巫毒", "毒师毒"].includes(reason));
      if (remaining.length) deaths.set(dream, remaining);
      else deaths.delete(dream);
    }

    return [...deaths.entries()].map(([seat, reasons]) => ({ seat, reasons })).sort((left, right) => left.seat - right.seat);
  }

  return { calculateSuggestedDeaths };
});
