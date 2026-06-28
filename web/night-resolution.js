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

  function calculateNightResolution(room, night = room.night) {
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
    const treasureSkill = actions.find((item) => item.stepId === "treasure_skill" && !item.skipped);
    const treasureTarget = treasureSkill && treasureSkill.targetSeats && Number(treasureSkill.targetSeats[0]) || 0;
    const treasureRole = treasureSkill?.cardRoleId || "";
    const poisonerPoison = firstTarget("poisoner_poison") || (treasureRole === "poisoner" ? treasureTarget : 0);
    const guard = firstTarget("guard_guard");
    const mechanicalGuard = firstTarget("mechanical_guard");
    const mechanicalPoison = firstTarget("mechanical_poison");
    const mechanicalKill = firstTarget("mechanical_kill");
    const dream = firstTarget("dreamer_dream") || (treasureRole === "dreamer" ? treasureTarget : 0);
    const previousTreasureDream = previousActions.find((item) => item.stepId === "treasure_skill" && item.cardRoleId === "dreamer" && !item.skipped);
    const previousDream = firstTarget("dreamer_dream", previousActions) || (previousTreasureDream && Number(previousTreasureDream.targetSeats?.[0]) || 0);
    const witchPoisonImmuneRoles = room.boardId === "masquerade" ? ["dancer", "mask"] : [];
    const danceAction = actions.find((item) => item.stepId === "dancer_dance" && !item.skipped);
    const danceSeats = danceAction?.targetSeats?.map(Number) || [];
    const maskSeat = firstTarget("mask_give");
    const dancerSeat = (room.assignments || []).find((item) => item.roleId === "dancer")?.seat || 0;

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
    addDeath(mechanicalPoison, "机械狼毒");
    if (dream && previousDream && dream === previousDream) addDeath(dream, "连续摄梦");

    if (danceSeats.length === 3) {
      const effectiveCamp = (seat) => {
        const camp = (room.assignments || []).find((item) => item.seat === seat)?.camp || "GOOD";
        if (seat !== maskSeat) return camp;
        return camp === "WOLF" ? "GOOD" : "WOLF";
      };
      const campCounts = danceSeats.reduce((counts, seat) => {
        const camp = effectiveCamp(seat);
        counts[camp] = (counts[camp] || 0) + 1;
        return counts;
      }, {});
      const camps = Object.keys(campCounts);
      if (camps.length > 1) {
        const minorityCount = Math.min(...Object.values(campCounts));
        danceSeats.filter((seat) => campCounts[effectiveCamp(seat)] === minorityCount).forEach((seat) => addDeath(seat, "舞池结算"));
      }
      if (danceSeats.includes(dancerSeat)) {
        danceSeats.forEach((seat) => {
          if (!deaths.has(seat)) return;
          const remaining = deaths.get(seat).filter((reason) => reason !== "狼刀");
          if (remaining.length) deaths.set(seat, remaining);
          else deaths.delete(seat);
        });
      }
    }

    if (antidote && deaths.has(antidote)) {
      const reasons = deaths.get(antidote).filter((reason) => reason !== "狼刀");
      if (reasons.length) deaths.set(antidote, reasons);
      else deaths.delete(antidote);
    }

    const sameGuardAndSave = guard && antidote && wolfKill && guard === antidote && antidote === wolfKill;
    if (sameGuardAndSave) deaths.set(wolfKill, ["同守同救"]);

    if (guard && deaths.has(guard) && !sameGuardAndSave) {
      const remaining = deaths.get(guard).filter((reason) => reason !== "狼刀");
      if (remaining.length) deaths.set(guard, remaining);
      else deaths.delete(guard);
    }

    if (mechanicalGuard && deaths.has(mechanicalGuard)) {
      const remaining = deaths.get(mechanicalGuard).filter((reason) => !["狼刀", "女巫毒", "毒师毒", "机械狼毒"].includes(reason));
      if (remaining.length) deaths.set(mechanicalGuard, remaining);
      else deaths.delete(mechanicalGuard);
    }

    if (mechanicalGuard && witchPoison === mechanicalGuard) {
      const witchSeat = (room.assignments || []).find((item) => item.roleId === "witch")?.seat || 0;
      addDeath(witchSeat, "机械守卫弹毒");
    }

    if (dream && deaths.has(dream)) {
      const remaining = deaths.get(dream).filter((reason) => !["狼刀", "女巫毒", "毒师毒", "机械狼毒"].includes(reason));
      if (remaining.length) deaths.set(dream, remaining);
      else deaths.delete(dream);
    }

    addDeath(mechanicalKill, "机械技能刀");
    if (treasureRole === "wolf") addDeath(treasureTarget, "盗宝技能刀");

    const delayedDeaths = [];
    [...deaths.entries()].forEach(([seat, reasons]) => {
      if (roleAtSeat(seat) !== "masked_man") return;
      delayedDeaths.push({ seat, reasons: [...reasons], trigger: "AFTER_SPEECH" });
      deaths.delete(seat);
    });

    return {
      deaths: [...deaths.entries()].map(([seat, reasons]) => ({ seat, reasons })).sort((left, right) => left.seat - right.seat),
      delayedDeaths: delayedDeaths.sort((left, right) => left.seat - right.seat)
    };
  }

  function calculateSuggestedDeaths(room, night = room.night) {
    return calculateNightResolution(room, night).deaths;
  }

  const GOD_ROLE_IDS = new Set([
    "seer", "witch", "hunter", "idiot", "guard", "dancer", "mask",
    "spirit_medium", "poisoner", "dreamer", "magician", "order_prince",
    "captain", "masked_man"
  ]);

  function actionRoleAtTarget(room, action) {
    const seat = Number(action?.targetSeats?.[0] || 0);
    return (room.assignments || []).find((item) => item.seat === seat)?.roleId || "";
  }

  function effectiveDeathSkillRole(room, seat, day = room.night) {
    const assignment = (room.assignments || []).find((item) => item.seat === Number(seat));
    if (!assignment) return "";
    if (["hunter", "wolf_king"].includes(assignment.roleId)) return assignment.roleId;
    if (assignment.roleId === "mechanical_wolf") {
      const mimic = (room.nightActions || []).find((item) => item.night === day - 1 && item.stepId === "mechanical_mimic" && !item.skipped);
      return actionRoleAtTarget(room, mimic) === "hunter" ? "mechanical_hunter" : "";
    }
    if (assignment.roleId === "treasure_master") {
      const pick = (room.nightActions || []).find((item) => item.night === day && item.stepId === "treasure_pick" && !item.skipped);
      return pick?.cardRoleId === "hunter" ? "treasure_hunter" : "";
    }
    return "";
  }

  function getDeathSkillResolution(room, { seat, phase, reasons = [], day = room.night }) {
    const assignment = (room.assignments || []).find((item) => item.seat === Number(seat));
    const skillRoleId = effectiveDeathSkillRole(room, seat, day);
    if (!assignment || !skillRoleId) return null;

    const normalizedReasons = Array.isArray(reasons) ? reasons.map(String) : [];
    const poisonDeath = normalizedReasons.some((reason) => reason.includes("毒"));
    const knifeDeath = normalizedReasons.some((reason) => reason === "狼刀" || reason === "同守同救" || reason.includes("技能刀"));
    const triggerAllowed = phase === "EXILE" || (phase === "DAYBREAK" && knifeDeath);
    if (poisonDeath) return { seat, skillRoleId, eligible: false, reason: "被毒杀不能发动死亡技能", day };
    if (!triggerAllowed) return { seat, skillRoleId, eligible: false, reason: "当前出局方式不能发动死亡技能", day };

    if (skillRoleId === "hunter") {
      const otherGodAlive = (room.assignments || []).some((item) => item.seat !== seat && item.alive !== false && GOD_ROLE_IDS.has(item.roleId));
      if (!otherGodAlive) return { seat, skillRoleId, eligible: false, reason: "作为最后一神不能开枪", day };
    } else {
      const ownCamp = assignment.currentCamp || assignment.camp;
      const otherWolfAlive = (room.assignments || []).some((item) => item.seat !== seat && item.alive !== false && (item.currentCamp || item.camp) === "WOLF");
      if (ownCamp === "WOLF" && !otherWolfAlive) return { seat, skillRoleId, eligible: false, reason: "作为狼人阵营最后一狼不能开枪", day };
    }

    return { seat, skillRoleId, eligible: true, reason: "可以发动死亡技能", day };
  }

  return { calculateNightResolution, calculateSuggestedDeaths, getDeathSkillResolution };
});
