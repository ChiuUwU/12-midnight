(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BalancedDeal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PLAYER_COUNT = 12;
  const HISTORY_LIMIT = 10;
  const DEFAULT_CANDIDATE_COUNT = 2000;
  const TEMPERATURE = 3;
  const KEY_ROLE_PAIRS = {
    masquerade: ["dancer", "mask"],
    realm_of_trickery: ["magician", "trickster"]
  };

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  function shuffle(values, randomInt) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createSkillProfile(randomInt) {
    const dropOptions = [0, 4, 7, 11, 16, 22];
    let cumulative;
    do {
      cumulative = [0];
      for (let layer = 1; layer < 6; layer += 1) {
        cumulative.push(cumulative[cumulative.length - 1] + dropOptions[randomInt(dropOptions.length)]);
      }
    } while (cumulative[cumulative.length - 1] < 20);
    const maximum = cumulative[cumulative.length - 1];
    const levels = cumulative.map((value) => Math.round(100 - value / maximum * 72));
    const layers = [[6, 7], [5, 8], [4, 9], [3, 10], [2, 11], [1, 12]];
    const skills = Array(PLAYER_COUNT).fill(0);
    layers.forEach((seats, layer) => seats.forEach((seat) => {
      skills[seat - 1] = Math.max(0, Math.min(100, levels[layer] + randomInt(7) - 3));
    }));
    return skills;
  }

  function createWolfTarget(randomInt) {
    const roll = randomInt(100);
    if (roll < 25) return { type: "WEAK", value: -(randomInt(8) + 3) };
    if (roll < 65) return { type: "EVEN", value: randomInt(7) - 3 };
    if (roll < 95) return { type: "SLIGHTLY_STRONG", value: randomInt(8) + 3 };
    return { type: "STRONG", value: randomInt(7) + 10 };
  }

  function createKeyRoleMode(randomInt, skills) {
    const sorted = skills.slice().sort((left, right) => left - right);
    const roll = randomInt(100);
    if (roll < 60) return { type: "STANDARD", threshold: (sorted[5] + sorted[6]) / 2, coefficient: 0.45 };
    if (roll < 85) return { type: "RELAXED", threshold: sorted[3], coefficient: 0.15 };
    return { type: "FREE", threshold: 0, coefficient: 0 };
  }

  function getTreasureGod(assignments) {
    const treasure = assignments.find((assignment) => assignment.roleId === "treasure_master");
    const cards = treasure && treasure.abilityState && Array.isArray(treasure.abilityState.treasureCards)
      ? treasure.abilityState.treasureCards
      : [];
    return cards.find((roleId) => !["wolf", "villager"].includes(roleId)) || "";
  }

  function normalizeHistory(history) {
    return (Array.isArray(history) ? history : []).slice(-HISTORY_LIMIT).filter((game) =>
      game && Array.isArray(game.assignments) && game.assignments.length === PLAYER_COUNT
    );
  }

  function createContext(boardId, history, randomInt, wolfCount) {
    const skills = createSkillProfile(randomInt);
    const keyRoleMode = createKeyRoleMode(randomInt, skills);
    const referenceWolves = new Set(shuffle(Array.from({ length: PLAYER_COUNT }, (_, index) => index + 1), randomInt).slice(0, wolfCount));
    const recentPairHistory = history.slice(-HISTORY_LIMIT);
    const pairOppositeCounts = Array.from({ length: PLAYER_COUNT }, () => Array(PLAYER_COUNT).fill(0));
    const pairWolfWolfCounts = Array.from({ length: PLAYER_COUNT }, () => Array(PLAYER_COUNT).fill(0));
    recentPairHistory.forEach((game) => {
      const bySeat = new Map(game.assignments.map((assignment) => [assignment.seat, assignment]));
      for (let left = 1; left <= PLAYER_COUNT; left += 1) {
        for (let right = left + 1; right <= PLAYER_COUNT; right += 1) {
          const leftCamp = bySeat.get(left) && bySeat.get(left).camp;
          const rightCamp = bySeat.get(right) && bySeat.get(right).camp;
          if ((leftCamp === "WOLF") !== (rightCamp === "WOLF")) pairOppositeCounts[left - 1][right - 1] += 1;
          if (leftCamp === "WOLF" && rightCamp === "WOLF") pairWolfWolfCounts[left - 1][right - 1] += 1;
        }
      }
    });
    return {
      boardId,
      skills,
      wolfTarget: createWolfTarget(randomInt),
      keyRoleMode,
      referenceWolves,
      pairOppositeCounts,
      pairWolfWolfCounts,
      pairHistoryLength: recentPairHistory.length,
      targetOppositeRate: 2 * wolfCount * (PLAYER_COUNT - wolfCount) / (PLAYER_COUNT * (PLAYER_COUNT - 1)),
      targetWolfWolfRate: wolfCount * (wolfCount - 1) / (PLAYER_COUNT * (PLAYER_COUNT - 1))
    };
  }

  function scoreCandidate(assignments, boardId, history, context) {
    const bySeat = new Map(assignments.map((assignment) => [assignment.seat, assignment]));
    let historyPenalty = 0;
    assignments.forEach((assignment) => {
      const previous = history[history.length - 1] && history[history.length - 1].assignments.find((item) => item.seat === assignment.seat);
      const previous2 = history[history.length - 2] && history[history.length - 2].assignments.find((item) => item.seat === assignment.seat);
      if (previous && previous.roleId === assignment.roleId) historyPenalty += 12;
      if (previous && previous.camp === assignment.camp) historyPenalty += 1;
      if (previous2 && previous && previous2.camp === previous.camp && previous.camp === assignment.camp) historyPenalty += 3;
    });

    const wolfSkills = [];
    const goodSkills = [];
    const godSkills = [];
    assignments.forEach((assignment) => {
      const skill = context.skills[assignment.seat - 1];
      if (assignment.camp === "WOLF") wolfSkills.push(skill);
      if (assignment.camp === "GOOD") {
        goodSkills.push(skill);
        if (assignment.roleId !== "villager") godSkills.push(skill);
      }
    });
    const wolfAverage = average(wolfSkills);
    const goodAverage = average(goodSkills);
    const godAverage = average(godSkills);
    const strengthPenalty = 1.8 * Math.abs((wolfAverage - godAverage) - context.wolfTarget.value)
      + 0.6 * Math.abs((wolfAverage - goodAverage) - 0.6 * context.wolfTarget.value);

    let layoutPenalty = 0;
    assignments.forEach((assignment) => {
      if ((assignment.camp === "WOLF") !== context.referenceWolves.has(assignment.seat)) layoutPenalty += 15;
    });

    let pairDriftPenalty = 0;
    for (let left = 1; left <= PLAYER_COUNT; left += 1) {
      for (let right = left + 1; right <= PLAYER_COUNT; right += 1) {
        const currentOpposite = (bySeat.get(left).camp === "WOLF") !== (bySeat.get(right).camp === "WOLF") ? 1 : 0;
        const currentWolfWolf = bySeat.get(left).camp === "WOLF" && bySeat.get(right).camp === "WOLF" ? 1 : 0;
        const projectedRate = (context.pairOppositeCounts[left - 1][right - 1] + currentOpposite) / (context.pairHistoryLength + 1);
        const projectedWolfWolfRate = (context.pairWolfWolfCounts[left - 1][right - 1] + currentWolfWolf) / (context.pairHistoryLength + 1);
        pairDriftPenalty += 200 * Math.pow(projectedRate - context.targetOppositeRate, 2);
        pairDriftPenalty += 400 * Math.pow(projectedWolfWolfRate - context.targetWolfWolfRate, 2);
      }
    }

    let keyRolePenalty = 0;
    const keyPair = KEY_ROLE_PAIRS[boardId];
    if (keyPair) {
      const first = assignments.find((assignment) => assignment.roleId === keyPair[0]);
      const second = assignments.find((assignment) => assignment.roleId === keyPair[1]);
      if (first && second) {
        const firstSkill = context.skills[first.seat - 1];
        const secondSkill = context.skills[second.seat - 1];
        keyRolePenalty += 0.6 * Math.abs(firstSkill - secondSkill);
        keyRolePenalty += context.keyRoleMode.coefficient * Math.max(0, context.keyRoleMode.threshold - firstSkill);
        keyRolePenalty += context.keyRoleMode.coefficient * Math.max(0, context.keyRoleMode.threshold - secondSkill);
        const recent = history.slice(-6);
        keyRolePenalty += recent.filter((game) => game.assignments.some((item) => item.seat === first.seat && item.roleId === first.roleId)).length * 2;
        keyRolePenalty += recent.filter((game) => game.assignments.some((item) => item.seat === second.seat && item.roleId === second.roleId)).length * 2;
      }
    }

    let specialPenalty = 0;
    if (boardId === "treasure_master") {
      const treasureGod = getTreasureGod(assignments);
      const recentTreasure = history.filter((game) => game.boardId === "treasure_master").slice(-4);
      const recentCount = recentTreasure.filter((game) => game.treasureGodId === treasureGod).length;
      specialPenalty += recentCount * 3;
      if (recentTreasure.length && recentTreasure[recentTreasure.length - 1].treasureGodId === treasureGod) specialPenalty += 10;
      if (recentCount >= 3) specialPenalty += 8;
    }

    return {
      totalPenalty: historyPenalty + strengthPenalty + layoutPenalty + pairDriftPenalty + keyRolePenalty + specialPenalty,
      components: { historyPenalty, strengthPenalty, layoutPenalty, pairDriftPenalty, keyRolePenalty, specialPenalty },
      averages: { wolf: wolfAverage, good: goodAverage, god: godAverage }
    };
  }

  function weightedChoice(candidates, randomInt) {
    const minimum = Math.min(...candidates.map((candidate) => candidate.score.totalPenalty));
    const weights = candidates.map((candidate) => Math.exp(-(candidate.score.totalPenalty - minimum) / TEMPERATURE));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = randomInt(1000000000) / 1000000000 * totalWeight;
    for (let index = 0; index < candidates.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) return candidates[index];
    }
    return candidates[candidates.length - 1];
  }

  function createHistoryEntry(boardId, assignments, createdAt) {
    return {
      boardId,
      assignments: assignments.map((assignment) => ({ seat: assignment.seat, roleId: assignment.roleId, camp: assignment.camp })),
      treasureGodId: boardId === "treasure_master" ? getTreasureGod(assignments) : "",
      createdAt
    };
  }

  function createBalancedDeal(options) {
    const boardId = options.boardId;
    const history = normalizeHistory(options.history);
    const randomInt = options.randomInt;
    const createCandidate = options.createCandidate;
    const candidateCount = Number(options.candidateCount || DEFAULT_CANDIDATE_COUNT);
    if (typeof randomInt !== "function" || typeof createCandidate !== "function") throw new Error("均衡发牌缺少随机数或候选生成器");
    const firstCandidate = createCandidate();
    const wolfCount = firstCandidate.filter((assignment) => assignment.camp === "WOLF").length;
    const context = createContext(boardId, history, randomInt, wolfCount);
    const candidates = [{ assignments: firstCandidate }];
    while (candidates.length < candidateCount) candidates.push({ assignments: createCandidate() });
    candidates.forEach((candidate) => {
      candidate.score = scoreCandidate(candidate.assignments, boardId, history, context);
    });
    const selected = weightedChoice(candidates, randomInt);
    const historyEntry = createHistoryEntry(boardId, selected.assignments, Date.now());
    return {
      assignments: selected.assignments,
      history: [...history, historyEntry].slice(-HISTORY_LIMIT),
      meta: {
        candidateCount,
        skillProfile: context.skills,
        wolfTarget: context.wolfTarget,
        keyRoleMode: context.keyRoleMode.type,
        totalPenalty: selected.score.totalPenalty,
        components: selected.score.components,
        averages: selected.score.averages
      }
    };
  }

  return {
    createBalancedDeal,
    createHistoryEntry,
    scoreCandidate,
    constants: { HISTORY_LIMIT, DEFAULT_CANDIDATE_COUNT, TEMPERATURE }
  };
});
