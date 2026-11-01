import balancedDeal from "../../../web/balanced-deal.js";
import targetMapping from "../../../web/target-mapping.js";
import roomRecords from "../../../web/room-records.js";
import nightResolution from "../../../web/night-resolution.js";
import wolfKnifePolicy from "../../../web/wolf-knife-policy.js";
import fixedNight from "../../../web/fixed-night-flow.js";
import dayVoice from "../../../web/day-skill-voice.js";

const { createBalancedDeal } = balancedDeal;
const { resolveNightTarget, syncNightTargetResolutions } = targetMapping;
const { calculateNightResolution, getDeathSkillResolution, getGameOutcome } = nightResolution;
const { recordPrivateEvent, privateEventsForViewer, createDeathRecord, publicDeathRecord, openDaySkillWindow, resolveDaySkillWindow, daySkillWindowForViewer } = roomRecords;

const DEFAULT_RULES = {
  winCondition: "KILL_SIDE",
  sheriffEnabled: true,
  lastWordsEnabled: true,
  nightDeathLastWords: false,
  witchCanSelfSave: false,
  witchAntidoteCount: 1,
  witchPoisonCount: 1,
  guardCanRepeatTarget: false,
  wolvesCanNoKill: true,
  seerCanSkipCheck: false,
  spiritMediumCanSkipCheck: false,
  tieRule: "PK_THEN_NO_OUT_ON_SECOND_TIE"
};

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const SYSTEM_STEP_ANNOUNCEMENT_DELAY_MS = 10000;
const SYSTEM_STEP_TIMEOUT_OPTIONS = new Set([0, 60, 90, 120]);
const CONTROLLER_TRANSFER_CODE_TTL_MS = 5 * 60 * 1000;
const JUDGE_CLAIM_MAX_FAILURES = 5;
const JUDGE_CLAIM_LOCK_MS = 5 * 60 * 1000;
const SEAT_WRITE_MAX_ATTEMPTS = 16;

class RoomConflictError extends Error {}

const BOARDS = [
  {
    id: "pre_witch_hunter_idiot_mixed",
    name: "预女猎白混",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "hunter", count: 1, camp: "GOOD" },
      { roleId: "idiot", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 3, camp: "GOOD" },
      { roleId: "mixed_blood", count: 1, camp: "FOLLOW" },
      { roleId: "wolf", count: 4, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "masquerade",
    name: "假面舞会",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "dancer", count: 1, camp: "GOOD" },
      { roleId: "idiot", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "mask", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "treasure_master",
    name: "盗宝大师",
    playerCount: 12,
    playerSpecialRole: { roleId: "treasure_master", count: 1, camp: "WOLF" },
    deckPool: [
      { roleId: "spirit_medium", count: 1, camp: "GOOD" },
      { roleId: "poisoner", count: 1, camp: "GOOD" },
      { roleId: "hunter", count: 1, camp: "GOOD" },
      { roleId: "dreamer", count: 1, camp: "GOOD" },
      { roleId: "masked_man", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 5, camp: "GOOD" },
      { roleId: "wolf_king", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES,
    specialRules: {
      treasureMaster: {
        fixedCards: ["wolf", "villager"],
        godCardPoolExcludes: [],
        allowMaskedManInTreasureCards: true,
        firstNightWolfKillDisabled: true
      }
    }
  },
  {
    id: "mechanical_wolf_spirit_medium",
    name: "机械狼通灵师",
    playerCount: 12,
    roles: [
      { roleId: "spirit_medium", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "hunter", count: 1, camp: "GOOD" },
      { roleId: "guard", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "mechanical_wolf", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "realm_of_trickery",
    name: "诡术之境",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "magician", count: 1, camp: "GOOD" },
      { roleId: "order_prince", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "trickster", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "dawn_voyage",
    name: "曙光航纪",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "captain", count: 1, camp: "GOOD" },
      { roleId: "idiot", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "siren", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "wolf_king_guard",
    name: "狼王守卫",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "guard", count: 1, camp: "GOOD" },
      { roleId: "hunter", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "wolf_king", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 3, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "follow_neighbor",
    name: "唯邻是从",
    playerCount: 12,
    roles: [
      { roleId: "seer", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "guard", count: 1, camp: "GOOD" },
      { roleId: "hunter", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 5, camp: "GOOD" },
      { roleId: "wolf_king", count: 1, camp: "WOLF" },
      { roleId: "wolf", count: 2, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  },
  {
    id: "dark_destruction_2",
    name: "暗黑破坏2.0",
    playerCount: 12,
    roles: [
      { roleId: "archangel", count: 1, camp: "GOOD" },
      { roleId: "cain", count: 1, camp: "GOOD" },
      { roleId: "witch", count: 1, camp: "GOOD" },
      { roleId: "dreamer", count: 1, camp: "GOOD" },
      { roleId: "villager", count: 4, camp: "GOOD" },
      { roleId: "wolf", count: 1, camp: "WOLF" },
      { roleId: "wolf_king", count: 1, camp: "WOLF" },
      { roleId: "lilith", count: 1, camp: "WOLF" },
      { roleId: "lia", count: 1, camp: "WOLF" }
    ],
    globalRules: DEFAULT_RULES
  }
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function error(status, message) {
  return json({ error: message }, status);
}

function randomDigits(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join("");
}

function randomHex(bytesLength) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const RANDOM_POOL = new Uint32Array(4096);
let randomPoolIndex = RANDOM_POOL.length;

function nextSecureUint32() {
  if (randomPoolIndex >= RANDOM_POOL.length) {
    crypto.getRandomValues(RANDOM_POOL);
    randomPoolIndex = 0;
  }
  const value = RANDOM_POOL[randomPoolIndex];
  randomPoolIndex += 1;
  return value;
}

function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("随机数范围不合法");
  const maximum = 0x100000000;
  const limit = Math.floor(maximum / maxExclusive) * maxExclusive;
  let value;
  do {
    value = nextSecureUint32();
  } while (value >= limit);
  return value % maxExclusive;
}

function createSeats() {
  return Array.from({ length: 12 }, (_, index) => ({
    seat: index + 1,
    clientId: "",
    userId: "",
    nickname: "",
    occupied: false
  }));
}

function getBoard(boardId) {
  return BOARDS.find((board) => board.id === boardId);
}

function writeLog(room, type, payload) {
  room.logs.push({
    id: `${Date.now()}-${room.logs.length}`,
    type,
    payload,
    createdAt: Date.now()
  });
}

function flattenEntries(entries) {
  const cards = [];
  entries.forEach((entry) => {
    for (let index = 0; index < entry.count; index += 1) {
      cards.push({ roleId: entry.roleId, camp: entry.camp });
    }
  });
  return cards;
}

function shuffle(cards) {
  const result = cards.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = secureRandomInt(index + 1);
    const current = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }
  return result;
}

function removeOne(cards, roleId) {
  const index = cards.findIndex((card) => card.roleId === roleId);
  if (index < 0) throw new Error(`牌池中缺少 ${roleId}`);
  return cards.splice(index, 1)[0];
}

function pickTreasureGodCard(cards, board) {
  const excludes = board.specialRules.treasureMaster.godCardPoolExcludes || [];
  const candidates = cards.filter((card) => {
    if (card.camp !== "GOOD") return false;
    if (card.roleId === "villager") return false;
    if (excludes.includes(card.roleId)) return false;
    return true;
  });
  if (!candidates.length) throw new Error("盗宝神职牌池为空");
  const chosen = candidates[secureRandomInt(candidates.length)];
  return removeOne(cards, chosen.roleId);
}

function assignCards(seats, cards) {
  const shuffled = shuffle(cards);
  return seats.map((seat, index) => ({
    seat,
    roleId: shuffled[index].roleId,
    camp: shuffled[index].camp,
    alive: true,
    sheriff: false,
    revealed: false,
      publiclyRevealed: false,
    abilityState: {
      treasureCards: shuffled[index].treasureCards || undefined
    },
    marks: []
  }));
}

function dealTreasureMasterBoard(board, seats) {
  const pool = flattenEntries(board.deckPool);
  const treasureCards = [];
  board.specialRules.treasureMaster.fixedCards.forEach((roleId) => {
    treasureCards.push(removeOne(pool, roleId));
  });
  treasureCards.push(pickTreasureGodCard(pool, board));
  const playerCards = [
    {
      roleId: board.playerSpecialRole.roleId,
      camp: "WOLF",
      treasureCards: treasureCards.map((card) => card.roleId)
    },
    ...pool
  ];
  if (playerCards.length !== board.playerCount) {
    throw new Error(`盗宝大师版型场上牌数应为 ${board.playerCount}，实际为 ${playerCards.length}`);
  }
  return assignCards(seats, playerCards);
}

function dealBoard(boardId, seats) {
  const board = getBoard(boardId);
  if (!board) throw new Error("版型不存在");
  if (seats.length !== board.playerCount) throw new Error(`需要 ${board.playerCount} 个座位才能发牌`);
  if (board.id === "treasure_master") return dealTreasureMasterBoard(board, seats);
  const cards = flattenEntries(board.roles);
  if (cards.length !== board.playerCount) {
    throw new Error(`版型牌数应为 ${board.playerCount}，实际为 ${cards.length}`);
  }
  return assignCards(seats, cards);
}

function hasUsedNightStep(room, stepId) {
  return (room && room.nightActions || []).some((action) => action.stepId === stepId && !action.skipped);
}

function isDarkDestruction(room) {
  return room?.boardId === "dark_destruction_2";
}

function darkRoleSeat(room, roleId) {
  return (room?.assignments || []).find((assignment) => assignment.roleId === roleId)?.seat || 0;
}

function darkBindingTarget(room, night = room?.night) {
  const action = (room?.nightActions || []).find((item) => item.night === night && item.stepId === "lilith_bind" && !item.skipped);
  return Number(action?.targetSeats?.[0] || 0);
}

function isDarkRoleBound(room, roleId, night = room?.night) {
  const seat = darkRoleSeat(room, roleId);
  return Boolean(seat && darkBindingTarget(room, night) === seat);
}

function hasUsedArchangelBless(room) {
  return (room?.nightActions || []).some((action) => action.stepId === "archangel_bless" && !action.skipped);
}

function archangelReviveDisabled(room) {
  const archangelSeat = darkRoleSeat(room, "archangel");
  return Boolean(archangelSeat && (room?.nightActions || []).some((action) =>
    action.stepId === "lilith_bind" && Number(action.targetSeats?.[0]) === Number(archangelSeat)
  ));
}

function canOfferArchangelRevive(room, targetSeat) {
  const archangel = (room?.assignments || []).find((assignment) => assignment.roleId === "archangel");
  return Boolean(isDarkDestruction(room)
    && targetSeat
    && archangel
    && archangel.alive !== false
    && Number(archangel.seat) !== Number(targetSeat)
    && !room.archangelReviveUsed
    && !archangelReviveDisabled(room));
}

function hasSuccessfulLiaCharge(room) {
  return (room?.nightActions || []).some((action) => action.stepId === "lia_charge" && action.success === true);
}

function hasUsedLiaFog(room) {
  return (room?.nightActions || []).some((action) => action.stepId === "lia_fog" && !action.skipped);
}

function hasUsedWitchAntidote(room) {
  return (room && room.nightActions || []).some((action) =>
    (action.stepId === "witch_antidote" && !action.skipped) ||
    (action.stepId === "witch_action" && action.antidoteUsed)
  );
}

function hasUsedWitchPoison(room) {
  return (room && room.nightActions || []).some((action) =>
    (action.stepId === "witch_poison" && !action.skipped) ||
    (action.stepId === "witch_action" && Number(action.poisonTargetSeat) > 0)
  );
}

function createWitchStep(room) {
  const antidoteAvailable = !hasUsedWitchAntidote(room);
  const poisonAvailable = !hasUsedWitchPoison(room);
  if (!antidoteAvailable && !poisonAvailable && !fixedNight.enabled(room)) return null;
  return { id: "witch_action", actor: "witch", label: "女巫行动", targetCount: 0, allowSkip: false, antidoteAvailable, poisonAvailable, singlePotionPerNight: true };
}

function getAvailableSwapSeats(room, stepId) {
  const used = new Set((room && room.nightActions || []).filter((action) => action.stepId === stepId && !action.skipped).flatMap((action) => action.targetSeats || []).map(Number));
  return (room && room.assignments || []).filter((assignment) => assignment.alive !== false && !used.has(assignment.seat)).map((assignment) => assignment.seat).sort((left, right) => left - right);
}

function didSkipPreviousNight(room, stepId, night) {
  const previous = (room && room.nightActions || []).find((action) => action.night === night - 1 && action.stepId === stepId);
  return Boolean(previous && previous.skipped);
}

function sameSeatPair(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === 2 && right.length === 2 && [...left].map(Number).sort((a, b) => a - b).join(",") === [...right].map(Number).sort((a, b) => a - b).join(",");
}

function refreshSwapConflict(room, night) {
  const actions = (room.nightActions || []).filter((action) => action.night === night && ["trickster_swap", "magician_swap"].includes(action.stepId));
  actions.forEach((action) => { action.invalidByConflict = false; });
  const trickster = actions.find((action) => action.stepId === "trickster_swap" && !action.skipped);
  const magician = actions.find((action) => action.stepId === "magician_swap" && !action.skipped);
  if (trickster && magician && sameSeatPair(trickster.targetSeats, magician.targetSeats)) {
    trickster.invalidByConflict = true;
    magician.invalidByConflict = true;
  }
}

function getActiveSwapPair(room, stepId, night = room.night) {
  const action = (room.nightActions || []).find((item) => item.night === night && item.stepId === stepId && !item.skipped && !item.invalidByConflict);
  return action && action.targetSeats && action.targetSeats.length === 2 ? action.targetSeats.map(Number) : [];
}

function mapSeatWithPair(seat, pair) {
  const value = Number(seat || 0);
  if (pair.length !== 2) return value;
  if (value === pair[0]) return pair[1];
  if (value === pair[1]) return pair[0];
  return value;
}

function mapExileSeat(room, seat, day = room.night) {
  return room.boardId === "realm_of_trickery" ? mapSeatWithPair(seat, getActiveSwapPair(room, "trickster_swap", day)) : Number(seat || 0);
}

function getAvailableDanceSeats(room) {
  if (!room) return [];
  const dancedSeats = new Set(
    (room.nightActions || [])
      .filter((action) => action.stepId === "dancer_dance" && !action.skipped)
      .flatMap((action) => action.targetSeats || [])
  );
  return (room.assignments || [])
    .filter((assignment) => assignment.alive !== false && !dancedSeats.has(assignment.seat))
    .map((assignment) => assignment.seat)
    .sort((left, right) => left - right);
}

function roleAtTarget(room, action) {
  const seat = action && action.targetSeats && Number(action.targetSeats[0]);
  return (room && room.assignments || []).find((assignment) => assignment.seat === seat)?.roleId || "";
}

function previousMechanicalRole(room, night) {
  const action = (room && room.nightActions || []).find((item) => item.night === night - 1 && item.stepId === "mechanical_mimic" && !item.skipped);
  return roleAtTarget(room, action);
}

function currentTreasureCard(room, night = room && room.night) {
  return (room && room.nightActions || []).find((item) => item.night === night && item.stepId === "treasure_pick" && !item.skipped)?.cardRoleId || "";
}

function normalizeSystemStepTimeout(value) {
  const seconds = Number(value);
  return SYSTEM_STEP_TIMEOUT_OPTIONS.has(seconds) ? seconds : 0;
}

function shouldStartTreasureMaskedFinalNight(room, assignment) {
  return room.boardId === "treasure_master"
    && assignment?.roleId === "treasure_master"
    && currentTreasureCard(room, room.night) === "masked_man"
    && !(room.assignments || []).some((item) => item.alive !== false && ["wolf", "wolf_king"].includes(item.roleId));
}

function mechanicalSkillStep(room, night) {
  const roleId = previousMechanicalRole(room, night);
  const configs = {
    guard: { id: "mechanical_guard", label: "机械狼使用守卫技能", allowSkip: true },
    witch: { id: "mechanical_poison", label: "机械狼使用毒药技能", allowSkip: true },
    spirit_medium: { id: "mechanical_check", label: "机械狼查验具体身份", allowSkip: false }
  };
  if (roleId === "wolf") {
    const wolfPartnerAlive = (room.assignments || []).some((assignment) => assignment.alive !== false && assignment.roleId === "wolf");
    return wolfPartnerAlive ? null : { id: "mechanical_kill", actor: "mechanical_wolf", label: "机械狼发动技能刀", targetCount: 1, allowSkip: true, skillRoleId: roleId };
  }
  return configs[roleId] ? { ...configs[roleId], actor: "mechanical_wolf", targetCount: 1, skillRoleId: roleId } : null;
}

function shouldIncludeNightStep(room, step) {
  const assignments = room && room.assignments || [];
  if (!assignments.length || step.actor === "system") return true;
  if (room.mode === "JUDGE" && isDarkDestruction(room) && ["lilith_bind", "lia_fog"].includes(step.id)) return true;
  if (step.actor === "wolf_team") return wolfKnifePolicy.hasKnifeActor(room.boardId, assignments);
  if (isDarkDestruction(room)) {
    if (step.id !== "lilith_bind" && step.id !== "lia_raise" && step.id !== "dreamer_dream" && isDarkRoleBound(room, step.actor)) return false;
    if (step.id === "lia_charge" && hasSuccessfulLiaCharge(room)) return false;
    if (step.id === "lia_fog" && (!hasSuccessfulLiaCharge(room) || hasUsedLiaFog(room))) return false;
    if (step.id === "archangel_bless" && hasUsedArchangelBless(room)) return false;
  }
  if (step.id === "poisoner_poison" && hasUsedNightStep(room, "poisoner_poison")) return false;
  return assignments.some((assignment) => assignment.alive !== false && assignment.roleId === step.actor);
}

function getFollowNeighborPuppetSeats(room) {
  const wolves = (room.assignments || []).filter((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId));
  const wolfSeats = new Set(wolves.map((assignment) => assignment.seat));
  const candidates = new Set();
  wolves.forEach((assignment) => {
    candidates.add(assignment.seat === 1 ? 12 : assignment.seat - 1);
    candidates.add(assignment.seat === 12 ? 1 : assignment.seat + 1);
  });
  return [...candidates].filter((seat) => !wolfSeats.has(seat) && (room.assignments || []).some((assignment) => assignment.seat === seat && assignment.alive !== false)).sort((left, right) => left - right);
}

function createNightSteps(boardId, night, room = null) {
  const firstNight = night === 1;
  const steps = [];
  if (room?.treasureMaskedFinalNight?.status === "PENDING") {
    const dreamerAlive = (room.assignments || []).some((item) => item.roleId === "dreamer" && item.alive !== false);
    if (dreamerAlive) steps.push({ id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false });
    steps.push({ id: "treasure_mask_final_kill", actor: "treasure_mask_final", label: "盗宝蒙面狼进行濒死最终刀", targetCount: 1, allowSkip: false });
    return steps;
  }
  if (boardId === "follow_neighbor") {
    const witchStep = createWitchStep(room);
    steps.push({ id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true });
    if (firstNight) steps.push({ id: "puppet_select", actor: "wolf_team", label: "狼人和狼王选择傀儡目标", targetCount: 1, allowSkip: false, allowedSeats: getFollowNeighborPuppetSeats(room) });
    steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人和狼王选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
  } else if (boardId === "dark_destruction_2") {
    const witchStep = createWitchStep(room);
    const lilithInactive = room?.mode === "JUDGE" && (room.assignments || []).some((item) => item.roleId === "lilith" && item.alive === false);
    steps.push({ id: "lilith_bind", actor: "lilith", label: "莉莉丝选择禁锢目标", targetCount: 1, allowSkip: Boolean(lilithInactive), inactive: Boolean(lilithInactive) });
    if (firstNight) steps.push({ id: "lia_raise", actor: "lia", label: "莉娅举手确认身份", targetCount: 0, allowSkip: false });
    steps.push(
      { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择梦游者", targetCount: 1, allowSkip: false },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
    );
    if (witchStep) steps.push(witchStep);
    steps.push(
      { id: "archangel_bless", actor: "archangel", label: "天使长选择是否祝福", targetCount: 1, allowSkip: true },
      { id: "cain_check", actor: "cain", label: "凯恩鉴定两名玩家的身份关系", targetCount: 2, allowSkip: false }
    );
    if (!hasSuccessfulLiaCharge(room)) {
      steps.push({ id: "lia_charge", actor: "lia", label: "莉娅选择充能目标", targetCount: 1, allowSkip: false });
    }
    if (room?.mode === "JUDGE" || (hasSuccessfulLiaCharge(room) && !hasUsedLiaFog(room))) steps.push({ id: "lia_fog", actor: "lia", label: "莉娅选择是否开启迷雾", targetCount: 0, allowSkip: true });
  } else if (boardId === "wolf_king_guard") {
    const witchStep = createWitchStep(room);
    steps.push(
      { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人和狼王选择击杀目标", targetCount: 1, allowSkip: true }
    );
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (firstNight) steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
  } else if (boardId === "pre_witch_hunter_idiot_mixed") {
    if (firstNight) steps.push({ id: "mixed_blood_model", actor: "mixed_blood", label: "混血儿选择榜样", targetCount: 1, allowSkip: false });
    const witchStep = createWitchStep(room);
    steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (firstNight) {
      steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
      steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
    }
  } else if (boardId === "masquerade") {
    const witchStep = createWitchStep(room);
    steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (!firstNight) {
      const availableDanceSeats = getAvailableDanceSeats(room);
      if (availableDanceSeats.length >= 3) {
        steps.push({ id: "dancer_dance", actor: "dancer", label: "舞者选择三名共舞玩家", targetCount: 3, allowSkip: false, allowedSeats: availableDanceSeats });
      }
      steps.push(
        { id: "mask_check", actor: "mask", label: "假面验证是否在舞池", targetCount: 1, allowSkip: false },
        { id: "mask_give", actor: "mask", label: "假面给予面具", targetCount: 1, allowSkip: false }
      );
    }
    if (firstNight) {
      steps.push({ id: "dancer_confirm", actor: "dancer", label: "舞者确认身份", targetCount: 0, allowSkip: false });
      steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
    }
  } else if (boardId === "treasure_master") {
    steps.push(
      { id: "treasure_pick", actor: "treasure_master", label: "盗宝大师选择今晚使用的盗宝牌", targetCount: 0, allowSkip: false, needsCard: true },
      { id: "treasure_skill", actor: "treasure_master", label: "盗宝大师使用盗宝牌技能", targetCount: 1, allowSkip: true },
      { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false }
    );
    if (!firstNight) steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    steps.push(
      { id: "poisoner_poison", actor: "poisoner", label: "毒师选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
    if (firstNight) {
      steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
      steps.push({ id: "masked_man_confirm", actor: "masked_man", label: "蒙面人确认身份", targetCount: 0, allowSkip: false });
    }
  } else if (boardId === "mechanical_wolf_spirit_medium") {
    const witchStep = createWitchStep(room);
    if (!firstNight && room?.mode === "SYSTEM") steps.push({ id: "mechanical_knife_confirm", actor: "mechanical_wolf", label: "机械狼确认带刀状态", targetCount: 0, allowSkip: false });
    steps.push(
      { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
    );
    if (witchStep) steps.push(witchStep);
    if (!firstNight) {
      const skillStep = mechanicalSkillStep(room, night);
      if (skillStep) steps.push(skillStep);
      else if (fixedNight.enabled(room)) steps.push({ id: "mechanical_skill_wait", actor: "mechanical_wolf", label: "机械狼技能夜", targetCount: 0, allowSkip: true, inactive: true });
    }
    steps.push(
      { id: "mechanical_mimic", actor: "mechanical_wolf", label: "机械狼选择模仿目标", targetCount: 1, allowSkip: false },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
    if (firstNight) steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
  } else if (boardId === "realm_of_trickery") {
    const tricksterSeats = getAvailableSwapSeats(room, "trickster_swap");
    const magicianSeats = getAvailableSwapSeats(room, "magician_swap");
    const witchStep = createWitchStep(room);
    if (tricksterSeats.length >= 2) steps.push({ id: "trickster_swap", actor: "trickster", label: "诡术师交换两个号码", targetCount: 2, allowSkip: !didSkipPreviousNight(room, "trickster_swap", night), allowedSeats: tricksterSeats });
    else if (fixedNight.enabled(room)) steps.push({ id: "trickster_swap", actor: "trickster", label: "诡术师交换两个号码", targetCount: 0, inactive: true });
    if (magicianSeats.length >= 2) steps.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 2, allowSkip: true, allowedSeats: magicianSeats, targetMapping: { id: "magician_swap", kind: "SWAP", appliesTo: ["wolves_kill", "witch_antidote", "witch_poison", "seer_check"], order: 100 } });
    else if (fixedNight.enabled(room)) steps.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 0, inactive: true });
    steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (firstNight) steps.push({ id: "order_prince_confirm", actor: "order_prince", label: "定序王子确认身份", targetCount: 0, allowSkip: false });
  } else if (boardId === "dawn_voyage") {
    const witchStep = createWitchStep(room);
    const sirenAlive = (room && room.assignments || []).some((a) => a.roleId === "siren" && a.alive !== false);
    if (sirenAlive) {
      const lastWind = firstNight ? null : (room && room.lastWindDirection || "calm");
      steps.push({ id: "siren_wind", actor: "siren", label: "海妖选择风向", targetCount: 0, allowSkip: false, lastWindDirection: lastWind });
    }
    if (!firstNight) {
      const captainAlive = (room && room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
      if (captainAlive) {
        const capSeat = (room && room.assignments || []).find((a) => a.roleId === "captain" && a.alive !== false).seat;
        const aliveSeats = (room && room.assignments || []).filter((a) => a.alive !== false && a.seat !== capSeat).map((a) => a.seat).sort((a, b) => a - b);
        if (aliveSeats.length) {
          steps.push({ id: "captain_board", actor: "captain", label: "船长选择登船目标", targetCount: 1, allowSkip: false, allowedSeats: aliveSeats });
        }
      }
    }
    steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) steps.push(witchStep);
    steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (firstNight) {
      steps.push({ id: "captain_confirm", actor: "captain", label: "船长确认身份", targetCount: 0, allowSkip: false });
      steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
    }
  }
  return steps.filter((step) => fixedNight.enabled(room) || shouldIncludeNightStep(room, step)).map((step, index) => ({ ...step, index }));
}

function rebuildNightStepsAfterDarkAction(room) {
  const completed = new Set((room.nightActions || [])
    .filter((action) => action.night === room.night)
    .map((action) => action.stepId));
  room.currentNightSteps = createNightSteps(room.boardId, room.night, room)
    .filter((step) => !completed.has(step.id))
    .map((step, index) => ({ ...step, index }));
  room.currentNightStepIndex = 0;
}

function rebuildNightStepsAfterUndo(room) {
  const completed = new Set((room.nightActions || [])
    .filter((action) => action.night === room.night)
    .map((action) => action.stepId));
  room.currentNightSteps = createNightSteps(room.boardId, room.night, room)
    .filter((step) => !completed.has(step.id))
    .map((step, index) => ({ ...step, index }));
  room.currentNightStepIndex = 0;
}

function isSheriffElectionDay(room) {
  return room?.phase === "DAY" && (room.night === 1 || (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1));
}

function isSheriffSelfDestructWindowOpen(room) {
  return isSheriffElectionDay(room) && Number(room.sheriffStageClosedDay || 0) !== Number(room.night) && !room.sheriffElectionDone && !room.sheriffBadge?.lost;
}

function recordSheriffElectionSelfDestruct(room, seat) {
  const assignment = (room.assignments || []).find((item) => Number(item.seat) === Number(seat));
  if (isDarkDestruction(room) && darkBindingTarget(room, room.night) === Number(seat)) throw new Error("被禁锢的狼人不能自爆");
  if (!assignment || assignment.alive === false || (assignment.currentCamp || assignment.camp) !== "WOLF"
    || ["mixed_blood", "mechanical_wolf", "lia"].includes(assignment.roleId)) {
    throw new Error("自爆座位必须是存活的狼人阵营玩家");
  }
  assignment.alive = false;
  const firstContest = room.night === 1;
  const record = addDeathRecord(room, {
    day: room.night,
    phase: "SELF_DESTRUCT",
    seats: [Number(seat)],
    reasons: { [String(seat)]: ["狼人自爆"] },
    sourceAction: { kind: "SELF_DESTRUCT", seat: Number(seat) },
    resolutionOrder: 1
  });
  if (firstContest) {
    room.sheriffElectionDeferredDay = 1;
    room.sheriffElectionDone = true;
    room.sheriffCandidates = [];
    room.sheriffWithdrawn = [];
    room.sheriffVoteRecord = null;
  } else {
    room.sheriffElectionDone = true;
    room.sheriffBadge = { holderSeat: 0, lost: true };
    room.assignments.forEach((item) => { item.sheriff = false; });
  }
  room.pendingSheriffSelfDestructSeat = Number(seat);
  if (!room.pendingNightResolution) queueDarkDeathResolution(room, [Number(seat)], "SELF_DESTRUCT", record.reasons);
  room.pendingJudgeNightAfterSelfDestruct = room.mode === "JUDGE";
  room.pendingSystemNightAfterSelfDestruct = room.mode === "SYSTEM";
  writeLog(room, "WOLF_SELF_DESTRUCTED", { seat: Number(seat), roleId: assignment.roleId, sheriffElectionDeferred: firstContest, badgeLost: !firstContest });
  addPublicAnnouncement(room, `${seat}号玩家自爆。`);
  return record;
}

async function readBody(request) {
  if (request.method === "GET") return {};
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

async function loadRoom(env, roomId) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM rooms WHERE id = ?").bind(roomId).first();
  if (!row) return null;
  if (Date.now() - Number(row.updated_at || 0) > ROOM_TTL_MS) {
    await env.DB.prepare("DELETE FROM rooms WHERE id = ? AND updated_at = ?").bind(roomId, Number(row.updated_at || 0)).run();
    return null;
  }
  const room = JSON.parse(row.data);
  room.persistedUpdatedAt = Number(row.updated_at || 0);
  return room;
}

async function ensureGameArchivesTable(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS game_archives (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, board_id TEXT NOT NULL, mode TEXT NOT NULL, phase TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_game_archives_updated_at ON game_archives(updated_at)").run();
}

function archiveSnapshot(room) {
  return {
    version: 1, roomId: room.id, boardId: room.boardId, mode: room.mode, phase: room.phase,
    night: room.night, createdAt: room.createdAt, updatedAt: room.updatedAt,
    assignments: (room.assignments || []).map((item) => ({ seat: item.seat, roleId: item.roleId, camp: item.camp, currentCamp: item.currentCamp, alive: item.alive, sheriff: item.sheriff, abilityState: item.abilityState })),
    nightActions: room.nightActions || [], deathRecords: room.deathRecords || [], exileRecords: room.exileRecords || [],
    dayVoteHistory: room.dayVoteHistory || [], activeBallot: room.activeDarkBallot || null, abortedBallots: room.abortedBallots || [],
    gameOutcome: room.gameOutcome || null,
    logs: (room.logs || []).filter((entry) => !/^(CONTROLLER_TRANSFER|JUDGE_CLAIM)/.test(entry.type || ""))
  };
}

async function saveRoom(env, room, effects = {}) {
  const expectedUpdatedAt = Number(room.persistedUpdatedAt || 0);
  const now = Math.max(Date.now(), expectedUpdatedAt + 1);
  room.createdAt = room.createdAt || now;
  room.updatedAt = now;
  if (!effects.preserveRevision) room.revision = Number(room.revision || 0) + 1;
  const shouldArchive = !effects.heartbeat && room.phase !== "WAITING" && (room.assignments || []).length > 0;
  if (shouldArchive) {
    room.archiveId = room.archiveId || randomHex(16);
    await ensureGameArchivesTable(env);
  }
  const mutationId = randomHex(12);
  room.persistenceMutationId = mutationId;
  const { persistedUpdatedAt, ...storedRoom } = room;
  const data = JSON.stringify(storedRoom);
  if (!expectedUpdatedAt) {
    await env.DB.prepare("INSERT INTO rooms (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(room.id, data, room.createdAt, now)
      .run();
  } else if (effects.dealHistory || effects.gameResult || shouldArchive) {
    const statements = [];
    const requirements = [];
    const bindings = [data, now, room.id, expectedUpdatedAt];
    if (effects.dealHistory) {
      const { profileId, expectedUpdatedAt: historyUpdatedAt } = effects.dealHistory;
      requirements.push("((? = 0 AND NOT EXISTS (SELECT 1 FROM deal_histories WHERE profile_id = ?)) OR (? > 0 AND EXISTS (SELECT 1 FROM deal_histories WHERE profile_id = ? AND updated_at = ?)))");
      bindings.push(historyUpdatedAt, profileId, historyUpdatedAt, profileId, historyUpdatedAt);
    }
    statements.push(env.DB.prepare(`UPDATE rooms SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?${requirements.length ? ` AND ${requirements.join(" AND ")}` : ""}`).bind(...bindings));
    if (effects.dealHistory) {
      const { profileId, history } = effects.dealHistory;
      statements.push(env.DB.prepare(
        "INSERT INTO deal_histories (profile_id, data, updated_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND json_extract(data, '$.persistenceMutationId') = ?) " +
        "ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      ).bind(profileId, JSON.stringify(history.slice(-10)), now, room.id, mutationId));
    }
    if (effects.gameResult) {
      const result = effects.gameResult;
      statements.push(env.DB.prepare(
        "INSERT INTO game_results (id, board_id, room_id, result, data, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND json_extract(data, '$.persistenceMutationId') = ?)"
      ).bind(result.id, result.boardId, result.roomId, result.result, result.data, result.createdAt, room.id, mutationId));
    }
    if (shouldArchive) {
      statements.push(env.DB.prepare(
        "INSERT INTO game_archives (id, room_id, board_id, mode, phase, created_at, updated_at, data) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND json_extract(data, '$.persistenceMutationId') = ?) " +
        "ON CONFLICT(id) DO UPDATE SET phase = excluded.phase, updated_at = excluded.updated_at, data = excluded.data"
      ).bind(room.archiveId, room.id, room.boardId, room.mode, room.phase, room.createdAt, now, JSON.stringify(archiveSnapshot(room)), room.id, mutationId));
    }
    const results = await env.DB.batch(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1) throw new RoomConflictError("房间状态已更新，请刷新后重试");
  } else {
    const result = await env.DB.prepare("UPDATE rooms SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .bind(data, now, room.id, expectedUpdatedAt)
      .run();
    if (Number(result.meta?.changes || 0) !== 1) throw new RoomConflictError("房间状态已更新，请刷新后重试");
  }
  room.persistedUpdatedAt = now;
}

async function reserveSeat(env, room, roomId, body, clientId, judgeToken) {
  const seatNumber = Number(body.seat);
  for (let attempt = 0; attempt < SEAT_WRITE_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      const backoffMs = Math.min(80, 5 * (2 ** Math.min(attempt, 4))) + Math.floor(Math.random() * 16);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      room = await loadRoom(env, roomId);
      if (!room) return error(404, "房间不存在");
      normalizeSeatOccupancy(room);
    }

    if (!clientId) return error(400, "缺少玩家标识");
    if (room.phase !== "WAITING") return error(400, "发牌后不能换座");
    if (isController(room, judgeToken)) return error(400, "控制设备不占玩家座位");
    const targetSeat = room.seats.find((seat) => seat.seat === seatNumber);
    if (!targetSeat) return error(400, "座位不存在");
    if (targetSeat.clientId === clientId) {
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (targetSeat.occupied && targetSeat.clientId) {
      return error(409, "该号码刚被其他玩家选中，房间状态已刷新，请选择空位");
    }

    room.seats.forEach((seat) => {
      if (seat.clientId === clientId) {
        seat.clientId = "";
        seat.userId = "";
        seat.nickname = "";
        seat.occupied = false;
      }
    });
    targetSeat.clientId = clientId;
    targetSeat.userId = clientId;
    targetSeat.nickname = body.nickname || `${seatNumber}号`;
    targetSeat.occupied = true;
    writeLog(room, "SEAT_SELECTED", { seat: seatNumber });

    try {
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    } catch (writeError) {
      if (!(writeError instanceof RoomConflictError)) throw writeError;
      if (attempt === SEAT_WRITE_MAX_ATTEMPTS - 1) {
        return error(409, "多人正在同时入座，请稍等片刻后再选座");
      }
    }
  }
  return error(409, "多人正在同时入座，请稍等片刻后再选座");
}

async function cleanupExpiredRooms(env) {
  await env.DB.prepare("DELETE FROM rooms WHERE updated_at < ?").bind(Date.now() - ROOM_TTL_MS).run();
  await ensureDealHistoryTable(env);
  await env.DB.prepare("DELETE FROM deal_histories WHERE updated_at < ?").bind(Date.now() - 90 * 24 * 60 * 60 * 1000).run();
}

async function submitBallotVote(env, initialRoom, roomId, body, clientId, judgeToken) {
  let room = initialRoom;
  for (let attempt = 0; attempt < SEAT_WRITE_MAX_ATTEMPTS; attempt += 1) {
    if (attempt) {
      const backoffMs = Math.min(80, 5 * (2 ** Math.min(attempt, 4))) + Math.floor(Math.random() * 16);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      room = await loadRoom(env, roomId);
      if (!room) return error(404, "房间不存在");
      normalizeSeatOccupancy(room);
    }
    if (room.mode !== "SYSTEM") return error(403, "有法官模式请由法官记录线下票型");
    const ballot = room.activeDarkBallot;
    if (!ballot || ballot.status !== "OPEN" || ballot.day !== room.night) return error(400, "当前没有进行中的投票");
    if (body.ballotId && body.ballotId !== ballot.id) return error(409, "投票轮次已更新，请刷新后重新选择");
    if (!body.ballotId && body.expectedRevision !== undefined && Number(body.expectedRevision) !== Number(room.revision || 0)) return error(409, "房间状态已更新，请刷新后重试");
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    const targetSeat = Number(body.targetSeat);
    if (!ownSeat || !ballot.voterSeats.includes(ownSeat) || !(room.assignments || []).some((item) => item.seat === ownSeat && item.alive !== false)) return error(403, "只有本轮存活且有投票资格的玩家可以投票");
    if (!Number.isInteger(targetSeat) || (targetSeat !== 0 && !ballot.allowedTargets.includes(targetSeat))) return error(400, "投票目标不合法");
    if (Object.prototype.hasOwnProperty.call(ballot.votes, String(ownSeat))) {
      if (Number(ballot.votes[String(ownSeat)]) !== targetSeat) return error(409, "投票已提交，以首次成功提交的选择为准");
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }), alreadySubmitted: true });
    }
    ballot.votes[String(ownSeat)] = targetSeat;
    writeLog(room, "DARK_BALLOT_SUBMITTED", { day: ballot.day, round: ballot.round, voterSeat: ownSeat });
    try {
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    } catch (writeError) {
      if (!(writeError instanceof RoomConflictError)) throw writeError;
      if (attempt === SEAT_WRITE_MAX_ATTEMPTS - 1) return error(409, "多人正在同时投票，请稍等片刻后重试");
    }
  }
  return error(409, "多人正在同时投票，请稍等片刻后重试");
}

async function ensureDealHistoryTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS deal_histories (profile_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)"
  ).run();
}

async function ensureGameResultsTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS game_results (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, room_id TEXT NOT NULL, result TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)"
  ).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_game_results_room_id ON game_results(room_id)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_game_results_created_at ON game_results(created_at)").run();
}

async function loadDealHistory(env, profileId) {
  await ensureDealHistoryTable(env);
  const row = await env.DB.prepare("SELECT data, updated_at FROM deal_histories WHERE profile_id = ?").bind(profileId).first();
  if (!row) return { history: [], updatedAt: 0 };
  try {
    const history = JSON.parse(row.data);
    return { history: Array.isArray(history) ? history.slice(-10) : [], updatedAt: Number(row.updated_at || 0) };
  } catch (error) {
    return { history: [], updatedAt: Number(row.updated_at || 0) };
  }
}

async function createRoomId(env) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = randomDigits(6);
    const existing = await loadRoom(env, id);
    if (!existing) return id;
  }
  throw new Error("无法生成房间号");
}

function isJudge(room, token) {
  return room.mode === "JUDGE" && Boolean(token && token === room.judgeToken);
}

function addPublicAnnouncement(room, text) {
  if (!text) return null;
  room.publicAnnouncements = room.publicAnnouncements || [];
  const announcement = { id: `${Date.now()}-${room.publicAnnouncements.length}`, text, createdAt: Date.now() };
  room.publicAnnouncements.push(announcement);
  room.publicAnnouncements = room.publicAnnouncements.slice(-20);
  return announcement;
}

function addDeathRecord(room, details) {
  room.deathRecords = room.deathRecords || [];
  const record = createDeathRecord(room, details);
  room.deathRecords.push(record);
  return record;
}

function isController(room, token) {
  return Boolean(token && token === room.judgeToken);
}

function judgeClaimLocked(room) {
  return Number(room.judgeClaimLockedUntil || 0) > Date.now();
}

function recordJudgeClaimFailure(room) {
  const failures = Number(room.judgeClaimFailures || 0) + 1;
  room.judgeClaimFailures = failures;
  if (failures >= JUDGE_CLAIM_MAX_FAILURES) {
    room.judgeClaimFailures = 0;
    room.judgeClaimLockedUntil = Date.now() + JUDGE_CLAIM_LOCK_MS;
  }
  writeLog(room, "JUDGE_CLAIM_REJECTED", { locked: judgeClaimLocked(room) });
}

function resetJudgeClaimFailures(room) {
  room.judgeClaimFailures = 0;
  room.judgeClaimLockedUntil = 0;
}

function normalizeSeatOccupancy(room) {
  (room.seats || []).forEach((seat) => {
    if (typeof seat.clientId === "string" && seat.clientId) {
      seat.occupied = true;
      return;
    }
    seat.clientId = "";
    seat.userId = "";
    seat.nickname = "";
    seat.occupied = false;
  });
}

function isSystemAnnouncementReady(room) {
  return room.mode !== "SYSTEM" || !room.systemAnnouncementNotBefore || Date.now() >= room.systemAnnouncementNotBefore;
}

function scheduleSystemAnnouncement(room) {
  if (fixedNight.submitted(room)) return;
  if (room.mode !== "SYSTEM") return;
  const hasNextStep = (room.currentNightStepIndex || 0) < (room.currentNightSteps || []).length;
  const announcementNotBefore = hasNextStep ? Date.now() + SYSTEM_STEP_ANNOUNCEMENT_DELAY_MS : 0;
  room.systemAnnouncementNotBefore = announcementNotBefore;
  const timeoutSeconds = normalizeSystemStepTimeout(room.systemStepTimeoutSeconds);
  room.systemStepDeadlineAt = hasNextStep && timeoutSeconds
    ? announcementNotBefore + timeoutSeconds * 1000
    : 0;
}

function startSystemStep(room) {
  if (fixedNight.enabled(room)) { fixedNight.start(room); return; }
  if (room.mode !== "SYSTEM") return;
  const hasNextStep = (room.currentNightStepIndex || 0) < (room.currentNightSteps || []).length;
  room.systemAnnouncementNotBefore = 0;
  const timeoutSeconds = normalizeSystemStepTimeout(room.systemStepTimeoutSeconds);
  room.systemStepDeadlineAt = hasNextStep && timeoutSeconds ? Date.now() + timeoutSeconds * 1000 : 0;
}

function canAssignmentAct(room, step, assignment) {
  if (step?.inactive) return false;
  if (!step || !assignment) return false;
  if (step.id === "treasure_mask_final_kill") {
    return assignment.roleId === "treasure_master" && Number(assignment.seat) === Number(room.treasureMaskedFinalNight?.seat);
  }
  if (assignment.alive === false) return false;
  if (isDarkDestruction(room) && step.id !== "lilith_bind" && step.id !== "lia_raise" && step.id !== "dreamer_dream" && step.actor !== "wolf_team" && isDarkRoleBound(room, assignment.roleId)) return false;
  if (step.actor === "wolf_team") return wolfKnifePolicy.mayUseNormalWolfKnife(room.boardId, assignment, room.assignments);
  return step.actor === assignment.roleId;
}

function getSystemNightAccess(room, clientId, controller) {
  if (room.mode !== "SYSTEM" || room.phase !== "NIGHT") return null;
  const stepIndex = room.currentNightStepIndex || 0;
  const step = room.currentNightSteps?.[stepIndex] || null;
  const seat = room.seats.find((item) => item.clientId === clientId);
  const assignment = seat ? room.assignments.find((item) => item.seat === seat.seat) : null;
  const announcementReady = isSystemAnnouncementReady(room);
  const canAct = announcementReady && canAssignmentAct(room, step, assignment) && (!fixedNight.enabled(room) || fixedNight.actionable(room));
  const privateContext = {};
  if (canAct && step?.id === "mechanical_knife_confirm") privateContext.mechanicalKnifeState = wolfKnifePolicy.privateKnifeState(room.boardId, assignment, room.assignments);
  if (canAct && step?.id === "witch_action" && step.antidoteAvailable) {
    const wolfAction = [...(room.nightActions || [])].reverse().find((action) => action.night === room.night && action.stepId === "wolves_kill" && !action.skipped);
    privateContext.wolfVictimSeat = Number(wolfAction?.targetSeats?.[0] || 0);
  }
  if (canAct && step?.id === "treasure_skill") {
    privateContext.treasureCardRoleId = currentTreasureCard(room);
    privateContext.treasureWolfEligible = !(room.assignments || []).some((item) => item.alive !== false && ["wolf", "wolf_king"].includes(item.roleId));
    privateContext.treasurePoisonUsed = (room.nightActions || []).some((action) => action.stepId === "treasure_skill" && action.cardRoleId === "poisoner" && !action.skipped);
  }
  return {
    canControl: controller,
    timing: controller ? fixedNight.view(room) : null,
    canAct,
    announcementReady,
    stepIndex,
    stepCount: room.currentNightSteps?.length || 0,
    complete: !step,
    stepId: controller && fixedNight.enabled(room) && ["mechanical_guard", "mechanical_poison", "mechanical_check", "mechanical_kill"].includes(step?.id) ? "mechanical_skill_wait" : controller || canAct ? step?.id || "" : "",
    announcement: controller && fixedNight.enabled(room) && step?.id?.startsWith("mechanical_") ? "机械狼夜间流程" : controller && !announcementReady ? "正在等待下一流程播报" : controller || canAct ? step?.label || "夜间行动已完成" : "夜间流程进行中",
    privateContext,
    timeout: controller && step ? {
      seconds: normalizeSystemStepTimeout(room.systemStepTimeoutSeconds),
      deadlineAt: Number(room.systemStepDeadlineAt || 0),
      expired: Boolean(room.systemStepDeadlineAt && Date.now() >= Number(room.systemStepDeadlineAt))
    } : null
  };
}

function buildPrivateNightResult(room, step, action) {
  const selectedSeat = Number(action?.targetSeats?.[0] || 0);
  if (step.id === "lia_charge") {
    const target = (room.assignments || []).find((assignment) => assignment.seat === selectedSeat);
    return { kind: "CHARGE", seat: selectedSeat, success: target?.roleId === "villager" };
  }
  if (step.id === "cain_check") {
    const seats = (action?.targetSeats || []).map(Number);
    const categories = seats.map((seat) => {
      const assignment = (room.assignments || []).find((item) => item.seat === seat);
      if (!assignment) return "UNKNOWN";
      if (assignment.roleId === "lia") return "LIA";
      if ((assignment.currentCamp || assignment.camp) === "WOLF") return "WOLF";
      return assignment.roleId === "villager" ? "CIVILIAN" : "GOD";
    });
    const result = categories.includes("LIA") || categories[0] === categories[1]
      ? "SAME"
      : categories.includes("WOLF")
        ? "WOLF_CLAW"
        : "DOWN";
    return { kind: "CAIN", seats, result };
  }
  if (!selectedSeat) return null;
  let actualSeat = step.id === "seer_check"
    ? resolveNightTarget(room, { night: room.night, scope: "seer_check", seat: selectedSeat }).effectiveSeat
    : selectedSeat;
  if (step.id === "seer_check" && room.boardId === "dawn_voyage" && room.windDirection !== "calm" && selectedSeat !== Number(room.boardedSeat || 0)) {
    actualSeat = room.windDirection === "tailwind" ? (selectedSeat % 12) + 1 : ((selectedSeat + 10) % 12) + 1;
  }
  const assignment = (room.assignments || []).find((item) => item.seat === actualSeat);
  if (!assignment) return null;
  if (step.id === "seer_check") {
    const puppetSeer = room.boardId === "follow_neighbor" && Number(room.puppetSeat) === Number((room.assignments || []).find((item) => item.roleId === "seer")?.seat);
    const puppetTarget = room.boardId === "follow_neighbor" && Number(room.puppetSeat) === actualSeat;
    const baseValue = assignment.camp === "WOLF" || puppetTarget ? "WOLF" : "GOOD";
    return { kind: "CAMP", seat: actualSeat, value: puppetSeer ? (baseValue === "WOLF" ? "GOOD" : "WOLF") : baseValue };
  }
  if (step.id === "mask_check") {
    const dance = (room.nightActions || []).find((item) => item.night === room.night && item.stepId === "dancer_dance" && !item.skipped);
    return { kind: "DANCE", seat: actualSeat, value: Boolean(dance?.targetSeats?.includes(actualSeat)) };
  }
  if (["spirit_medium_check", "mechanical_check", "mechanical_mimic"].includes(step.id)
    || (step.id === "treasure_skill" && action.cardRoleId === "spirit_medium")) {
    let roleId = assignment.roleId;
    if (step.id === "spirit_medium_check" && roleId === "mechanical_wolf") {
      const mimic = (room.nightActions || []).find((item) => item.night === room.night && item.stepId === "mechanical_mimic" && !item.skipped);
      roleId = roleAtTarget(room, mimic) || roleId;
    }
    return { kind: "ROLE", seat: actualSeat, roleId };
  }
  return null;
}

function dayVoteRecordForViewer(room, record, judge, assignment) {
  if (!record) return null;
  const fogIsActive = isDarkDestruction(room)
    && Number(room.liaFogDay || 0) === Number(record.day)
    && Number(room.darkFogAnnouncedDay || 0) === Number(record.day);
  if (!fogIsActive || judge || (room.mode === "SYSTEM" && assignment?.roleId === "lia")) return record;
  const visibleCounts = Object.fromEntries((record.topSeats || []).map((seat) => [String(seat), Number(record.counts?.[seat] || 0)]));
  const { votes, ...publicRecord } = record;
  return { ...publicRecord, counts: visibleCounts };
}

function activeDarkBallotForViewer(room, judge, assignment) {
  const ballot = room.activeDarkBallot;
  if (!ballot) return null;
  const fogIsActive = Number(room.liaFogDay || 0) === Number(ballot.day)
    && Number(room.darkFogAnnouncedDay || 0) === Number(ballot.day);
  if (judge || (fogIsActive && assignment?.roleId === "lia")) return ballot;
  return {
    id: ballot.id || "",
    day: ballot.day,
    round: ballot.round,
    status: ballot.status,
    voterSeats: ballot.voterSeats,
    allowedTargets: ballot.allowedTargets,
    submittedCount: Object.keys(ballot.votes || {}).length,
    totalVoters: ballot.voterSeats.length
  };
}

function sanitizeRoom(room, { clientId, judgeToken }) {
  const judge = isJudge(room, judgeToken);
  const controller = isController(room, judgeToken);
  const revealAll = room.phase === "GAME_OVER";
  const mySeat = room.seats.find((seat) => seat.clientId === clientId);
  const myAssignment = mySeat ? room.assignments.find((assignment) => assignment.seat === mySeat.seat) : null;
  const myOrderPrince = Boolean(myAssignment && myAssignment.roleId === "order_prince" && myAssignment.alive !== false);
  const seats = room.seats.map((seat) => ({
    seat: seat.seat,
    nickname: seat.nickname,
    occupied: Boolean(seat.occupied && seat.clientId)
  }));
  const systemNight = getSystemNightAccess(room, clientId, controller);
  const activeStep = room.currentNightSteps?.[room.currentNightStepIndex || 0] || null;
  const systemSteps = systemNight && systemNight.canAct && activeStep ? [{ ...activeStep, index: 0 }] : [];
  const myDelayedDeath = myAssignment ? (room.pendingDelayedDeaths || []).find((item) => item.day === room.night && item.seat === myAssignment.seat) || null : null;
  const firstPendingDeathSkill = (room.pendingDeathSkills || []).find((item) => item.day === room.night) || null;
  const pendingMyDeathSkill = myAssignment && Number(firstPendingDeathSkill?.seat) === Number(myAssignment.seat) ? firstPendingDeathSkill : null;
  const myDeathSkill = pendingMyDeathSkill && pendingMyDeathSkill.eligible !== false ? { day: pendingMyDeathSkill.day, seat: pendingMyDeathSkill.seat, deadlineAt: Number(pendingMyDeathSkill.deadlineAt || 0) } : null;
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
    fixedNightFlow: room.fixedNightFlow || 0,
    serverNow: Date.now(),
    boardId: room.boardId,
    phase: room.phase,
    day: room.day,
    night: room.night,
    revision: Number(room.revision || 0),
    seats,
    aliveSeats: (room.assignments || []).filter((assignment) => assignment.alive !== false).map((assignment) => assignment.seat),
    logs: judge || revealAll ? room.logs : [],
    isJudge: judge,
    isController: controller,
    systemStepTimeoutSeconds: controller && room.mode === "SYSTEM" ? normalizeSystemStepTimeout(room.systemStepTimeoutSeconds) : 0,
    controllerTransferCode: controller && room.mode === "SYSTEM" ? room.controllerTransferCode || "" : "",
    controllerTransferExpiresAt: controller && room.mode === "SYSTEM" ? Number(room.controllerTransferExpiresAt || 0) : 0,
    systemNight,
    systemDaybreakReady: room.mode === "SYSTEM" && controller && Boolean(room.pendingNightResolution),
    systemDayOutcomeRecorded: room.mode === "SYSTEM" && room.systemDayOutcomeRecordedDay === room.night,
    systemSkillDeadlineAt: systemSkillDeadlineAt(room),
    daySkillVoice: controller ? dayVoice.view(room) : null,
    systemPendingTasks: room.mode === "SYSTEM" && controller ? {
      delayedDeaths: (room.pendingDelayedDeaths || []).filter((item) => item.day === room.night).length,
      deathSkills: (room.pendingDeathSkills || []).filter((item) => item.day === room.night).length,
      archangelRevival: Boolean(room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length),
      darkBallot: room.activeDarkBallot?.status === "OPEN"
    } : null,
    myDelayedDeath: room.mode === "SYSTEM" ? myDelayedDeath : null,
    myDeathSkill: room.mode === "SYSTEM" ? myDeathSkill : null,
    myTreasureMaskedFinalNight: room.mode === "SYSTEM" && myAssignment && Number(room.treasureMaskedFinalNight?.seat) === Number(myAssignment.seat)
      && ["PENDING", "ACTIVE"].includes(room.treasureMaskedFinalNight?.status)
      ? { status: room.treasureMaskedFinalNight.status } : null,
    latestPublicAnnouncement: (room.publicAnnouncements || []).at(-1) || null,
    gameOutcome: room.phase === "GAME_OVER" ? room.gameOutcome || null : null,
    mySeat: mySeat ? { seat: mySeat.seat, nickname: mySeat.nickname, occupied: true } : null,
    assignments: judge || revealAll ? room.assignments : myAssignment ? [myAssignment] : [],
    nightActions: judge || revealAll ? room.nightActions : [],
    currentNightSteps: judge ? room.currentNightSteps : systemSteps,
    currentNightStepIndex: judge ? room.currentNightStepIndex : 0,
    sheriffCandidates: room.sheriffCandidates || [],
    sheriffWithdrawn: room.sheriffWithdrawn || [],
    sheriffElectionDone: Boolean(room.sheriffElectionDone),
    sheriffElectionDeferredDay: Number(room.sheriffElectionDeferredDay || 0),
    sheriffStageClosedDay: Number(room.sheriffStageClosedDay || 0),
    pendingSheriffSelfDestructSeat: Number(room.pendingSheriffSelfDestructSeat || 0),
    sheriffVoteRecord: room.sheriffVoteRecord || null,
    sheriffBadge: room.sheriffBadge || { holderSeat: 0, lost: false },
    dayVoteRecord: dayVoteRecordForViewer(room, room.dayVoteRecord, judge, myAssignment),
    activeDarkBallot: activeDarkBallotForViewer(room, judge, myAssignment),
    myDarkBallot: mySeat && room.activeDarkBallot?.votes && Object.prototype.hasOwnProperty.call(room.activeDarkBallot.votes, String(mySeat.seat))
      ? { day: room.activeDarkBallot.day, round: room.activeDarkBallot.round, targetSeat: Number(room.activeDarkBallot.votes[String(mySeat.seat)]) }
      : null,
    canCorrectDayRecord: judge && canCorrectDayRecord(room),
    dealBalanceMeta: judge ? room.dealBalanceMeta || null : null,
    pendingExileResult: judge || (room.mode === "SYSTEM" && (controller || myOrderPrince)) ? room.pendingExileResult || null : null,
    orderPrinceUsed: Boolean(room.orderPrinceUsed),
    orderPrinceRevotePending: judge || controller ? Boolean(room.orderPrinceRevotePending) : false,
    judgeCode: judge ? room.judgeCode : "",
    deathRecords: judge || revealAll ? room.deathRecords || [] : (room.deathRecords || []).map(publicDeathRecord),
    privateEvents: privateEventsForViewer(room, { judge, seat: mySeat?.seat || 0 }),
    activeDaySkillWindow: room.mode === "JUDGE" && !judge ? null : daySkillWindowForViewer(room, { judge, controller, seat: mySeat?.seat || 0 }),
    daySkillWindowRecords: judge ? room.daySkillWindowRecords || [] : [],
    pendingNightResolution: judge ? room.pendingNightResolution || null : null,
    pendingDelayedDeaths: judge ? room.pendingDelayedDeaths || [] : [],
    pendingDeathSkills: judge ? room.pendingDeathSkills || [] : [],
    pendingDarkDeathQueue: judge ? room.pendingDarkDeathQueue || [] : [],
    pendingArchangelRevival: judge && room.pendingArchangelRevival ? { seat: room.pendingArchangelRevival.seat, phase: room.pendingArchangelRevival.phase, canRevive: !room.pendingArchangelRevival.virtual, deadlineAt: Number(room.pendingArchangelRevival.deadlineAt || 0) } : null,
    myPendingArchangelRevival: room.mode === "SYSTEM" && myAssignment?.roleId === "archangel" && myAssignment.alive !== false && room.pendingArchangelRevival && !room.pendingArchangelRevival.virtual
      ? { seat: room.pendingArchangelRevival.seat, phase: room.pendingArchangelRevival.phase, deadlineAt: Number(room.pendingArchangelRevival.deadlineAt || 0) }
      : null,
    archangelReviveUsed: Boolean(room.archangelReviveUsed),
    revivalRecords: judge || revealAll ? room.revivalRecords || [] : [],
    deathSkillRecords: judge ? room.deathSkillRecords || [] : [],
    puppetSeat: judge ? Number(room.puppetSeat || 0) : 0,
    publicReveals: (room.assignments || []).filter((assignment) => assignment.roleId === "idiot" && (
      assignment.publiclyRevealed || (assignment.revealed && (room.exileRecords || []).some((record) => Number(record.seat) === Number(assignment.seat)))
    )).map((assignment) => ({ seat: assignment.seat, roleId: assignment.roleId })),
    exileRecords: room.exileRecords || [],
    windDirection: judge ? room.windDirection || "calm" : "",
    lastWindDirection: judge ? room.lastWindDirection || "calm" : "",
    announcedWindDirection: room.phase === "DAY" && room.captainAliveAtDawn ? room.windDirection || "calm" : "",
    boardedSeat: judge ? room.boardedSeat || 0 : 0,
    captainDiedLastDay: judge ? Boolean(room.captainDiedLastDay) : false,
    captainAliveAtDawn: judge ? Boolean(room.captainAliveAtDawn) : false,
    darkFogAnnouncementPending: Boolean((judge || controller)
      && isDarkDestruction(room)
      && Number(room.darkFogAnnouncedDay || 0) !== Number(room.night)),
    darkFogDay: isDarkDestruction(room) && Number(room.darkFogAnnouncedDay || 0) === Number(room.night) ? Number(room.liaFogDay || 0) : 0
  };
}

function normalizeDeathReasons(input, seats) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const normalized = {};
  seats.forEach((seat) => {
    const values = Array.isArray(source[String(seat)]) ? source[String(seat)] : [];
    normalized[String(seat)] = [...new Set(values
      .filter((value) => typeof value === "string")
      .map((value) => value.trim().slice(0, 40))
      .filter(Boolean))].slice(0, 5);
  });
  return normalized;
}

function queueDeathSkills(room, seats, phase, reasonsBySeat = {}) {
  room.pendingDeathSkills = room.pendingDeathSkills || [];
  room.deathSkillRecords = room.deathSkillRecords || [];
  seats.forEach((seat) => {
    const resolution = getDeathSkillResolution(room, {
      seat,
      phase,
      reasons: reasonsBySeat[String(seat)] || [],
      day: room.night
    });
    if (!resolution && !dayVoice.enabled(room)) return;
    const record = {
      ...(resolution || { seat, day: room.night, eligible: false, roleId: "NONE" }),
      phase,
      resolved: dayVoice.enabled(room) ? false : !resolution.eligible,
      deadlineAt: 0,
      createdAt: Date.now()
    };
    room.deathSkillRecords.push(record);
    if ((resolution?.eligible || dayVoice.enabled(room)) && !room.pendingDeathSkills.some((item) => item.seat === seat && item.day === room.night)) {
      room.pendingDeathSkills.push(record);
    }
    writeLog(room, resolution?.eligible ? "DEATH_SKILL_PENDING" : "DEATH_SKILL_BLOCKED", record);
    const deathRecord = [...(room.deathRecords || [])].reverse().find((item) => item.day === room.night && item.phase === phase && item.seats?.includes(seat));
    if (deathRecord) deathRecord.deathSkill = { queued: Boolean(resolution?.eligible), resolved: !resolution?.eligible, recordSeat: seat };
  });
  startNextSystemDeathSkillWindow(room);
}

function startNextSystemDeathSkillWindow(room) {
  if (room.mode !== "SYSTEM" || room.pendingArchangelRevival || room.activeDaySkillWindow?.status === "OPEN") return;
  const next = (room.pendingDeathSkills || []).find((item) => item.day === room.night);
  if (next && !Number(next.deadlineAt || 0)) next.deadlineAt = Date.now() + 5000;
}

function systemSkillDeadlineAt(room) {
  if (dayVoice.enabled(room)) return dayVoice.deadline(room);
  if (room.mode !== "SYSTEM") return 0;
  if (room.activeDaySkillWindow?.status === "OPEN") return Number(room.activeDaySkillWindow.deadlineAt || 0);
  if (room.pendingArchangelRevival) return Number(room.pendingArchangelRevival.deadlineAt || 0);
  const next = (room.pendingDeathSkills || []).find((item) => item.day === room.night);
  return Number(next?.deadlineAt || 0);
}

function expireSystemSkillWindow(room) {
  if (room.mode !== "SYSTEM" || room.phase !== "DAY") return false;
  const deadlineAt = systemSkillDeadlineAt(room);
  if (!deadlineAt || Date.now() < deadlineAt) return false;
  if (room.activeDaySkillWindow?.status === "OPEN" && room.pendingExileResult) {
    const record = room.pendingExileResult.record || room.pendingExileResult;
    room.pendingExileResult = null;
    room.dayVoteRecord = record;
    resolveDaySkillWindow(room, { actorSeat: 0, outcome: "DECLINED", detail: { effect: "CONTINUE_EXILE", timedOut: true } });
    if (record.exiledSeat || record.noExile) finalizeDayVote(room, record);
    writeLog(room, "ORDER_PRINCE_DECLINED", { day: room.night, timedOut: true });
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
    return true;
  }
  if (room.pendingArchangelRevival) {
    const pending = room.pendingArchangelRevival;
    resolveArchangelRevival(room, false);
    writeLog(room, "ARCHANGEL_REVIVAL_TIMED_OUT", { seat: pending.seat, day: pending.day });
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
    return true;
  }
  const pending = (room.pendingDeathSkills || []).find((item) => item.day === room.night && Number(item.deadlineAt || 0) > 0);
  if (!pending || Number(pending.deadlineAt) > Date.now()) return false;
  room.pendingDeathSkills = room.pendingDeathSkills.filter((item) => !(item.day === room.night && item.seat === pending.seat));
  const record = [...(room.deathSkillRecords || [])].reverse().find((item) => item.day === room.night && item.seat === pending.seat && !item.resolved);
  if (record) Object.assign(record, { resolved: true, targetSeat: 0, skipped: true, timedOut: true, resolvedAt: Date.now() });
  writeLog(room, "DEATH_SKILL_RESOLVED", { seat: pending.seat, targetSeat: 0, skipped: true, timedOut: true });
  advanceDarkDeathResolution(room);
  startNextSystemDeathSkillWindow(room);
  if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
  return true;
}

function advanceDarkDeathResolution(room) {
  if (!isDarkDestruction(room) || room.pendingArchangelRevival) return;
  if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return;
  room.pendingDarkDeathQueue = room.pendingDarkDeathQueue || [];
  while (room.pendingDarkDeathQueue.length) {
    const pending = room.pendingDarkDeathQueue.shift();
    const assignment = (room.assignments || []).find((item) => item.seat === pending.seat);
    if (!assignment || assignment.alive !== false) continue;
    if (!room.archangelReviveUsed && (room.assignments || []).some(item => item.roleId === "archangel")) {
      room.pendingArchangelRevival = { ...pending, virtual: !canOfferArchangelRevive(room, pending.seat), deadlineAt: room.mode === "SYSTEM" ? Date.now() + 5000 : 0, createdAt: Date.now() };
      writeLog(room, "ARCHANGEL_REVIVAL_WINDOW_OPENED", { seat: pending.seat, day: pending.day, phase: pending.phase });
      addPublicAnnouncement(room, "等待天使长发动技能。");
      return;
    }
    queueDeathSkills(room, [pending.seat], pending.phase, { [String(pending.seat)]: pending.reasons || [] });
    if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return;
  }
}

function queueDarkDeathResolution(room, seats, phase, reasonsBySeat = {}) {
  if (!isDarkDestruction(room)) return queueDeathSkills(room, seats, phase, reasonsBySeat);
  room.pendingDarkDeathQueue = room.pendingDarkDeathQueue || [];
  seats.forEach((seat) => {
    if (!room.pendingDarkDeathQueue.some((item) => item.seat === seat && item.day === room.night)) {
      room.pendingDarkDeathQueue.push({ seat, day: room.night, phase, reasons: reasonsBySeat[String(seat)] || [] });
    }
  });
  advanceDarkDeathResolution(room);
}

function resolveArchangelRevival(room, useRevive) {
  const pending = room.pendingArchangelRevival;
  if (!pending) throw new Error("当前没有待处理的天使长复活窗口");
  const assignment = (room.assignments || []).find((item) => item.seat === pending.seat);
  if (useRevive && (!canOfferArchangelRevive(room, pending.seat) || !assignment || assignment.alive !== false)) throw new Error("该玩家当前不能被复活");
  room.pendingArchangelRevival = null;
  if (useRevive) {
    if (!canOfferArchangelRevive(room, pending.seat) || !assignment || assignment.alive !== false) throw new Error("该玩家当前不能被复活");
    assignment.alive = true;
    room.archangelReviveUsed = true;
    room.revivalRecords = room.revivalRecords || [];
    const record = { seat: pending.seat, day: pending.day, phase: pending.phase, createdAt: Date.now() };
    room.revivalRecords.push(record);
    const deathRecord = [...(room.deathRecords || [])].reverse().find((item) => item.day === pending.day && item.phase === pending.phase && item.seats?.includes(pending.seat));
    if (deathRecord) deathRecord.revivedSeats = [...new Set([...(deathRecord.revivedSeats || []), pending.seat])];
    writeLog(room, "ARCHANGEL_REVIVED", record);
    addPublicAnnouncement(room, `${pending.seat}号玩家被天使长复活。`);
  } else {
    queueDeathSkills(room, [pending.seat], pending.phase, { [String(pending.seat)]: pending.reasons || [] });
    writeLog(room, "ARCHANGEL_REVIVAL_DECLINED", { seat: pending.seat, day: pending.day, phase: pending.phase });
  }
  advanceDarkDeathResolution(room);
}

function maybeCompleteSystemGame(room) {
  if (room.mode !== "SYSTEM" || room.phase === "GAME_OVER" || room.pendingNightResolution) return null;
  if (["PENDING", "ACTIVE"].includes(room.treasureMaskedFinalNight?.status)) return null;
  if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) return null;
  if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return null;
  if (room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) return null;
  const result = getGameOutcome(room);
  if (!result) return null;
  room.phase = "GAME_OVER";
  room.gameOutcome = { result, day: room.night, automatic: true, createdAt: Date.now() };
  writeLog(room, "GAME_AUTO_COMPLETED", room.gameOutcome);
  const text = result === "GOOD_WIN" ? "游戏结束，好人阵营获胜。" : "游戏结束，狼人阵营获胜。";
  addPublicAnnouncement(room, text);
  return room.gameOutcome;
}

function beginNight(room) {
  room.night += 1;
  if (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1) {
    room.sheriffCandidates = [];
    room.sheriffWithdrawn = [];
    room.sheriffVoteRecord = null;
    room.sheriffElectionDone = false;
  }
  room.phase = "NIGHT";
  room.lastWindDirection = room.windDirection || "calm";
  room.boardedSeat = 0;
  room.captainAliveAtDawn = (room.assignments || []).some((item) => item.roleId === "captain" && item.alive !== false);
  room.captainDiedLastDay = false;
  room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
  if (room.treasureMaskedFinalNight?.status === "PENDING") room.treasureMaskedFinalNight.status = "ACTIVE";
  room.currentNightStepIndex = 0;
  startSystemStep(room);
  room.pendingNightResolution = null;
  writeLog(room, "NIGHT_STARTED", { night: room.night });
}

function continueAfterSystemSelfDestruct(room) {
  if (!room.pendingSystemNightAfterSelfDestruct && !room.pendingJudgeNightAfterSelfDestruct) return false;
  if (room.pendingNightResolution || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) return false;
  if (room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) return false;
  if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return false;
  if (room.mode === "SYSTEM" && maybeCompleteSystemGame(room)) {
    room.pendingSystemNightAfterSelfDestruct = false;
    return true;
  }
  room.pendingSystemNightAfterSelfDestruct = false;
  room.pendingJudgeNightAfterSelfDestruct = false;
  room.pendingSheriffSelfDestructSeat = 0;
  beginNight(room);
  return true;
}

function parseRoute(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "rooms") return null;
  return {
    roomId: parts[2] || "",
    action: parts[3] || ""
  };
}

function uniqueSeats(value, allowed) {
  const seats = Array.isArray(value) ? value.map(Number).filter((seat) => seat >= 1 && seat <= 12) : [];
  const filtered = allowed ? seats.filter((seat) => allowed.includes(seat)) : seats;
  return [...new Set(filtered)].sort((a, b) => a - b);
}

function isSheriffElectionFinished(room) {
  if (!room) return true;
  if (Number(room.sheriffStageClosedDay || 0) === Number(room.night)) return true;
  if (room.night === 1 && Number(room.sheriffElectionDeferredDay) === 1) return true;
  if (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1) {
    return Boolean(room.sheriffElectionDone || room.sheriffBadge?.holderSeat || room.sheriffBadge?.lost);
  }
  if (room.night !== 1) return true;
  if (room.sheriffBadge?.holderSeat || room.sheriffBadge?.lost) return true;
  if (room.sheriffElectionDone) return true;
  const record = room.sheriffVoteRecord;
  return Boolean(record && (record.electedSeat || record.badgeLost));
}

function hasCurrentDaybreakRecord(room) {
  return (room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK");
}

function hasCurrentExileRecord(room) {
  return (room.exileRecords || []).some((record) => record.day === room.night);
}

function cloneDayRecordState(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureDayRecordUndo(room, stage) {
  if (room.mode !== "JUDGE") return;
  room.dayRecordUndo = {
    day: room.night,
    stage,
    snapshot: cloneDayRecordState({
      assignments: room.assignments,
      deathRecords: room.deathRecords,
      exileRecords: room.exileRecords,
      dayVoteRecord: room.dayVoteRecord,
      pendingExileResult: room.pendingExileResult,
      orderPrinceUsed: room.orderPrinceUsed,
      orderPrinceRevotePending: room.orderPrinceRevotePending,
      pendingNightResolution: room.pendingNightResolution,
      pendingDelayedDeaths: room.pendingDelayedDeaths,
      pendingDeathSkills: room.pendingDeathSkills,
      pendingDarkDeathQueue: room.pendingDarkDeathQueue,
      pendingArchangelRevival: room.pendingArchangelRevival,
      activeDarkBallot: room.activeDarkBallot,
      archangelReviveUsed: room.archangelReviveUsed,
      revivalRecords: room.revivalRecords,
      darkFogAnnouncedDay: room.darkFogAnnouncedDay,
      deathSkillRecords: room.deathSkillRecords,
      treasureMaskedFinalNight: room.treasureMaskedFinalNight
    }),
    createdAt: Date.now()
  };
}

function canCorrectDayRecord(room) {
  const undo = room.dayRecordUndo;
  if (room.mode !== "JUDGE" || room.phase !== "DAY" || !undo || undo.day !== room.night) return false;
  const currentPending = (items) => (items || []).some((item) => item.day === room.night);
  if (currentPending(room.pendingDelayedDeaths) || currentPending(room.pendingDeathSkills)
    || room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length
    || room.activeDarkBallot?.status === "OPEN") return false;
  if ((room.deathSkillRecords || []).some((item) => item.day === room.night)) return false;
  if (undo.stage === "DAYBREAK") {
    return !hasCurrentExileRecord(room) && !room.dayVoteRecord && !room.pendingExileResult && !room.orderPrinceRevotePending;
  }
  return undo.stage === "EXILE" && hasCurrentExileRecord(room);
}

function restoreDayRecordUndo(room) {
  const { snapshot } = room.dayRecordUndo;
  Object.assign(room, cloneDayRecordState(snapshot));
  room.dayRecordUndo = null;
}

function getAliveSeats(room) {
  const aliveAssignments = (room.assignments || []).filter((assignment) => assignment.alive !== false);
  if (aliveAssignments.length) return aliveAssignments.map((assignment) => assignment.seat).sort((a, b) => a - b);
  return room.seats.map((seat) => seat.seat);
}

function calculateDayVote(room, body) {
  const round = Number(body.round || 1);
  const aliveSeats = getAliveSeats(room);
  const previous = room.dayVoteRecord;
  const pkSeats = round === 2 && previous && previous.day === room.night && previous.round === 1 && previous.pkSeats?.length > 1
    ? uniqueSeats(previous.pkSeats, aliveSeats)
    : [];
  const isDark = isDarkDestruction(room);
  const boundSeat = isDark ? darkBindingTarget(room, room.night) : 0;
  const allowedTargets = round === 1
    ? aliveSeats.filter((seat) => !isDark || seat !== boundSeat)
    : pkSeats.filter((seat) => !isDark || seat !== boundSeat);
  const allowedVoters = round === 2 ? aliveSeats.filter((seat) => !pkSeats.includes(seat)) : aliveSeats;
  const blessedSeat = isDark && hasUsedArchangelBless(room)
    ? Number((room.nightActions || []).find((action) => action.night === room.night && action.stepId === "archangel_bless" && !action.skipped)?.targetSeats?.[0] || 0)
    : 0;
  const blessedAssignment = (room.assignments || []).find((assignment) => assignment.seat === blessedSeat);
  const blessedVoterSeat = blessedAssignment?.roleId !== "lilith" ? blessedSeat : 0;
  const seenVoters = new Set();
  const votes = (Array.isArray(body.votes) ? body.votes : []).flatMap((vote) => {
    const voterSeat = Number(vote.voterSeat);
    const targetSeat = Number(vote.targetSeat);
    const boundVote = isDark && targetSeat === boundSeat;
    const abstention = targetSeat === 0;
    if (!allowedVoters.includes(voterSeat) || !(allowedTargets.includes(targetSeat) || boundVote || abstention) || seenVoters.has(voterSeat)) return [];
    seenVoters.add(voterSeat);
    if (!isDark) return [{ voterSeat, targetSeat, weight: 1, counted: targetSeat !== 0 }];
    return [{ voterSeat, targetSeat, weight: voterSeat === blessedVoterSeat ? 3 : 1, counted: targetSeat !== 0 && targetSeat !== boundSeat }];
  });
  const counts = {};
  allowedTargets.forEach((seat) => { counts[seat] = 0; });
  votes.forEach((vote) => {
    const targetSeat = Number(vote.targetSeat);
    if (isDark) {
      if (vote.counted && allowedTargets.includes(targetSeat)) counts[targetSeat] += vote.weight;
    } else if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
  });
  const maxVotes = Math.max(0, ...Object.values(counts));
  const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
  const exiledSeat = topSeats.length === 1 ? topSeats[0] : 0;
  const noExile = !exiledSeat && (round === 2 || topSeats.length === 0);
  return {
    day: room.night,
    round,
    votes,
    counts,
    topSeats,
    pkSeats: round === 1 && topSeats.length > 1 ? topSeats : [],
    exiledSeat,
    noExile,
    createdAt: Date.now()
  };
}

function openDarkBallot(room, round) {
  if (room.mode !== "SYSTEM") throw new Error("手机投票仅用于无法官模式");
  if (room.phase !== "DAY" || !hasCurrentDaybreakRecord(room)) throw new Error("请先完成天亮死讯");
  if (hasCurrentExileRecord(room) || room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length
    || (room.pendingDeathSkills || []).some((item) => item.day === room.night)
    || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) throw new Error("请先完成当日死亡结算");
  if (room.activeDarkBallot?.status === "OPEN") throw new Error("投票已经开始");
  if (room.activeDaySkillWindow?.status === "OPEN" || room.pendingExileResult) throw new Error("请先完成当前白天技能窗口");
  const requestedRound = Number(round || 1);
  if (requestedRound === 1 && room.dayVoteRecord?.day === room.night && !room.orderPrinceRevotePending) throw new Error("本日第一轮投票已经完成");
  if (requestedRound === 2 && !(room.dayVoteRecord?.day === room.night && room.dayVoteRecord.round === 1 && room.dayVoteRecord.pkSeats?.length > 1)) throw new Error("当前没有待进行的 PK 投票");
  if (requestedRound !== 1 && requestedRound !== 2) throw new Error("投票轮次不合法");
  const fog = Number(room.liaFogDay || 0) === Number(room.night);
  if (isDarkDestruction(room) && Number(room.darkFogAnnouncedDay || 0) !== Number(room.night)) throw new Error("请先公布本日禁锢与迷雾状态，再开始私密投票");
  const pkSeats = requestedRound === 2 ? room.dayVoteRecord.pkSeats.map(Number) : [];
  const voterSeats = getAliveSeats(room).filter((seat) => requestedRound !== 2 || !pkSeats.includes(seat));
  room.activeDarkBallot = {
    id: randomHex(12),
    day: room.night,
    round: requestedRound,
    status: "OPEN",
    voterSeats,
    allowedTargets: requestedRound === 2 ? pkSeats : getAliveSeats(room),
    votes: {},
    princeRevote: Boolean(room.orderPrinceRevotePending),
    openedAt: Date.now()
  };
  room.darkBallotRound = requestedRound;
  writeLog(room, "DARK_BALLOT_OPENED", { day: room.night, round: requestedRound, fog });
  addPublicAnnouncement(room, fog
    ? `${requestedRound === 2 ? "PK 投票前再次提醒：" : "公投前再次提醒："}迷雾开启，全体戴盔投票。`
    : `${requestedRound === 2 ? "开始 PK 投票。" : "开始放逐投票。"}`);
}

function announceDarkFog(room) {
  if (!isDarkDestruction(room)) throw new Error("当前版型不使用暗黑迷雾公告");
  if (room.phase !== "DAY" || !hasCurrentDaybreakRecord(room)) throw new Error("请先完成天亮死讯");
  if (!isSheriffElectionFinished(room)) throw new Error("请先结束警上进入警下");
  if (Number(room.darkFogAnnouncedDay || 0) === Number(room.night)) throw new Error("本日迷雾状态已经公布");
  if (room.activeDarkBallot?.status === "OPEN" || hasCurrentExileRecord(room)
    || room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length
    || (room.pendingDeathSkills || []).some((item) => item.day === room.night)
    || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) {
    throw new Error("请先完成当日死亡或投票结算");
  }
  room.darkFogAnnouncedDay = room.night;
  const bound = darkBindingTarget(room, room.night);
  const fog = Number(room.liaFogDay || 0) === Number(room.night);
  addPublicAnnouncement(room, `警下宣布：迷雾${fog ? "开启" : "未开启"}，昨夜${bound ? `${bound}号玩家被禁锢` : "无人被禁锢"}。${fog ? "全体戴盔投票。" : ""}`);
  writeLog(room, "DARK_FOG_ANNOUNCED", { day: room.night });
}

function closeDarkBallot(room) {
  const ballot = room.activeDarkBallot;
  if (!ballot || ballot.status !== "OPEN" || ballot.day !== room.night) throw new Error("当前没有进行中的投票");
  const missing = ballot.voterSeats.filter((seat) => !Object.prototype.hasOwnProperty.call(ballot.votes, String(seat)));
  if (missing.length) throw new Error(`还有 ${missing.length} 名玩家未提交投票或弃票`);
  const votes = Object.entries(ballot.votes).map(([voterSeat, targetSeat]) => ({ voterSeat: Number(voterSeat), targetSeat: Number(targetSeat) }));
  const record = calculateDayVote(room, { round: ballot.round, votes });
  room.dayVoteHistory = room.dayVoteHistory || [];
  room.dayVoteHistory.push(JSON.parse(JSON.stringify(record)));
  room.dayVoteRecord = record;
  room.activeDarkBallot = null;
  room.darkBallotRound = 0;
  writeLog(room, "DARK_BALLOT_CLOSED", { day: record.day, round: record.round, counts: record.counts, topSeats: record.topSeats, abstentions: record.votes.filter((vote) => !Number(vote.targetSeat)).length });
  if (room.boardId === "realm_of_trickery" && record.round === 1 && !room.orderPrinceUsed && !ballot.princeRevote) {
    room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
    const princeSeat = (room.assignments || []).find((assignment) => assignment.roleId === "order_prince" && assignment.alive !== false)?.seat || 0;
    openDaySkillWindow(room, { id: `order-prince-rewind-${room.night}`, day: room.night, trigger: "AFTER_FIRST_DAY_VOTE", kind: "ORDER_PRINCE_REWIND", eligibleSeats: princeSeat ? [princeSeat] : [], action: "ACTIVATE_OR_DECLINE", resume: "DAY_VOTE_OR_EXILE", metadata: { rawExiledSeat: Number(record.exiledSeat || 0), tied: record.topSeats?.length > 1 } });
    writeLog(room, "DAY_VOTE_PENDING", record);
    return;
  }
  if (ballot.princeRevote) room.orderPrinceRevotePending = false;
  if (record.exiledSeat || record.noExile) finalizeDayVote(room, record, "DARK_PRIVATE_BALLOT");
  else if (record.pkSeats.length) {
    const count = Number(record.counts[record.pkSeats[0]] || 0);
    addPublicAnnouncement(room, `${record.pkSeats.map((seat) => `${seat}号`).join("、")}平票，各 ${count} 票，进入 PK。`);
  }
}

function finalizeDayVote(room, record, source = "DAY_VOTE") {
  captureDayRecordUndo(room, "EXILE");
  const rawExiledSeat = Number(record.exiledSeat || 0);
  const actualExiledSeat = rawExiledSeat ? mapExileSeat(room, rawExiledSeat, record.day) : 0;
  record.rawExiledSeat = rawExiledSeat;
  record.actualExiledSeat = actualExiledSeat;
  record.exiledSeat = actualExiledSeat;
  if (actualExiledSeat) {
    const assignment = room.assignments.find((item) => item.seat === actualExiledSeat);
    if (assignment) {
      assignment.alive = false;
      if (assignment.roleId === "idiot") assignment.publiclyRevealed = true;
    }
    if (shouldStartTreasureMaskedFinalNight(room, assignment)) {
      room.treasureMaskedFinalNight = { seat: actualExiledSeat, triggerDay: room.night, status: "PENDING", createdAt: Date.now() };
      writeLog(room, "TREASURE_MASK_FINAL_NIGHT_PENDING", room.treasureMaskedFinalNight);
    } else {
      queueDarkDeathResolution(room, [actualExiledSeat], "EXILE");
    }
  }
  const exileRecord = { day: room.night, seat: actualExiledSeat, rawSeat: rawExiledSeat, noExile: record.noExile, source, createdAt: Date.now() };
  room.exileRecords.push(exileRecord);
  writeLog(room, "EXILE_CONFIRMED", exileRecord);
  if (room.mode === "SYSTEM") {
    room.systemDayOutcomeRecordedDay = room.night;
    const assignment = actualExiledSeat ? room.assignments.find((item) => item.seat === actualExiledSeat) : null;
    addPublicAnnouncement(room, record.noExile ? "白天无人出局。" : `${actualExiledSeat}号玩家出局${assignment?.roleId === "idiot" ? "，翻牌为白神" : ""}。`);
    maybeCompleteSystemGame(room);
  }
}

function validateNightAction(room, step, targetSeats, skipped, cardRoleId = "") {
  if (step.id === "lilith_bind" && step.inactive && !skipped) return "莉莉丝已出局，不能发动禁锢";
  if (step.id === "lia_fog" && !skipped && (!hasSuccessfulLiaCharge(room) || hasUsedLiaFog(room) || isDarkRoleBound(room, "lia") || !(room.assignments || []).some((item) => item.roleId === "lia" && item.alive !== false))) return "莉娅当前不能开启迷雾";
  if (isDarkDestruction(room) && step.id === "lilith_bind" && !skipped) {
    const lilithSeat = darkRoleSeat(room, "lilith");
    if (Number(targetSeats[0]) === Number(lilithSeat)) return "莉莉丝不能禁锢自己";
    const previous = (room.nightActions || []).find((action) => action.night === room.night - 1 && action.stepId === "lilith_bind" && !action.skipped);
    if (Number(previous?.targetSeats?.[0]) === Number(targetSeats[0])) return "莉莉丝不能连续两晚禁锢同一名玩家";
  }
  if (isDarkDestruction(room) && step.id === "archangel_bless" && !skipped
    && Number(targetSeats[0]) === Number(darkRoleSeat(room, "archangel"))) return "天使长不能祝福自己";
  if (isDarkDestruction(room) && step.id === "cain_check" && !skipped) {
    const cainSeat = darkRoleSeat(room, "cain");
    if (targetSeats.some((seat) => Number(seat) === Number(cainSeat))) return "凯恩不能选择自己作为鉴定对象";
    if (Number(targetSeats[0]) === Number(targetSeats[1])) return "凯恩必须选择两名不同玩家";
  }
  if (step.id === "treasure_pick") {
    const treasure = (room.assignments || []).find((assignment) => assignment.roleId === "treasure_master");
    const cards = treasure?.abilityState?.treasureCards || [];
    if (!cards.includes(cardRoleId)) return "所选身份不在盗宝牌堆中";
    const previous = (room.nightActions || []).find((action) => action.night === room.night - 1 && action.stepId === "treasure_pick");
    if (previous && previous.cardRoleId === cardRoleId) return "盗宝大师不能连续两晚选择同一张牌";
  }
  if (step.id === "treasure_skill") {
    const activeCard = currentTreasureCard(room);
    if (!activeCard) return "未找到本夜选择的盗宝牌";
    if (["spirit_medium", "dreamer"].includes(activeCard) && skipped) return "当前盗宝牌必须选择一名目标";
    if (["villager", "hunter"].includes(activeCard) && !skipped) return "当前盗宝牌没有主动夜间技能";
    if (activeCard === "poisoner" && !skipped && (room.nightActions || []).some((action) => action.stepId === "treasure_skill" && action.cardRoleId === "poisoner" && !action.skipped)) return "盗宝毒师的毒药已经使用过";
    if (activeCard === "wolf" && !skipped) return "盗宝狼人牌不提供额外技能刀，请在狼人夜使用普通狼刀";
  }
  if (step.id === "dreamer_dream" || (step.id === "treasure_skill" && cardRoleId === "dreamer")) {
    const sourceRole = step.id === "dreamer_dream" ? "dreamer" : "treasure_master";
    const sourceSeat = (room.assignments || []).find((assignment) => assignment.roleId === sourceRole)?.seat;
    if (!skipped && targetSeats.includes(Number(sourceSeat))) return "摄梦目标不能是技能来源本人";
  }
  if (step.id === "poisoner_poison" && !skipped && hasUsedNightStep(room, "poisoner_poison")) return "毒师的毒药已经使用过";
  if (skipped) return "";
  if (targetSeats.some((seat) => !(room.assignments || []).some((assignment) => assignment.seat === seat && assignment.alive !== false))) {
    return "夜间技能只能选择存活玩家";
  }
  if (["mask_check", "mask_give"].includes(step.id)) {
    const previous = (room.nightActions || []).find((action) => action.night === room.night - 1 && action.stepId === step.id && !action.skipped);
    if (previous?.targetSeats?.[0] === targetSeats[0]) return step.id === "mask_check" ? "假面不能连续两晚验证同一名玩家" : "假面不能连续两晚给予同一名玩家面具";
  }
  if (Array.isArray(step.allowedSeats) && targetSeats.some((seat) => !step.allowedSeats.includes(seat))) {
    return "所选玩家不符合当前技能的可选范围";
  }
  if (["guard_guard", "mechanical_guard"].includes(step.id)) {
    const lastGuard = [...(room.nightActions || [])]
      .reverse()
      .find((action) => action.stepId === step.id && action.night === room.night - 1 && !action.skipped);
    if (lastGuard && lastGuard.targetSeats && lastGuard.targetSeats[0] === targetSeats[0]) {
      return "守卫不能连续两晚守护同一名玩家";
    }
  }
  if (step.id === "witch_antidote" || step.id === "witch_poison") {
    const used = (room.nightActions || []).some((action) => action.stepId === step.id && !action.skipped);
    if (used) return step.id === "witch_antidote" ? "女巫解药已经使用过" : "女巫毒药已经使用过";
  }
  return "";
}

async function handleCreateRoom(request, env) {
  await cleanupExpiredRooms(env);
  const body = await readBody(request);
  if (!body.clientId) return error(400, "缺少 clientId");
  if (!body.boardId) return error(400, "缺少 boardId");
  if (!getBoard(body.boardId)) return error(400, "版型不存在");
  const room = {
    id: await createRoomId(env),
    name: "十二点天黑",
    mode: body.mode === "SYSTEM" ? "SYSTEM" : "JUDGE",
    fixedNightFlow: body.fixedNightFlow === 1 ? 1 : 0,
    boardId: body.boardId,
    phase: "WAITING",
    day: 0,
    night: 0,
    judgeClientId: body.clientId,
    controllerClientId: body.clientId,
    balanceProfileId: body.balanceProfileId || body.clientId,
    judgeToken: randomHex(18),
    judgeCode: randomDigits(4),
    judgeClaimFailures: 0,
    judgeClaimLockedUntil: 0,
    seats: createSeats(),
    assignments: [],
    puppetSeat: 0,
    logs: [],
    nightActions: [],
    currentNightSteps: [],
    currentNightStepIndex: 0,
    sheriffCandidates: [],
    sheriffWithdrawn: [],
    sheriffElectionDone: false,
    sheriffVoteRecord: null,
    sheriffBadge: { holderSeat: 0, lost: false },
    dayVoteRecord: null,
    pendingExileResult: null,
    orderPrinceUsed: false,
    orderPrinceRevotePending: false,
    activeDaySkillWindow: null,
    daySkillWindowRecords: [],
    privateEvents: [],
    deathRecords: [],
    pendingNightResolution: null,
    pendingDelayedDeaths: [],
    pendingDeathSkills: [],
    pendingDarkDeathQueue: [],
    pendingArchangelRevival: null,
    archangelReviveUsed: false,
    revivalRecords: [],
    activeDarkBallot: null,
    darkBallotRound: 0,
    liaFogDay: 0,
    darkFogAnnouncedDay: 0,
    deathSkillRecords: [],
    publicAnnouncements: [],
    systemDayOutcomeRecordedDay: 0,
    exileRecords: [],
    windDirection: "calm",
    lastWindDirection: "calm",
    boardedSeat: 0,
    captainDiedLastDay: false,
    captainAliveAtDawn: true,
    systemAnnouncementNotBefore: 0,
    systemStepTimeoutSeconds: body.mode === "SYSTEM" ? normalizeSystemStepTimeout(body.systemStepTimeoutSeconds) : 0,
    systemStepDeadlineAt: 0,
    controllerTransferCode: "",
    controllerTransferExpiresAt: 0,
    revision: 0,
    createdAt: Date.now()
  };
  writeLog(room, "ROOM_CREATED", { mode: room.mode, boardId: room.boardId });
  await saveRoom(env, room);
  return json({
    room: sanitizeRoom(room, { clientId: body.clientId, judgeToken: room.judgeToken }),
    judgeToken: room.judgeToken
  });
}

async function handleRoomAction(request, env, route) {
  const room = await loadRoom(env, route.roomId);
  if (!room) return error(404, "房间不存在");
  normalizeSeatOccupancy(room);
  const url = new URL(request.url);
  const body = await readBody(request);
  const clientId = body.clientId || url.searchParams.get("clientId") || "";
  const judgeToken = body.judgeToken || url.searchParams.get("judgeToken") || "";
  let privateResult = null;
  let persistenceEffects = {};

  if (request.method === "GET" && !route.action) {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }
  if (request.method !== "POST") return error(405, "方法不支持");

  if (route.action === "join") {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }

  if (route.action === "seat") {
    return reserveSeat(env, room, route.roomId, body, clientId, judgeToken);
  }

  if (route.action === "dark-ballot-vote") {
    return submitBallotVote(env, room, route.roomId, body, clientId, judgeToken);
  }

  const keyedClock = ["system-fixed-night", "system-day-voice"].includes(route.action);
  if (!keyedClock && route.action !== "reveal" && body.expectedRevision !== undefined && Number(body.expectedRevision) !== Number(room.revision || 0)) {
    return error(409, "房间状态已更新，请刷新后重试");
  }

  if (route.action === "system-upgrade-flow") {
    if (!isController(room, judgeToken) || room.mode !== "SYSTEM") return error(403, "只有控制设备可以升级流程");
    if (!["WAITING", "DEALT", "DAY"].includes(room.phase) || room.pendingNightResolution || room.pendingExileResult || room.activeDaySkillWindow || room.pendingArchangelRevival || (room.pendingDeathSkills || []).length || (room.pendingDelayedDeaths || []).length) return error(409, "请先处理当前对局待办，不能在夜间升级");
    room.fixedNightFlow = 1;
    await saveRoom(env, room);
    return json({room: sanitizeRoom(room, {clientId, judgeToken})});
  }
  if (route.action === "system-day-voice") {
    if (!isController(room, judgeToken) || !dayVoice.enabled(room) || room.phase !== "DAY") return error(403, "只有当前控制设备可以确认技能播报");
    try { dayVoice.control(room, body.operation, body.windowKey); }
    catch(err) { return error(409, err.message); }
    await saveRoom(env, room, { preserveRevision: body.operation === "heartbeat", heartbeat: body.operation === "heartbeat" });
    return json({room: sanitizeRoom(room, {clientId, judgeToken})});
  }
  if (route.action === "system-fixed-night") {
    if (!isController(room, judgeToken) || !fixedNight.enabled(room) || room.phase !== "NIGHT") return error(403, "只有当前控制设备可以推进夜间计时");
    try { fixedNight.control(room, body.operation, body.stepKey); syncNightTargetResolutions(room, room.night); }
    catch (err) { return error(409, err.message); }
    await saveRoom(env, room, { preserveRevision: body.operation === "heartbeat", heartbeat: body.operation === "heartbeat" });
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }
  if (route.action === "controller-transfer-start") {
    if (room.mode !== "SYSTEM" || !isController(room, judgeToken)) return error(403, "只有当前控制设备可以发起转让");
    room.controllerTransferCode = randomDigits(6);
    room.controllerTransferExpiresAt = Date.now() + CONTROLLER_TRANSFER_CODE_TTL_MS;
    room.controllerTransferFailures = 0;
    room.controllerTransferLockedUntil = 0;
    writeLog(room, "CONTROLLER_TRANSFER_CODE_CREATED", { expiresAt: room.controllerTransferExpiresAt });
    await saveRoom(env, room);
    return json({
      room: sanitizeRoom(room, { clientId, judgeToken }),
      controllerTransferCode: room.controllerTransferCode,
      controllerTransferExpiresAt: room.controllerTransferExpiresAt
    });
  }

  if (route.action === "controller-transfer-claim") {
    if (room.mode !== "SYSTEM") return error(400, "只有无法官房间可以转让控制权");
    if (!clientId) return error(400, "缺少设备标识");
    if (Date.now() < Number(room.controllerTransferLockedUntil || 0)) return error(429, "转让码尝试次数过多，请5分钟后重试");
    if (!room.controllerTransferCode || Date.now() > Number(room.controllerTransferExpiresAt || 0)) return error(400, "转让码已过期，请由当前控制设备重新生成");
    if (String(body.controllerTransferCode || "") !== room.controllerTransferCode) {
      room.controllerTransferFailures = Number(room.controllerTransferFailures || 0) + 1;
      if (room.controllerTransferFailures >= 5) room.controllerTransferLockedUntil = Date.now() + 5 * 60 * 1000;
      writeLog(room, "CONTROLLER_TRANSFER_CODE_REJECTED", { failures: room.controllerTransferFailures, lockedUntil: room.controllerTransferLockedUntil || 0 });
      await saveRoom(env, room);
      return error(room.controllerTransferLockedUntil ? 429 : 403, room.controllerTransferLockedUntil ? "转让码尝试次数过多，请5分钟后重试" : "转让码错误");
    }
    if ((room.seats || []).some((seat) => seat.clientId === clientId)) return error(400, "已入座的玩家设备不能接管公共控制权");
    const transferPhase = room.phase;
    room.judgeToken = randomHex(18);
    room.controllerClientId = clientId;
    room.controllerTransferCode = "";
    room.controllerTransferExpiresAt = 0;
    room.controllerTransferFailures = 0;
    room.controllerTransferLockedUntil = 0;
    writeLog(room, "CONTROLLER_TRANSFERRED", { phase: transferPhase, beforeDeal: transferPhase === "WAITING" });
    if (fixedNight.enabled(room) && room.fixedNightTiming) fixedNight.control(room, "pause", room.fixedNightTiming.key);
    const voiceGate = dayVoice.ensure(room);
    if (voiceGate) dayVoice.control(room, "pause", voiceGate.key);
    await saveRoom(env, room);
    return json({
      room: sanitizeRoom(room, { clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken,
      transferPhase
    });
  }

  if (route.action === "judge-claim") {
    if (room.mode !== "JUDGE") return error(400, "无法官房间没有法官席");
    if (judgeClaimLocked(room)) return error(429, "法官口令尝试过多，请 5 分钟后再试");
    if (String(body.judgeCode || "") !== room.judgeCode) {
      recordJudgeClaimFailure(room);
      await saveRoom(env, room);
      return judgeClaimLocked(room) ? error(429, "法官口令尝试过多，请 5 分钟后再试") : error(403, "法官口令错误");
    }
    resetJudgeClaimFailures(room);
    await saveRoom(env, room);
    return json({
      room: sanitizeRoom(room, { clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken
    });
  }

  if (route.action === "fill-test") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以补齐测试座位");
    if (room.phase !== "WAITING") return error(400, "发牌后不能补座");
    room.seats.forEach((seat) => {
      if (!seat.occupied) {
        seat.clientId = `test-${seat.seat}`;
        seat.userId = seat.clientId;
        seat.nickname = `${seat.seat}号`;
        seat.occupied = true;
      }
    });
    writeLog(room, "TEST_SEATS_FILLED", {});
  } else if (route.action === "deal") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以发牌");
    if (room.phase !== "WAITING") return error(400, "已经发过牌");
    if (room.seats.some((seat) => !seat.occupied || !seat.clientId)) return error(400, "需要 12 人满座才能发牌");
    const seats = room.seats.map((seat) => seat.seat);
    const profileId = room.balanceProfileId || room.judgeClientId;
    const historyState = await loadDealHistory(env, profileId);
    const balanced = createBalancedDeal({
      boardId: room.boardId,
      history: historyState.history,
      randomInt: secureRandomInt,
      createCandidate: () => dealBoard(room.boardId, seats)
    });
    room.assignments = balanced.assignments;
    room.dealBalanceMeta = balanced.meta;
    persistenceEffects.dealHistory = { profileId, history: balanced.history, expectedUpdatedAt: historyState.updatedAt };
    room.phase = "DEALT";
    writeLog(room, "DEALT", { boardId: room.boardId });
  } else if (route.action === "reveal") {
    const mySeat = room.seats.find((seat) => seat.clientId === clientId);
    const assignment = mySeat ? room.assignments.find((item) => item.seat === mySeat.seat) : null;
    if (assignment && !assignment.revealed) {
      assignment.revealed = true;
      writeLog(room, "IDENTITY_VIEWED", { seat: assignment.seat });
    }
    persistenceEffects.preserveRevision = true;
  } else if (route.action === "night-start") {
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    const canStartDayNextNight = room.phase === "DAY" && (
      (room.mode === "JUDGE" && isJudge(room, judgeToken))
      || (room.mode === "SYSTEM" && (isController(room, judgeToken) || ownSeat > 0))
    );
    if (room.phase !== "DAY" && !isController(room, judgeToken)) return error(403, "只有控制设备可以开始第一夜");
    if (room.phase === "DAY" && !canStartDayNextNight) return error(403, "请由法官或已入座玩家进入下一夜");
    if (room.phase !== "DEALT" && room.phase !== "DAY") return error(400, "当前阶段不能开始夜晚");
    if (room.phase === "DAY") {
      if (room.activeDaySkillWindow?.status === "OPEN") return error(400, "请先处理当前白天技能窗口");
      if (room.pendingExileResult) return error(400, "请先处理放逐结果与定序王子回溯窗口");
      if (room.orderPrinceRevotePending) return error(400, "请先完成回溯后的重新投票");
      if (room.mode === "SYSTEM" && room.pendingNightResolution) return error(400, "请先确认天亮死亡名单");
      if (room.mode === "JUDGE" && !hasCurrentDaybreakRecord(room)) return error(400, "请先宣布夜间死亡信息");
      if (room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) return error(400, "请先完成天使长复活与出局结算");
      if (room.activeDarkBallot?.status === "OPEN") return error(400, "请先结束暗黑私密投票");
      if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) return error(400, "请先处理蒙面人的延迟死亡");
      if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return error(400, "请先处理死亡技能");
      if (room.mode === "SYSTEM" && room.systemDayOutcomeRecordedDay !== room.night) return error(400, "请先记录本日最终出局结果或确认无人出局");
      if (room.mode === "JUDGE" && !hasCurrentExileRecord(room)) return error(400, "请先记录本日放逐对象或确认无人出局");
    }
    beginNight(room);
  } else if (route.action === "system-skill-timeout") {
    if (room.mode !== "SYSTEM" || room.phase !== "DAY") return error(400, "当前没有无法官白天技能窗口");
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    if (!isController(room, judgeToken) && !ownSeat) return error(403, "请先入座后处理技能超时");
    if (!expireSystemSkillWindow(room)) return error(409, "技能窗口尚未超时或已被处理");
  } else if (route.action === "system-timeout-skip") {
    if (fixedNight.enabled(room)) return error(400, "固定流程不能强制跳过，请按计时推进");
    if (room.mode !== "SYSTEM" || !isController(room, judgeToken)) return error(403, "只有公共控制设备可以处理超时");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) return error(400, "夜间流程已完成");
    if (["puppet_select", "mixed_blood_model", "lia_raise", "lilith_bind", "lia_charge", "dreamer_dream", "cain_check"].includes(step.id)) return error(400, "该系统步骤不可因超时跳过");
    if (!room.systemStepDeadlineAt || Date.now() < Number(room.systemStepDeadlineAt)) return error(400, "当前步骤尚未超时");
    const record = {
      night: room.night,
      stepId: step.id,
      label: step.label,
      targetSeats: [],
      skipped: true,
      cardRoleId: "",
      timeout: true,
      createdAt: Date.now()
    };
    room.nightActions.push(record);
    writeLog(room, "SYSTEM_STEP_TIMEOUT_SKIPPED", { stepId: step.id, night: room.night });
    room.currentNightStepIndex += 1;
    scheduleSystemAnnouncement(room);
  } else if (route.action === "night-action") {
    if (fixedNight.enabled(room) && !fixedNight.actionable(room)) return error(409, "当前步骤不能提交或已经确认");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) return error(400, "夜间流程已完成");
    const seat = room.seats.find((item) => item.clientId === clientId);
    const assignment = seat ? room.assignments.find((item) => item.seat === seat.seat) : null;
    if (room.mode === "SYSTEM" && !isSystemAnnouncementReady(room)) return error(400, "正在等待下一流程播报");
    const canAct = isJudge(room, judgeToken) || (room.mode === "SYSTEM" && canAssignmentAct(room, step, assignment));
    if (!canAct) return error(403, "当前不是你的夜间行动步骤");
    const targetSeats = uniqueSeats(body.targetSeats);
    const skipped = Boolean(body.skipped);
    let cardRoleId = body.cardRoleId || "";
    if (step.id === "treasure_skill") cardRoleId = currentTreasureCard(room);
    if (step.id === "siren_wind") {
      const wind = body.windDirection;
      if (!["calm", "tailwind", "headwind"].includes(wind)) return error(400, "风向不合法");
      if (room.night > 1 && wind === room.windDirection) return error(400, "不可连续两晚选择相同风向");
      room.lastWindDirection = room.windDirection || "calm";
      room.windDirection = wind;
      room.nightActions.push({
        night: room.night, stepId: step.id, label: step.label,
        targetSeats: [], skipped: false, cardRoleId: "", windDirection: wind, createdAt: Date.now()
      });
      syncNightTargetResolutions(room, room.night);
      writeLog(room, "NIGHT_ACTION", { stepId: step.id, windDirection: wind });
      room.currentNightStepIndex += 1;
      scheduleSystemAnnouncement(room);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (step.id === "witch_action") {
      const requestedAntidote = Boolean(body.antidoteUsed);
      if (requestedAntidote && !step.antidoteAvailable) return error(400, "解药已经使用");
      const antidoteUsed = requestedAntidote && step.antidoteAvailable;
      const wolfAction = [...room.nightActions].reverse().find((action) => action.night === room.night && action.stepId === "wolves_kill" && !action.skipped);
      const antidoteTargetSeat = antidoteUsed && wolfAction && wolfAction.targetSeats ? Number(wolfAction.targetSeats[0]) : 0;
      if (antidoteUsed && !antidoteTargetSeat) return error(400, "今晚无人被击杀，不能使用解药");
      const witchSeat = (room.assignments || []).find((item) => item.roleId === "witch")?.seat || 0;
      if (antidoteUsed && antidoteTargetSeat === witchSeat) return error(400, "女巫不能自救");
      const requestedPoisonSeat = Number(body.poisonTargetSeat || 0);
      const poisonTargetSeat = step.poisonAvailable && requestedPoisonSeat >= 1 && requestedPoisonSeat <= 12 ? requestedPoisonSeat : 0;
      if (requestedPoisonSeat && !poisonTargetSeat) return error(400, "毒药目标不合法或毒药已经使用");
      if (poisonTargetSeat && !(room.assignments || []).some((item) => item.seat === poisonTargetSeat && item.alive !== false)) return error(400, "毒药只能选择存活玩家");
      if (step.singlePotionPerNight && antidoteUsed && poisonTargetSeat) return error(400, "女巫同一晚不能同时使用解药和毒药");
      const record = {
        night: room.night,
        stepId: step.id,
        label: step.label,
        targetSeats: [],
        skipped: !antidoteUsed && !poisonTargetSeat,
        cardRoleId: "",
        antidoteUsed,
        antidoteTargetSeat,
        poisonTargetSeat,
        createdAt: Date.now()
      };
      room.nightActions.push(record);
      syncNightTargetResolutions(room, room.night);
      writeLog(room, "NIGHT_ACTION", record);
      room.currentNightStepIndex += 1;
      scheduleSystemAnnouncement(room);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (!skipped && !step.needsCard && targetSeats.length !== step.targetCount) return error(400, `需要选择 ${step.targetCount} 个目标`);
    if (skipped && !step.allowSkip) return error(400, "这个步骤不能跳过");
    if (step.needsCard && !cardRoleId) return error(400, "需要选择一张盗宝牌");
    const ruleError = validateNightAction(room, step, targetSeats, skipped, cardRoleId);
    if (ruleError) return error(400, ruleError);
    const record = {
      night: room.night,
      stepId: step.id,
      label: step.label,
      targetSeats,
      skipped,
      cardRoleId,
      targetMapping: step.targetMapping ? { ...step.targetMapping, targetSeats: [...targetSeats] } : undefined,
      createdAt: Date.now()
    };
    if (isDarkDestruction(room) && step.id === "lia_charge") {
      record.success = !skipped && (room.assignments || []).some((assignment) => assignment.seat === targetSeats[0] && assignment.roleId === "villager");
    }
    privateResult = room.mode === "SYSTEM" ? buildPrivateNightResult(room, step, record) : null;
    room.nightActions.push(record);
    if (isDarkDestruction(room) && step.id === "lia_fog" && !skipped) room.liaFogDay = room.night;
    if (step.id === "puppet_select" && targetSeats.length) room.puppetSeat = targetSeats[0];
    if (step.id === "captain_board" && targetSeats.length) {
      room.boardedSeat = targetSeats[0];
    }
    refreshSwapConflict(room, room.night);
    syncNightTargetResolutions(room, room.night);
    if (privateResult && seat?.seat) recordPrivateEvent(room, {
      type: "NIGHT_ACTION_RESULT",
      audience: { kind: "SEAT", seat: seat.seat },
      payload: { night: room.night, stepId: step.id, result: privateResult }
    });
    writeLog(room, "NIGHT_ACTION", record);
    if (isDarkDestruction(room) && ["lilith_bind", "lia_charge"].includes(step.id)) {
      rebuildNightStepsAfterDarkAction(room);
    } else {
      room.currentNightStepIndex += 1;
    }
    scheduleSystemAnnouncement(room);
  } else if (route.action === "night-undo") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以撤回夜间行动");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const index = [...room.nightActions].map((action, actionIndex) => ({ action, actionIndex }))
      .reverse()
      .find((item) => item.action.night === room.night);
    if (!index) return error(400, "没有可撤回的夜间行动");
    const [removed] = room.nightActions.splice(index.actionIndex, 1);
    if (removed.stepId === "siren_wind") {
      const previousWind = [...room.nightActions].reverse().find((action) => action.stepId === "siren_wind" && action.night < room.night)?.windDirection || "calm";
      room.windDirection = previousWind;
      room.lastWindDirection = previousWind;
    }
    if (removed.stepId === "captain_board") room.boardedSeat = 0;
    if (removed.stepId === "puppet_select") {
      room.puppetSeat = [...room.nightActions].reverse()
        .find((action) => action.stepId === "puppet_select")?.targetSeats?.[0] || 0;
    }
    if (removed.stepId === "lia_fog") {
      room.liaFogDay = [...room.nightActions].reverse()
        .find((action) => action.stepId === "lia_fog" && !action.skipped)?.night || 0;
    }
    refreshSwapConflict(room, room.night);
    syncNightTargetResolutions(room, room.night);
    rebuildNightStepsAfterUndo(room);
    startSystemStep(room);
    writeLog(room, "NIGHT_ACTION_UNDONE", { stepId: removed.stepId, label: removed.label, night: removed.night });
  } else if (route.action === "night-finish") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以结束夜晚");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    if ((room.currentNightStepIndex || 0) < (room.currentNightSteps || []).length) return error(400, "仍有夜间身份尚未行动");
    syncNightTargetResolutions(room, room.night);
    room.phase = "DAY";
    room.pendingNightResolution = calculateNightResolution(room, room.night);
    if (room.treasureMaskedFinalNight?.status === "ACTIVE") {
      room.treasureMaskedFinalNight.status = "RESOLVED";
      room.treasureMaskedFinalNight.resolvedAt = Date.now();
      writeLog(room, "TREASURE_MASK_FINAL_NIGHT_RESOLVED", room.treasureMaskedFinalNight);
    }
    writeLog(room, "NIGHT_FINISHED", { night: room.night });
  } else if (route.action === "system-publish-daybreak") {
    if (room.mode !== "SYSTEM" || !isController(room, judgeToken)) return error(403, "只有公共控制设备可以公布死讯");
    if (room.phase !== "DAY" || !room.pendingNightResolution) return error(400, "当前没有待公布的天亮结果");
    const seats = (room.pendingNightResolution.deaths || []).map((item) => item.seat);
    const reasons = Object.fromEntries((room.pendingNightResolution.deaths || []).map((item) => [String(item.seat), item.reasons || []]));
    seats.forEach((seat) => {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) assignment.alive = false;
    });
    room.pendingDelayedDeaths = [
      ...(room.pendingDelayedDeaths || []).filter((item) => item.day !== room.night),
      ...(room.pendingNightResolution.delayedDeaths || []).map((item) => ({ ...item, day: room.night }))
    ];
    room.pendingNightResolution = null;
    const record = addDeathRecord(room, {
      day: room.night,
      phase: "DAYBREAK",
      seats,
      reasons,
      sourceAction: { kind: "NIGHT_RESOLUTION", night: room.night },
      resolutionOrder: 1
    });
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
    const announcement = seats.length ? `天亮了，昨夜${seats.map((seat) => `${seat}号`).join("、")}死亡。` : "天亮了，昨夜是平安夜。";
    addPublicAnnouncement(room, announcement);
    const boomSeat = Number(room.pendingSheriffSelfDestructSeat || 0);
    queueDarkDeathResolution(room, seats.filter((seat) => seat !== boomSeat), "DAYBREAK", reasons);
    if (boomSeat) queueDarkDeathResolution(room, [boomSeat], "SELF_DESTRUCT", { [String(boomSeat)]: ["狼人自爆"] });
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
    await saveRoom(env, room);
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }), announcement });
  } else if (route.action === "sheriff-stage-close") {
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或控制设备可以结束警上");
    if (!isSheriffElectionDay(room)) return error(400, "当前不在警长竞选日");
    room.sheriffStageClosedDay = room.night;
    writeLog(room, "SHERIFF_STAGE_CLOSED", { day: room.night });
  } else if (route.action === "sheriff-election-self-destruct") {
    if (!isJudge(room, judgeToken)) return error(403, "只有法官可以记录警长竞选中的自爆");
    if (!isSheriffSelfDestructWindowOpen(room)) return error(400, "当前没有可记录自爆的警长竞选流程");
    try {
      recordSheriffElectionSelfDestruct(room, Number(body.seat));
    } catch (error) {
      return error(400, error.message);
    }
    continueAfterSystemSelfDestruct(room);
  } else if (route.action === "sheriff-candidates") {
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以记录上警");
    if (!isSheriffElectionDay(room)) return error(400, "当前不是警长竞选阶段");
    const seats = uniqueSeats(body.seats);
    room.sheriffCandidates = seats;
    room.sheriffWithdrawn = (room.sheriffWithdrawn || []).filter((seat) => seats.includes(seat));
    room.sheriffElectionDone = seats.length === 0;
    room.sheriffVoteRecord = null;
    if (!seats.length) room.sheriffBadge = { holderSeat: 0, lost: true };
    writeLog(room, "SHERIFF_CANDIDATES_CONFIRMED", { seats });
  } else if (route.action === "sheriff-withdraw") {
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以记录退水");
    if (!isSheriffElectionDay(room)) return error(400, "当前不是警长竞选阶段");
    const seats = uniqueSeats(body.seats, room.sheriffCandidates || []);
    room.sheriffWithdrawn = seats;
    const activeCandidates = (room.sheriffCandidates || []).filter((seat) => !room.sheriffWithdrawn.includes(seat));
    if ((room.sheriffCandidates || []).length && !activeCandidates.length) {
      room.sheriffElectionDone = true;
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_WITHDRAW_CONFIRMED", { seats });
  } else if (route.action === "sheriff-self-withdraw") {
    if (room.mode !== "SYSTEM") return error(403, "有法官模式由法官记录退水");
    if (!isSheriffElectionDay(room)) return error(400, "当前不是警长竞选阶段");
    const mySeat = room.seats.find((seat) => seat.clientId === clientId);
    if (!mySeat) return error(400, "请先选择座位");
    const candidates = room.sheriffCandidates || [];
    if (!candidates.includes(mySeat.seat)) return error(400, "只有上警玩家可以退水");
    const withdrawn = new Set(room.sheriffWithdrawn || []);
    withdrawn.add(mySeat.seat);
    room.sheriffWithdrawn = [...withdrawn].filter((seat) => candidates.includes(seat)).sort((a, b) => a - b);
    const activeCandidates = candidates.filter((seat) => !room.sheriffWithdrawn.includes(seat));
    if (candidates.length && !activeCandidates.length) {
      room.sheriffElectionDone = true;
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_SELF_WITHDRAWN", { seat: mySeat.seat });
  } else if (route.action === "sheriff-vote") {
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以记录警徽投票");
    if (!isSheriffElectionDay(room)) return error(400, "当前不是警长竞选阶段");
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
    const round = Number(body.round || 1);
    const previous = room.sheriffVoteRecord;
    const tiedPkSeats = previous && previous.round === 1 && previous.pkSeats?.length > 1 ? uniqueSeats(previous.pkSeats, activeCandidates) : [];
    const allowedTargets = round === 1 ? activeCandidates : round === 2 ? tiedPkSeats : [];
    const pkVoters = new Set(allowedTargets);
    const aliveSeats = new Set(getAliveSeats(room));
    const allowedVoters = room.seats
      .map((seat) => seat.seat)
      .filter((seat) => aliveSeats.has(seat) && (round === 1 ? !candidates.includes(seat) : !pkVoters.has(seat)));
    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    const votes = Array.isArray(body.votes) ? body.votes : [];
    const seenVoters = new Set();
    const validVotes = votes.filter((vote) => {
      const voterSeat = Number(vote.voterSeat);
      const targetSeat = Number(vote.targetSeat);
      if (!allowedVoters.includes(voterSeat) || !allowedTargets.includes(targetSeat) || seenVoters.has(voterSeat)) return false;
      seenVoters.add(voterSeat);
      return true;
    });
    validVotes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      counts[targetSeat] += 1;
    });
    const maxVotes = Math.max(0, ...Object.values(counts));
    const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
    const electedSeat = topSeats.length === 1 ? topSeats[0] : 0;
    const badgeLost = round === 2 && !electedSeat;
    const record = {
      round,
      votes: validVotes,
      counts,
      topSeats,
      electedSeat,
      badgeLost,
      pkSeats: round === 1 && topSeats.length > 1 ? topSeats : [],
      createdAt: Date.now()
    };
    room.sheriffVoteRecord = record;
    room.sheriffElectionDone = Boolean(electedSeat || badgeLost);
    if (electedSeat) {
      room.sheriffBadge = { holderSeat: electedSeat, lost: false };
      room.assignments.forEach((assignment) => { assignment.sheriff = assignment.seat === electedSeat; });
    } else if (badgeLost) {
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_VOTE_CONFIRMED", record);
  } else if (route.action === "death-record") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录死亡");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录天亮死亡");
    if (hasCurrentDaybreakRecord(room)) return error(400, "本日天亮死亡已经记录");
    const seats = uniqueSeats(body.seats);
    const boomSeat = Number(room.pendingSheriffSelfDestructSeat || 0);
    if (boomSeat && (room.pendingNightResolution?.deaths || []).some((item) => Number(item.seat) === boomSeat) && !seats.includes(boomSeat)) return error(400, "自爆玩家也是昨夜死亡玩家，请在警上宣布该死讯");
    const invalidSeat = seats.find((seat) => seat !== boomSeat && !room.assignments.some((item) => item.seat === seat && item.alive !== false));
    if (invalidSeat) return error(400, `${invalidSeat}号不是存活玩家，不能记录为天亮死亡`);
    captureDayRecordUndo(room, "DAYBREAK");
    seats.forEach((seat) => {
      room.assignments.find((item) => item.seat === seat).alive = false;
    });
    const submittedReasons = normalizeDeathReasons(body.reasons, seats);
    const suggestedReasons = Object.fromEntries(
      (room.pendingNightResolution?.deaths || []).map((item) => [String(item.seat), item.reasons || []])
    );
    const reasons = {};
    seats.forEach((seat) => {
      reasons[String(seat)] = submittedReasons[String(seat)].length
        ? submittedReasons[String(seat)]
        : suggestedReasons[String(seat)] || [];
    });
    const hadPendingNightResolution = Boolean(room.pendingNightResolution);
    const delayedDeaths = (room.pendingNightResolution?.delayedDeaths || []).map((item) => ({
      ...item,
      day: room.night
    }));
    room.pendingDelayedDeaths = [
      ...(room.pendingDelayedDeaths || []).filter((item) => item.day !== room.night),
      ...delayedDeaths
    ];
    room.pendingNightResolution = null;
    const record = addDeathRecord(room, {
      day: room.night,
      phase: "DAYBREAK",
      seats,
      reasons,
      sourceAction: { kind: hadPendingNightResolution ? "NIGHT_RESOLUTION" : "JUDGE_RECORD", night: room.night },
      resolutionOrder: 1
    });
    queueDarkDeathResolution(room, seats.filter((seat) => seat !== boomSeat), "DAYBREAK", reasons);
    if (boomSeat) queueDarkDeathResolution(room, [boomSeat], "SELF_DESTRUCT", { [String(boomSeat)]: ["狼人自爆"] });
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
    continueAfterSystemSelfDestruct(room);
  } else if (route.action === "day-record-correct") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以修正当日记录");
    if (!canCorrectDayRecord(room)) return error(400, "当前记录已有后续结算，不能安全撤销");
    const stage = room.dayRecordUndo.stage;
    restoreDayRecordUndo(room);
    writeLog(room, "DAY_RECORD_CORRECTED", { day: room.night, stage, correctedAt: Date.now() });
  } else if (route.action === "delayed-death") {
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && ownSeat === Number(body.seat || 0))) return error(403, "只有本人可以确认延迟死亡");
    if (room.phase !== "DAY") return error(400, "当前阶段不能确认延迟死亡");
    const seat = Number(body.seat || 0);
    const pending = (room.pendingDelayedDeaths || []).find((item) => item.day === room.night && item.seat === seat);
    if (!pending) return error(400, "没有该玩家的待处理延迟死亡");
    const assignment = room.assignments.find((item) => item.seat === seat);
    if (assignment) assignment.alive = false;
    room.pendingDelayedDeaths = (room.pendingDelayedDeaths || []).filter((item) => !(item.day === room.night && item.seat === seat));
    const record = addDeathRecord(room, {
      day: room.night,
      phase: "DELAYED",
      seats: [seat],
      reasons: { [String(seat)]: ["蒙面延迟死亡"] },
      sourceAction: { kind: "DELAYED_DEATH", stepId: "mask" },
      resolutionOrder: 2
    });
    writeLog(room, "DELAYED_DEATH_CONFIRMED", record);
    if (room.mode === "SYSTEM") addPublicAnnouncement(room, `${seat}号玩家死亡。`);
    queueDarkDeathResolution(room, [seat], "DELAYED", { [String(seat)]: ["蒙面延迟死亡"] });
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
  } else if (route.action === "archangel-revival") {
    if (!room.pendingArchangelRevival) return error(400, "当前没有待处理的天使长复活窗口");
    if (room.mode === "SYSTEM" && room.pendingArchangelRevival.virtual) return error(403, "当前没有可发动的复活技能");
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    const ownAssignment = (room.assignments || []).find((item) => item.seat === ownSeat);
    const canDecide = isJudge(room, judgeToken)
      || (room.mode === "SYSTEM" && ownAssignment?.roleId === "archangel" && ownAssignment.alive !== false);
    if (!canDecide) return error(403, "只有法官或存活的天使长可以处理复活窗口");
    if (room.mode === "SYSTEM" && systemSkillDeadlineAt(room) && Date.now() >= systemSkillDeadlineAt(room)) {
      expireSystemSkillWindow(room);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    try { resolveArchangelRevival(room, Boolean(body.use)); } catch (err) { return error(400, err.message); }
    startNextSystemDeathSkillWindow(room);
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
  } else if (route.action === "death-skill") {
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && ownSeat === Number(body.seat || 0))) return error(403, "只有本人可以处理死亡技能");
    if (room.phase !== "DAY") return error(400, "当前阶段不能处理死亡技能");
    const seat = Number(body.seat || 0);
    const targetSeat = Number(body.targetSeat || 0);
    const pending = (room.pendingDeathSkills || []).find((item) => item.day === room.night && item.seat === seat);
    if (!pending) return error(400, "没有该玩家待处理的死亡技能");
    if (pending.eligible === false) return error(403, "当前玩家没有可发动的死亡技能");
    const firstPending = (room.pendingDeathSkills || []).find((item) => item.day === room.night);
    if (firstPending?.seat !== pending.seat) return error(409, "请等待前一名玩家的技能窗口处理完成");
    if (room.mode === "SYSTEM" && systemSkillDeadlineAt(room) && Date.now() >= systemSkillDeadlineAt(room)) {
      expireSystemSkillWindow(room);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (targetSeat === seat) return error(400, "不能选择自己作为开枪目标");
    const suppressed = Boolean(pending.suppressed);
    if (targetSeat && !suppressed) {
      const targetAssignment = room.assignments.find((item) => item.seat === targetSeat);
      if (!targetAssignment || targetAssignment.alive === false) return error(400, "开枪目标必须是存活玩家");
      if (isDarkDestruction(room) && targetAssignment.roleId === "dreamer" && darkBindingTarget(room) === targetSeat) return error(400, "被禁锢的摄梦人次日白天不能出局");
      targetAssignment.alive = false;
      addDeathRecord(room, {
        day: room.night,
        phase: "SHOT",
        seats: [targetSeat],
        reasons: { [String(targetSeat)]: [`${seat}号死亡技能`] },
        sourceAction: { kind: "DEATH_SKILL", seat },
        resolutionOrder: 3
      });
      queueDarkDeathResolution(room, [targetSeat], "SHOT", { [String(targetSeat)]: [`${seat}号死亡技能`] });
    }
    room.pendingDeathSkills = (room.pendingDeathSkills || []).filter((item) => !(item.day === room.night && item.seat === seat));
    const record = [...(room.deathSkillRecords || [])].reverse().find((item) => item.day === room.night && item.seat === seat && !item.resolved);
    if (record) Object.assign(record, { resolved: true, targetSeat, skipped: !targetSeat, suppressed, resolvedAt: Date.now() });
    const sourceDeath = [...(room.deathRecords || [])].reverse().find((item) => item.day === room.night && item.seats?.includes(seat));
    if (sourceDeath) sourceDeath.deathSkill = { ...(sourceDeath.deathSkill || {}), queued: true, resolved: true, targetSeat, suppressed };
    writeLog(room, "DEATH_SKILL_RESOLVED", { seat, targetSeat, skipped: !targetSeat, suppressed });
    if (room.mode === "SYSTEM" && targetSeat && !suppressed) addPublicAnnouncement(room, `${seat}号玩家发动技能，${targetSeat}号玩家死亡。`);
    advanceDarkDeathResolution(room);
    startNextSystemDeathSkillWindow(room);
    if (!continueAfterSystemSelfDestruct(room)) maybeCompleteSystemGame(room);
  } else if (route.action === "dark-ballot-open") {
    if (room.mode !== "SYSTEM") return error(403, "有法官模式请由法官记录线下票型");
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以开始投票");
    try { openDarkBallot(room, Number(body.round || 1)); } catch (err) { return error(400, err.message); }
  } else if (route.action === "dark-fog-announce") {
    if (!isDarkDestruction(room)) return error(400, "当前版型不使用暗黑迷雾公告");
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以公布迷雾状态");
    try { announceDarkFog(room); } catch (err) { return error(400, err.message); }
  } else if (route.action === "dark-ballot-close") {
    if (room.mode !== "SYSTEM") return error(403, "有法官模式请由法官记录线下票型");
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或公共控制设备可以结束投票");
    try { closeDarkBallot(room); } catch (err) { return error(400, err.message); }
    if (room.mode === "SYSTEM") maybeCompleteSystemGame(room);
  } else if (route.action === "day-vote") {
    if (isDarkDestruction(room) && room.mode !== "JUDGE") return error(400, "无法官暗黑破坏 2.0 必须使用逐座位私密投票");
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && isController(room, judgeToken))) return error(403, "只有法官或控制设备可以记录放逐投票");
    if (isDarkDestruction(room) && Number(room.liaFogDay || 0) === Number(room.night) && Number(room.darkFogAnnouncedDay || 0) !== Number(room.night)) return error(400, "请先公布本日迷雾状态");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐投票");
    if (room.activeDarkBallot?.status === "OPEN") return error(400, "请先完成正在进行的手机投票");
    if (room.activeDaySkillWindow?.status === "OPEN") return error(400, "请先关闭当前白天技能窗口");
    if (room.pendingExileResult) return error(400, "请先处理定序王子的发动时机");
    if (Boolean(body.orderPrinceRevote) !== Boolean(room.orderPrinceRevotePending)) return error(400, "当前投票轮次与定序王子状态不一致");
    const record = calculateDayVote(room, body);
    room.dayVoteHistory = room.dayVoteHistory || [];
    room.dayVoteHistory.push(JSON.parse(JSON.stringify(record)));
    room.dayVoteRecord = record;
    const princeRevote = Boolean(body.orderPrinceRevote);
    if (room.boardId === "realm_of_trickery" && record.round === 1 && !room.orderPrinceUsed && !princeRevote) {
      room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
      const princeSeat = (room.assignments || []).find((assignment) => assignment.roleId === "order_prince" && assignment.alive !== false)?.seat || 0;
      openDaySkillWindow(room, {
        id: `order-prince-rewind-${room.night}`,
        day: room.night,
        trigger: "AFTER_FIRST_DAY_VOTE",
        kind: "ORDER_PRINCE_REWIND",
        eligibleSeats: princeSeat ? [princeSeat] : [],
        action: "ACTIVATE_OR_DECLINE",
        resume: "DAY_VOTE_OR_EXILE",
        metadata: { rawExiledSeat: Number(record.exiledSeat || 0), tied: record.topSeats?.length > 1 }
      });
      writeLog(room, "DAY_VOTE_PENDING", record);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (princeRevote) room.orderPrinceRevotePending = false;
    if (record.exiledSeat || record.noExile) {
      finalizeDayVote(room, record, princeRevote ? "ORDER_PRINCE_REVOTE" : "DAY_VOTE");
    }
    writeLog(room, "DAY_VOTE_CONFIRMED", record);
  } else if (route.action === "order-prince-activate" || route.action === "order-prince-decline") {
    const systemController = room.mode === "SYSTEM" && isController(room, judgeToken);
    const ownSeat = room.seats.find((seat) => seat.clientId === clientId)?.seat || 0;
    const ownPrince = room.assignments.find((assignment) => assignment.seat === ownSeat && assignment.roleId === "order_prince" && assignment.alive !== false);
    if (route.action === "order-prince-activate" && !(room.mode === "SYSTEM" ? ownPrince : isJudge(room, judgeToken))) return error(403, "只有存活的定序王子可以发动回溯");
    if (route.action === "order-prince-decline" && !(room.mode === "SYSTEM" ? systemController : isJudge(room, judgeToken))) return error(403, "只有控制设备可以确认无人发动");
    if (room.mode === "SYSTEM" && systemSkillDeadlineAt(room) && Date.now() >= systemSkillDeadlineAt(room)) {
      expireSystemSkillWindow(room);
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (room.boardId !== "realm_of_trickery" || !room.pendingExileResult) return error(400, "当前没有待处理的定序王子时机");
    if (room.activeDaySkillWindow?.kind !== "ORDER_PRINCE_REWIND" || room.activeDaySkillWindow.status !== "OPEN") return error(400, "当前白天技能窗口不可用");
    const pending = room.pendingExileResult;
    if (route.action === "order-prince-activate") {
      if (room.orderPrinceUsed) return error(400, "定序王子已经发动过技能");
      if (!room.assignments.some((item) => item.roleId === "order_prince" && item.alive !== false)) return error(400, "定序王子已出局，不能发动回溯");
      room.orderPrinceUsed = true;
      room.orderPrinceRevotePending = true;
      room.pendingExileResult = null;
      room.dayVoteRecord = null;
      resolveDaySkillWindow(room, { actorSeat: ownSeat, outcome: "ACTIVATED", detail: { effect: "ORDER_PRINCE_REVOTE" } });
      writeLog(room, "ORDER_PRINCE_ACTIVATED", { day: room.night });
    } else {
      const record = pending.record || pending;
      room.pendingExileResult = null;
      room.dayVoteRecord = record;
      resolveDaySkillWindow(room, { actorSeat: 0, outcome: "DECLINED", detail: { effect: "CONTINUE_EXILE" } });
      if (record.exiledSeat || record.noExile) finalizeDayVote(room, record);
      writeLog(room, "ORDER_PRINCE_DECLINED", { day: room.night });
    }
  } else if (route.action === "wolf-self-destruct") {
    if (room.mode !== "SYSTEM") return error(400, "自爆入口仅用于无法官模式");
    if (room.phase !== "DAY") return error(400, "只能在白天阶段自爆");
    const interruptedSheriffElection = isSheriffSelfDestructWindowOpen(room);
    if ((room.pendingNightResolution && !interruptedSheriffElection) || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night) || (room.pendingDeathSkills || []).some((item) => item.day === room.night)) return error(400, "请先完成当前死亡结算");
    if (room.activeDaySkillWindow?.status === "OPEN" || room.pendingExileResult || room.orderPrinceRevotePending || room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) return error(400, "请先完成当前技能窗口或重新投票");
    if (room.systemDayOutcomeRecordedDay === room.night) return error(400, "本日出局结果已经记录");
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    const assignment = room.assignments.find((item) => item.seat === ownSeat);
    if (!assignment || assignment.alive === false || ["mixed_blood", "mechanical_wolf", "lia"].includes(assignment.roleId) || (assignment.currentCamp || assignment.camp) !== "WOLF") return error(403, "只有可自爆的存活狼人可以自爆");
    if (isDarkDestruction(room) && darkBindingTarget(room, room.night) === ownSeat) return error(400, "被禁锢的狼人不能自爆");
    if (room.activeDarkBallot?.status === "OPEN") {
      room.abortedBallots = [...(room.abortedBallots || []), { ...room.activeDarkBallot, status: "CANCELLED", reason: "SELF_DESTRUCT" }];
      room.activeDarkBallot = null;
    }
    let record;
    if (interruptedSheriffElection) {
      record = recordSheriffElectionSelfDestruct(room, ownSeat);
    } else {
      assignment.alive = false;
      record = addDeathRecord(room, {
        day: room.night,
        phase: "SELF_DESTRUCT",
        seats: [ownSeat],
        reasons: { [String(ownSeat)]: ["狼人自爆"] },
        sourceAction: { kind: "SELF_DESTRUCT", seat: ownSeat },
        resolutionOrder: 1
      });
      queueDarkDeathResolution(room, [ownSeat], "SELF_DESTRUCT", record.reasons);
      room.pendingSystemNightAfterSelfDestruct = true;
      writeLog(room, "WOLF_SELF_DESTRUCTED", { seat: ownSeat, roleId: assignment.roleId });
    }
    room.systemDayOutcomeRecordedDay = room.night;
    const pendingSkill = (room.pendingDeathSkills || []).some((item) => item.day === room.night && item.seat === ownSeat);
    const revivalPending = Boolean(room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length);
    if (!interruptedSheriffElection) addPublicAnnouncement(room, revivalPending ? "等待天使长处理复活窗口。" : pendingSkill ? `${ownSeat}号玩家自爆，等待其发动死亡技能。` : `${ownSeat}号玩家自爆，天黑请闭眼。`);
    continueAfterSystemSelfDestruct(room);
  } else if (route.action === "exile-record") {
    if (isDarkDestruction(room) && room.mode !== "JUDGE") return error(400, "暗黑破坏 2.0 无法官模式必须完成线上私密投票");
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以记录放逐");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐");
    if (room.activeDarkBallot?.status === "OPEN") return error(400, "请先完成正在进行的手机投票");
    if (!hasCurrentDaybreakRecord(room)) return error(400, "请先记录本日天亮死亡");
    if (hasCurrentExileRecord(room)) return error(400, "本日放逐结果已经记录");
    if (room.activeDaySkillWindow?.status === "OPEN" || room.pendingExileResult || room.orderPrinceRevotePending) return error(400, "请先完成白天技能窗口与投票流程");
    const noExile = Boolean(body.noExile);
    const seat = Number(body.seat || 0);
    if (!noExile && (seat < 1 || seat > 12)) return error(400, "放逐座位不合法");
    if (room.boardId === "realm_of_trickery") {
      const actualSeat = noExile ? 0 : mapExileSeat(room, seat);
      if (!noExile && (![seat, actualSeat].every((value) => room.assignments.some((item) => item.seat === value && item.alive !== false)))) return error(400, "投票号码及换号后的目标必须存活");
      const record = { day: room.night, round: 1, exiledSeat: seat, noExile, counts: {}, topSeats: seat ? [seat] : [], source: "DIRECT_EXILE", createdAt: Date.now() };
      const firstRoundPending = !room.orderPrinceUsed && !(room.dayVoteRecord?.day === room.night && room.dayVoteRecord.round === 1 && room.dayVoteRecord.pkSeats?.length > 1);
      if (firstRoundPending) {
        room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
        const princeSeat = room.assignments.find((item) => item.roleId === "order_prince" && item.alive !== false)?.seat || 0;
        openDaySkillWindow(room, { id: `order-prince-rewind-${room.night}`, day: room.night, trigger: "AFTER_FIRST_DAY_VOTE", kind: "ORDER_PRINCE_REWIND", eligibleSeats: princeSeat ? [princeSeat] : [], action: "ACTIVATE_OR_DECLINE", resume: "DAY_VOTE_OR_EXILE", metadata: { rawExiledSeat: seat, tied: false } });
        writeLog(room, "DAY_VOTE_PENDING", record);
      } else {
        room.dayVoteRecord = record;
        finalizeDayVote(room, record, "DIRECT_EXILE");
      }
      await saveRoom(env, room);
      return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (!noExile) {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (!assignment || assignment.alive === false) return error(400, "放逐目标必须是存活玩家");
      if (isDarkDestruction(room) && darkBindingTarget(room, room.night) === seat) return error(400, "被禁锢玩家本日不能被放逐");
      assignment.alive = false;
      if (assignment.roleId === "idiot") assignment.publiclyRevealed = true;
      if (shouldStartTreasureMaskedFinalNight(room, assignment)) {
        room.treasureMaskedFinalNight = { seat, triggerDay: room.night, status: "PENDING", createdAt: Date.now() };
        writeLog(room, "TREASURE_MASK_FINAL_NIGHT_PENDING", room.treasureMaskedFinalNight);
      } else {
        queueDarkDeathResolution(room, [seat], "EXILE");
      }
    }
    const record = { day: room.night, seat: noExile ? 0 : seat, noExile, createdAt: Date.now() };
    room.exileRecords.push(record);
    if (room.mode === "SYSTEM") room.systemDayOutcomeRecordedDay = room.night;
    writeLog(room, "EXILE_CONFIRMED", record);
    if (room.mode === "SYSTEM") {
      const assignment = seat ? room.assignments.find((item) => item.seat === seat) : null;
      const revealText = assignment?.roleId === "idiot" ? "，翻牌为白神" : "";
      addPublicAnnouncement(room, noExile ? "白天无人出局。" : `${seat}号玩家出局${revealText}。`);
    }
    maybeCompleteSystemGame(room);
  } else if (route.action === "sheriff-badge") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以处理警徽");
    const mode = body.mode;
    const seat = Number(body.seat || 0);
    if (mode === "destroy") {
      room.sheriffBadge = { holderSeat: 0, lost: true };
      room.assignments.forEach((assignment) => { assignment.sheriff = false; });
      writeLog(room, "SHERIFF_BADGE_DESTROYED", {});
    } else if (mode === "transfer") {
      if (seat < 1 || seat > 12) return error(400, "移交座位不合法");
      room.sheriffBadge = { holderSeat: seat, lost: false };
      room.assignments.forEach((assignment) => { assignment.sheriff = assignment.seat === seat; });
      writeLog(room, "SHERIFF_BADGE_TRANSFERRED", { seat });
    } else {
      return error(400, "警徽处理方式不合法");
    }
  } else if (route.action === "game-end") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以结束游戏");
    room.phase = "GAME_OVER";
    writeLog(room, "GAME_ENDED", {});
  } else if (route.action === "game-result") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以记录游戏结果");
    const result = body.result;
    if (!["GOOD_WIN", "WOLF_WIN", "SKIP"].includes(result)) return error(400, "无效的结果类型");
    if (room.gameResultRecord) return error(400, "本局结果已经记录");
    await ensureGameResultsTable(env);
    const createdAt = Date.now();
    const id = `${room.id}-${randomHex(12)}`;
    room.gameResultRecord = { id, result, createdAt };
    persistenceEffects.gameResult = {
      id,
      boardId: room.boardId,
      roomId: room.id,
      result,
      data: JSON.stringify((room.assignments || []).map((a) => ({ seat: a.seat, roleId: a.roleId, camp: a.camp, alive: a.alive }))),
      createdAt
    };
  } else {
    return error(404, "接口不存在");
  }

  await saveRoom(env, room, persistenceEffects);
  return json({ room: sanitizeRoom(room, { clientId, judgeToken }), privateResult });
}

export async function onRequest(context) {
  try {
    const { request, env } = context;
    if (!env.DB) return error(500, "缺少 D1 数据库绑定 DB");
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      return await handleCreateRoom(request, env);
    }
    const route = parseRoute(url);
    if (!route || !route.roomId) return error(404, "接口不存在");
    // Retry only storage CAS conflicts. The fresh attempt still validates the
    // client's business revision, or the clock's exact window/step key.
    const retryBody = request.method === "POST" ? await readBody(request.clone()) : {};
    const mayRetry = retryBody.expectedRevision !== undefined || route.action === "reveal"
      || ["system-fixed-night", "system-day-voice"].includes(route.action);
    for (let attempt = 0; ; attempt += 1) {
      try { return await handleRoomAction(request.clone(), env, route); }
      catch (err) {
        if (!(err instanceof RoomConflictError) || !mayRetry || attempt >= 3) throw err;
      }
    }
  } catch (err) {
    if (err instanceof RoomConflictError) return error(409, err.message);
    return error(500, err && err.message ? err.message : "服务器错误");
  }
}
