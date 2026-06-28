import balancedDeal from "../../../web/balanced-deal.js";
import nightResolution from "../../../web/night-resolution.js";

const { createBalancedDeal } = balancedDeal;
const { calculateNightResolution, getDeathSkillResolution, getGameOutcome } = nightResolution;

const DEFAULT_RULES = {
  winCondition: "KILL_SIDE",
  sheriffEnabled: true,
  lastWordsEnabled: true,
  nightDeathLastWords: false,
  witchCanSelfSaveFirstNight: false,
  witchAntidoteCount: 1,
  witchPoisonCount: 1,
  guardCanRepeatTarget: false,
  wolvesCanNoKill: true,
  seerCanSkipCheck: false,
  spiritMediumCanSkipCheck: false,
  tieRule: "PK_THEN_NO_OUT_ON_SECOND_TIE"
};

const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

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
        godCardPoolExcludes: ["masked_man"],
        allowMaskedManInTreasureCards: false,
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
  if (!antidoteAvailable && !poisonAvailable) return null;
  return { id: "witch_action", actor: "witch", label: "女巫行动", targetCount: 0, allowSkip: false, antidoteAvailable, poisonAvailable, singlePotionPerNight: room && ["realm_of_trickery", "dawn_voyage"].includes(room.boardId) };
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
  if (step.actor === "wolf_team") {
    const extraMembers = room.boardId === "realm_of_trickery" ? ["trickster"] : room.boardId === "dawn_voyage" ? ["siren"] : [];
    return assignments.some((assignment) => assignment.alive !== false && ["wolf", "wolf_king", ...extraMembers].includes(assignment.roleId));
  }
  return assignments.some((assignment) => assignment.alive !== false && assignment.roleId === step.actor);
}

function createNightSteps(boardId, night, room = null) {
  const firstNight = night === 1;
  const steps = [];
  if (boardId === "pre_witch_hunter_idiot_mixed") {
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
    steps.push(
      { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
    );
    if (witchStep) steps.push(witchStep);
    if (!firstNight) {
      const skillStep = mechanicalSkillStep(room, night);
      if (skillStep) steps.push(skillStep);
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
    if (magicianSeats.length >= 2) steps.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 2, allowSkip: true, allowedSeats: magicianSeats });
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
  return steps.filter((step) => shouldIncludeNightStep(room, step)).map((step, index) => ({ ...step, index }));
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
    await env.DB.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId).run();
    return null;
  }
  return JSON.parse(row.data);
}

async function saveRoom(env, room) {
  const now = Date.now();
  room.createdAt = room.createdAt || now;
  room.updatedAt = now;
  const data = JSON.stringify(room);
  await env.DB.prepare(
    "INSERT INTO rooms (id, data, created_at, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(room.id, data, room.createdAt, now).run();
}

async function cleanupExpiredRooms(env) {
  await env.DB.prepare("DELETE FROM rooms WHERE updated_at < ?").bind(Date.now() - ROOM_TTL_MS).run();
  await ensureDealHistoryTable(env);
  await env.DB.prepare("DELETE FROM deal_histories WHERE updated_at < ?").bind(Date.now() - 90 * 24 * 60 * 60 * 1000).run();
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
  const row = await env.DB.prepare("SELECT data FROM deal_histories WHERE profile_id = ?").bind(profileId).first();
  if (!row) return [];
  try {
    const history = JSON.parse(row.data);
    return Array.isArray(history) ? history.slice(-10) : [];
  } catch (error) {
    return [];
  }
}

async function saveDealHistory(env, profileId, history) {
  await ensureDealHistoryTable(env);
  await env.DB.prepare(
    "INSERT INTO deal_histories (profile_id, data, updated_at) VALUES (?, ?, ?) " +
    "ON CONFLICT(profile_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
  ).bind(profileId, JSON.stringify(history.slice(-10)), Date.now()).run();
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

function isController(room, token) {
  return Boolean(token && token === room.judgeToken);
}

function getWolfTeamRoleIds(boardId) {
  if (boardId === "realm_of_trickery") return ["wolf", "trickster"];
  if (boardId === "dawn_voyage") return ["wolf", "siren"];
  if (boardId === "treasure_master") return ["wolf", "wolf_king"];
  return ["wolf"];
}

function canAssignmentAct(room, step, assignment) {
  if (!step || !assignment || assignment.alive === false) return false;
  if (step.actor === "wolf_team") return getWolfTeamRoleIds(room.boardId).includes(assignment.roleId);
  return step.actor === assignment.roleId;
}

function getSystemNightAccess(room, clientId, controller) {
  if (room.mode !== "SYSTEM" || room.phase !== "NIGHT") return null;
  const stepIndex = room.currentNightStepIndex || 0;
  const step = room.currentNightSteps?.[stepIndex] || null;
  const seat = room.seats.find((item) => item.clientId === clientId);
  const assignment = seat ? room.assignments.find((item) => item.seat === seat.seat) : null;
  const canAct = canAssignmentAct(room, step, assignment);
  const privateContext = {};
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
    canAct,
    stepIndex,
    stepCount: room.currentNightSteps?.length || 0,
    complete: !step,
    stepId: controller || canAct ? step?.id || "" : "",
    announcement: controller || canAct ? step?.label || "夜间行动已完成" : "夜间流程进行中",
    privateContext
  };
}

function buildPrivateNightResult(room, step, action) {
  const selectedSeat = Number(action?.targetSeats?.[0] || 0);
  if (!selectedSeat) return null;
  const actualSeat = step.id === "seer_check" && room.boardId === "realm_of_trickery"
    ? mapSeatWithPair(selectedSeat, getActiveSwapPair(room, "magician_swap", room.night))
    : selectedSeat;
  const assignment = (room.assignments || []).find((item) => item.seat === actualSeat);
  if (!assignment) return null;
  if (step.id === "seer_check") return { kind: "CAMP", seat: actualSeat, value: assignment.camp === "WOLF" ? "WOLF" : "GOOD" };
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

function sanitizeRoom(room, { clientId, judgeToken }) {
  const judge = isJudge(room, judgeToken);
  const controller = isController(room, judgeToken);
  const revealAll = room.phase === "GAME_OVER";
  const mySeat = room.seats.find((seat) => seat.clientId === clientId);
  const myAssignment = mySeat ? room.assignments.find((assignment) => assignment.seat === mySeat.seat) : null;
  const seats = room.seats.map((seat) => ({ ...seat, userId: seat.clientId }));
  const systemNight = getSystemNightAccess(room, clientId, controller);
  const activeStep = room.currentNightSteps?.[room.currentNightStepIndex || 0] || null;
  const systemSteps = systemNight && systemNight.canAct && activeStep ? [{ ...activeStep, index: 0 }] : [];
  const myDelayedDeath = myAssignment ? (room.pendingDelayedDeaths || []).find((item) => item.day === room.night && item.seat === myAssignment.seat) || null : null;
  const myDeathSkill = myAssignment ? (room.pendingDeathSkills || []).find((item) => item.day === room.night && item.seat === myAssignment.seat) || null : null;
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
    boardId: room.boardId,
    phase: room.phase,
    day: room.day,
    night: room.night,
    seats,
    aliveSeats: (room.assignments || []).filter((assignment) => assignment.alive !== false).map((assignment) => assignment.seat),
    logs: judge || revealAll ? room.logs : [],
    isJudge: judge,
    isController: controller,
    systemNight,
    systemDaybreakReady: room.mode === "SYSTEM" && controller && Boolean(room.pendingNightResolution),
    systemDayOutcomeRecorded: room.mode === "SYSTEM" && room.systemDayOutcomeRecordedDay === room.night,
    systemPendingTasks: room.mode === "SYSTEM" && controller ? {
      delayedDeaths: (room.pendingDelayedDeaths || []).filter((item) => item.day === room.night).length,
      deathSkills: (room.pendingDeathSkills || []).filter((item) => item.day === room.night).length
    } : null,
    myDelayedDeath: room.mode === "SYSTEM" ? myDelayedDeath : null,
    myDeathSkill: room.mode === "SYSTEM" ? myDeathSkill : null,
    latestPublicAnnouncement: (room.publicAnnouncements || []).at(-1) || null,
    gameOutcome: room.phase === "GAME_OVER" ? room.gameOutcome || null : null,
    mySeat: mySeat ? { ...mySeat, userId: mySeat.clientId } : null,
    assignments: judge || revealAll ? room.assignments : myAssignment ? [myAssignment] : [],
    nightActions: judge || revealAll ? room.nightActions : [],
    currentNightSteps: judge ? room.currentNightSteps : systemSteps,
    currentNightStepIndex: judge ? room.currentNightStepIndex : 0,
    sheriffCandidates: room.sheriffCandidates || [],
    sheriffWithdrawn: room.sheriffWithdrawn || [],
    sheriffElectionDone: Boolean(room.sheriffElectionDone),
    sheriffVoteRecord: room.sheriffVoteRecord || null,
    sheriffBadge: room.sheriffBadge || { holderSeat: 0, lost: false },
    dayVoteRecord: room.dayVoteRecord || null,
    dealBalanceMeta: judge ? room.dealBalanceMeta || null : null,
    pendingExileResult: judge ? room.pendingExileResult || null : null,
    orderPrinceUsed: Boolean(room.orderPrinceUsed),
    orderPrinceRevotePending: judge ? Boolean(room.orderPrinceRevotePending) : false,
    judgeCode: judge ? room.judgeCode : "",
    deathRecords: judge || revealAll ? room.deathRecords || [] : (room.deathRecords || []).map(({ reasons, ...record }) => record),
    pendingNightResolution: judge ? room.pendingNightResolution || null : null,
    pendingDelayedDeaths: judge ? room.pendingDelayedDeaths || [] : [],
    pendingDeathSkills: judge ? room.pendingDeathSkills || [] : [],
    deathSkillRecords: judge ? room.deathSkillRecords || [] : [],
    publicReveals: (room.assignments || []).filter((assignment) => assignment.revealed && assignment.roleId === "idiot").map((assignment) => ({ seat: assignment.seat, roleId: assignment.roleId })),
    exileRecords: room.exileRecords || [],
    windDirection: judge ? room.windDirection || "calm" : "",
    lastWindDirection: judge ? room.lastWindDirection || "calm" : "",
    announcedWindDirection: room.phase === "DAY" && room.captainAliveAtDawn ? room.windDirection || "calm" : "",
    boardedSeat: judge ? room.boardedSeat || 0 : 0,
    captainDiedLastDay: judge ? Boolean(room.captainDiedLastDay) : false,
    captainAliveAtDawn: judge ? Boolean(room.captainAliveAtDawn) : false
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
    if (!resolution) return;
    const record = { ...resolution, phase, resolved: !resolution.eligible, createdAt: Date.now() };
    room.deathSkillRecords.push(record);
    if (resolution.eligible && !room.pendingDeathSkills.some((item) => item.seat === seat && item.day === room.night)) {
      room.pendingDeathSkills.push(record);
    }
    writeLog(room, resolution.eligible ? "DEATH_SKILL_PENDING" : "DEATH_SKILL_BLOCKED", record);
  });
}

function maybeCompleteSystemGame(room) {
  if (room.mode !== "SYSTEM" || room.phase === "GAME_OVER" || room.pendingNightResolution) return null;
  if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) return null;
  if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return null;
  const result = getGameOutcome(room);
  if (!result) return null;
  room.phase = "GAME_OVER";
  room.gameOutcome = { result, day: room.night, automatic: true, createdAt: Date.now() };
  writeLog(room, "GAME_AUTO_COMPLETED", room.gameOutcome);
  const text = result === "GOOD_WIN" ? "游戏结束，好人阵营获胜。" : "游戏结束，狼人阵营获胜。";
  addPublicAnnouncement(room, text);
  return room.gameOutcome;
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
  if (!room || room.night !== 1) return true;
  if (room.sheriffElectionDone) return true;
  const record = room.sheriffVoteRecord;
  return Boolean(record && (record.electedSeat || record.badgeLost));
}

function getAliveSeats(room) {
  const aliveAssignments = (room.assignments || []).filter((assignment) => assignment.alive !== false);
  if (aliveAssignments.length) return aliveAssignments.map((assignment) => assignment.seat).sort((a, b) => a - b);
  return room.seats.map((seat) => seat.seat);
}

function calculateDayVote(room, body) {
  const round = Number(body.round || 1);
  const aliveSeats = getAliveSeats(room);
  const pkSeats = uniqueSeats(body.pkSeats, aliveSeats);
  const allowedTargets = round === 1 ? aliveSeats : pkSeats;
  const votes = Array.isArray(body.votes) ? body.votes : [];
  const counts = {};
  allowedTargets.forEach((seat) => { counts[seat] = 0; });
  votes.forEach((vote) => {
    const targetSeat = Number(vote.targetSeat);
    if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
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

function finalizeDayVote(room, record, source = "DAY_VOTE") {
  const rawExiledSeat = Number(record.exiledSeat || 0);
  const actualExiledSeat = rawExiledSeat ? mapExileSeat(room, rawExiledSeat, record.day) : 0;
  record.rawExiledSeat = rawExiledSeat;
  record.actualExiledSeat = actualExiledSeat;
  record.exiledSeat = actualExiledSeat;
  if (actualExiledSeat) {
    const assignment = room.assignments.find((item) => item.seat === actualExiledSeat);
    if (assignment) {
      assignment.alive = false;
      if (assignment.roleId === "idiot") assignment.revealed = true;
    }
    queueDeathSkills(room, [actualExiledSeat], "EXILE");
  }
  const exileRecord = { day: room.night, seat: actualExiledSeat, rawSeat: rawExiledSeat, noExile: record.noExile, source, createdAt: Date.now() };
  room.exileRecords.push(exileRecord);
  writeLog(room, "EXILE_CONFIRMED", exileRecord);
}

function validateNightAction(room, step, targetSeats, skipped, cardRoleId = "") {
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
    if (activeCard === "wolf" && !skipped && (room.assignments || []).some((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId))) return "仍有狼人同伴存活，盗宝狼人不能发动击杀";
  }
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
    boardId: body.boardId,
    phase: "WAITING",
    day: 0,
    night: 0,
    judgeClientId: body.clientId,
    balanceProfileId: body.balanceProfileId || body.clientId,
    judgeToken: randomHex(18),
    judgeCode: randomDigits(4),
    seats: createSeats(),
    assignments: [],
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
    deathRecords: [],
    pendingNightResolution: null,
    pendingDelayedDeaths: [],
    pendingDeathSkills: [],
    deathSkillRecords: [],
    publicAnnouncements: [],
    systemDayOutcomeRecordedDay: 0,
    exileRecords: [],
    windDirection: "calm",
    lastWindDirection: "calm",
    boardedSeat: 0,
    captainDiedLastDay: false,
    captainAliveAtDawn: true,
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
  const url = new URL(request.url);
  const body = await readBody(request);
  const clientId = body.clientId || url.searchParams.get("clientId") || "";
  const judgeToken = body.judgeToken || url.searchParams.get("judgeToken") || "";
  let privateResult = null;

  if (request.method === "GET" && !route.action) {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }
  if (request.method !== "POST") return error(405, "方法不支持");

  if (route.action === "join") {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }

  if (route.action === "judge-claim") {
    if (room.mode !== "JUDGE") return error(400, "无法官房间没有法官席");
    if (String(body.judgeCode || "") !== room.judgeCode) return error(403, "法官口令错误");
    return json({
      room: sanitizeRoom(room, { clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken
    });
  }

  if (route.action === "seat") {
    if (room.phase !== "WAITING") return error(400, "发牌后不能换座");
    if (isController(room, judgeToken)) return error(400, "控制设备不占玩家座位");
    const seatNumber = Number(body.seat);
    const target = room.seats.find((seat) => seat.seat === seatNumber);
    if (!target) return error(400, "座位不存在");
    if (target.occupied && target.clientId !== clientId) return error(400, "座位已被占用");
    room.seats.forEach((seat) => {
      if (seat.clientId === clientId) {
        seat.clientId = "";
        seat.userId = "";
        seat.nickname = "";
        seat.occupied = false;
      }
    });
    target.clientId = clientId;
    target.userId = clientId;
    target.nickname = body.nickname || `${seatNumber}号`;
    target.occupied = true;
    writeLog(room, "SEAT_SELECTED", { seat: seatNumber });
  } else if (route.action === "fill-test") {
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
    if (room.seats.some((seat) => !seat.occupied)) return error(400, "需要 12 人满座才能发牌");
    const seats = room.seats.map((seat) => seat.seat);
    const profileId = room.balanceProfileId || room.judgeClientId;
    const history = await loadDealHistory(env, profileId);
    const balanced = createBalancedDeal({
      boardId: room.boardId,
      history,
      randomInt: secureRandomInt,
      createCandidate: () => dealBoard(room.boardId, seats)
    });
    room.assignments = balanced.assignments;
    room.dealBalanceMeta = balanced.meta;
    await saveDealHistory(env, profileId, balanced.history);
    room.phase = "DEALT";
    writeLog(room, "DEALT", { boardId: room.boardId });
  } else if (route.action === "reveal") {
    const mySeat = room.seats.find((seat) => seat.clientId === clientId);
    const assignment = mySeat ? room.assignments.find((item) => item.seat === mySeat.seat) : null;
    if (assignment) {
      assignment.revealed = true;
      writeLog(room, "IDENTITY_VIEWED", { seat: assignment.seat });
    }
  } else if (route.action === "night-start") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以开始夜晚");
    if (room.phase !== "DEALT" && room.phase !== "DAY") return error(400, "当前阶段不能开始夜晚");
    if (room.pendingExileResult || room.orderPrinceRevotePending) return error(400, "请先完成定序王子的投票流程");
    if (room.mode === "SYSTEM" && room.phase === "DAY" && room.systemDayOutcomeRecordedDay !== room.night) return error(400, "请先记录本日最终出局结果");
    if (room.pendingNightResolution) return error(400, "请先确认天亮死亡名单");
    if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) return error(400, "请先处理蒙面人的延迟死亡");
    if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return error(400, "请先处理死亡技能");
    room.night += 1;
    room.phase = "NIGHT";
    room.lastWindDirection = room.windDirection || "calm";
    room.boardedSeat = 0;
    room.captainAliveAtDawn = (room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
    room.captainDiedLastDay = false;
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
    room.currentNightStepIndex = 0;
    room.pendingNightResolution = null;
    writeLog(room, "NIGHT_STARTED", { night: room.night });
  } else if (route.action === "night-action") {
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) return error(400, "夜间流程已完成");
    const seat = room.seats.find((item) => item.clientId === clientId);
    const assignment = seat ? room.assignments.find((item) => item.seat === seat.seat) : null;
    const canAct = isJudge(room, judgeToken) || (room.mode === "SYSTEM" && canAssignmentAct(room, step, assignment));
    if (!canAct) return error(403, "当前不是你的夜间行动步骤");
    const targetSeats = uniqueSeats(body.targetSeats);
    const skipped = Boolean(body.skipped);
    let cardRoleId = body.cardRoleId || "";
    if (step.id === "treasure_skill") cardRoleId = currentTreasureCard(room);
    if (step.id === "siren_wind") {
      const wind = body.windDirection;
      if (!["calm", "tailwind", "headwind"].includes(wind)) return error(400, "风向不合法");
      if (room.night > 1 && wind === room.lastWindDirection) return error(400, "不可连续两晚选择相同风向");
      room.lastWindDirection = room.windDirection || "calm";
      room.windDirection = wind;
      room.nightActions.push({
        night: room.night, stepId: step.id, label: step.label,
        targetSeats: [], skipped: false, cardRoleId: "", windDirection: wind, createdAt: Date.now()
      });
      writeLog(room, "NIGHT_ACTION", { stepId: step.id, windDirection: wind });
      room.currentNightStepIndex += 1;
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
      if (antidoteUsed && room.night === 1 && antidoteTargetSeat === witchSeat) return error(400, "女巫首夜不能自救");
      const requestedPoisonSeat = Number(body.poisonTargetSeat || 0);
      const poisonTargetSeat = step.poisonAvailable && requestedPoisonSeat >= 1 && requestedPoisonSeat <= 12 ? requestedPoisonSeat : 0;
      if (requestedPoisonSeat && !poisonTargetSeat) return error(400, "毒药目标不合法或毒药已经使用");
      if (poisonTargetSeat && !(room.assignments || []).some((item) => item.seat === poisonTargetSeat && item.alive !== false)) return error(400, "毒药只能选择存活玩家");
      if (step.singlePotionPerNight && antidoteUsed && poisonTargetSeat) return error(400, "本版型中，女巫同一晚不能同时使用解药和毒药");
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
      writeLog(room, "NIGHT_ACTION", record);
      room.currentNightStepIndex += 1;
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
      createdAt: Date.now()
    };
    privateResult = room.mode === "SYSTEM" ? buildPrivateNightResult(room, step, record) : null;
    room.nightActions.push(record);
    if (step.id === "captain_board" && targetSeats.length) {
      room.boardedSeat = targetSeats[0];
    }
    refreshSwapConflict(room, room.night);
    writeLog(room, "NIGHT_ACTION", record);
    room.currentNightStepIndex += 1;
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
    refreshSwapConflict(room, room.night);
    room.currentNightStepIndex = Math.max(0, (room.currentNightStepIndex || 0) - 1);
    writeLog(room, "NIGHT_ACTION_UNDONE", { stepId: removed.stepId, label: removed.label, night: removed.night });
  } else if (route.action === "night-finish") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以结束夜晚");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    if ((room.currentNightStepIndex || 0) < (room.currentNightSteps || []).length) return error(400, "仍有夜间身份尚未行动");
    room.phase = "DAY";
    room.pendingNightResolution = calculateNightResolution(room, room.night);
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
    const record = { day: room.night, phase: "DAYBREAK", seats, reasons, createdAt: Date.now() };
    room.deathRecords.push(record);
    queueDeathSkills(room, seats, "DAYBREAK", reasons);
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
    const announcement = seats.length ? `天亮了，昨夜${seats.map((seat) => `${seat}号`).join("、")}死亡。` : "天亮了，昨夜是平安夜。";
    addPublicAnnouncement(room, announcement);
    maybeCompleteSystemGame(room);
    await saveRoom(env, room);
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }), announcement });
  } else if (route.action === "sheriff-candidates") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录上警");
    if (room.phase !== "DAY" || room.night !== 1) return error(400, "上警应在第一夜结束后的第一天白天记录");
    const seats = uniqueSeats(body.seats);
    room.sheriffCandidates = seats;
    room.sheriffWithdrawn = (room.sheriffWithdrawn || []).filter((seat) => seats.includes(seat));
    room.sheriffElectionDone = seats.length === 0;
    room.sheriffVoteRecord = null;
    if (!seats.length) room.sheriffBadge = { holderSeat: 0, lost: true };
    writeLog(room, "SHERIFF_CANDIDATES_CONFIRMED", { seats });
  } else if (route.action === "sheriff-withdraw") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录退水");
    if (room.phase !== "DAY" || room.night !== 1) return error(400, "退水应在第一天警上阶段记录");
    const seats = uniqueSeats(body.seats, room.sheriffCandidates || []);
    room.sheriffWithdrawn = seats;
    const activeCandidates = (room.sheriffCandidates || []).filter((seat) => !room.sheriffWithdrawn.includes(seat));
    if ((room.sheriffCandidates || []).length && !activeCandidates.length) {
      room.sheriffElectionDone = true;
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_WITHDRAW_CONFIRMED", { seats });
  } else if (route.action === "sheriff-self-withdraw") {
    if (room.phase !== "DAY" || room.night !== 1) return error(400, "退水应在第一天警上阶段记录");
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录警徽投票");
    if (room.phase !== "DAY" || room.night !== 1) return error(400, "警徽投票应在第一天警上阶段记录");
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
    const round = Number(body.round || 1);
    const allowedTargets = round === 1 ? activeCandidates : uniqueSeats(body.pkSeats, activeCandidates);
    const allowedVoters = room.seats
      .map((seat) => seat.seat)
      .filter((seat) => round === 1 ? !candidates.includes(seat) : !activeCandidates.includes(seat));
    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    const votes = Array.isArray(body.votes) ? body.votes : [];
    const validVotes = votes.filter((vote) => allowedVoters.includes(Number(vote.voterSeat)));
    validVotes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
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
    if (!isSheriffElectionFinished(room)) return error(400, "第一天死亡结果应在警长竞选结束后公布");
    const seats = uniqueSeats(body.seats);
    seats.forEach((seat) => {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) assignment.alive = false;
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
    const delayedDeaths = (room.pendingNightResolution?.delayedDeaths || []).map((item) => ({
      ...item,
      day: room.night
    }));
    room.pendingDelayedDeaths = [
      ...(room.pendingDelayedDeaths || []).filter((item) => item.day !== room.night),
      ...delayedDeaths
    ];
    room.pendingNightResolution = null;
    const record = { day: room.night, phase: "DAYBREAK", seats, reasons, createdAt: Date.now() };
    room.deathRecords.push(record);
    queueDeathSkills(room, seats, "DAYBREAK", reasons);
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
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
    const record = {
      day: room.night,
      phase: "DELAYED",
      seats: [seat],
      reasons: { [String(seat)]: ["蒙面延迟死亡"] },
      createdAt: Date.now()
    };
    room.deathRecords.push(record);
    writeLog(room, "DELAYED_DEATH_CONFIRMED", record);
    if (room.mode === "SYSTEM") addPublicAnnouncement(room, `${seat}号玩家死亡。`);
    maybeCompleteSystemGame(room);
  } else if (route.action === "death-skill") {
    const ownSeat = room.seats.find((item) => item.clientId === clientId)?.seat || 0;
    if (!isJudge(room, judgeToken) && !(room.mode === "SYSTEM" && ownSeat === Number(body.seat || 0))) return error(403, "只有本人可以处理死亡技能");
    if (room.phase !== "DAY") return error(400, "当前阶段不能处理死亡技能");
    const seat = Number(body.seat || 0);
    const targetSeat = Number(body.targetSeat || 0);
    const pending = (room.pendingDeathSkills || []).find((item) => item.day === room.night && item.seat === seat);
    if (!pending) return error(400, "没有该玩家待处理的死亡技能");
    if (targetSeat === seat) return error(400, "不能选择自己作为开枪目标");
    if (targetSeat) {
      const targetAssignment = room.assignments.find((item) => item.seat === targetSeat);
      if (!targetAssignment || targetAssignment.alive === false) return error(400, "开枪目标必须是存活玩家");
      targetAssignment.alive = false;
      room.deathRecords.push({ day: room.night, phase: "SHOT", seats: [targetSeat], reasons: { [String(targetSeat)]: [`${seat}号死亡技能`] }, createdAt: Date.now() });
    }
    room.pendingDeathSkills = (room.pendingDeathSkills || []).filter((item) => !(item.day === room.night && item.seat === seat));
    const record = [...(room.deathSkillRecords || [])].reverse().find((item) => item.day === room.night && item.seat === seat && !item.resolved);
    if (record) Object.assign(record, { resolved: true, targetSeat, skipped: !targetSeat, resolvedAt: Date.now() });
    writeLog(room, "DEATH_SKILL_RESOLVED", { seat, targetSeat, skipped: !targetSeat });
    if (room.mode === "SYSTEM" && targetSeat) addPublicAnnouncement(room, `${seat}号玩家发动技能，${targetSeat}号玩家死亡。`);
    maybeCompleteSystemGame(room);
  } else if (route.action === "day-vote") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录放逐投票");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐投票");
    if (room.pendingExileResult) return error(400, "请先处理定序王子的发动时机");
    if (Boolean(body.orderPrinceRevote) !== Boolean(room.orderPrinceRevotePending)) return error(400, "当前投票轮次与定序王子状态不一致");
    const record = calculateDayVote(room, body);
    room.dayVoteRecord = record;
    const princeRevote = Boolean(body.orderPrinceRevote);
    if (room.boardId === "realm_of_trickery" && record.round === 1 && !room.orderPrinceUsed && !princeRevote) {
      room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以处理定序王子技能");
    if (room.boardId !== "realm_of_trickery" || !room.pendingExileResult) return error(400, "当前没有待处理的定序王子时机");
    const pending = room.pendingExileResult;
    if (route.action === "order-prince-activate") {
      if (room.orderPrinceUsed) return error(400, "定序王子已经发动过技能");
      room.orderPrinceUsed = true;
      room.orderPrinceRevotePending = true;
      room.pendingExileResult = null;
      room.dayVoteRecord = null;
      writeLog(room, "ORDER_PRINCE_ACTIVATED", { day: room.night });
    } else {
      const record = pending.record || pending;
      room.pendingExileResult = null;
      room.dayVoteRecord = record;
      if (record.exiledSeat || record.noExile) finalizeDayVote(room, record);
      writeLog(room, "ORDER_PRINCE_DECLINED", { day: room.night });
    }
  } else if (route.action === "exile-record") {
    if (!isController(room, judgeToken)) return error(403, "只有控制设备可以记录放逐");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐");
    if (room.pendingExileResult || room.orderPrinceRevotePending) return error(400, "请先完成定序王子的投票流程");
    const noExile = Boolean(body.noExile);
    const seat = Number(body.seat || 0);
    if (!noExile && (seat < 1 || seat > 12)) return error(400, "放逐座位不合法");
    if (!noExile) {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) {
        assignment.alive = false;
        if (assignment.roleId === "idiot") assignment.revealed = true;
      }
      queueDeathSkills(room, [seat], "EXILE");
    }
    const record = { day: room.night, seat: noExile ? 0 : seat, noExile, createdAt: Date.now() };
    room.exileRecords.push(record);
    if (room.mode === "SYSTEM") room.systemDayOutcomeRecordedDay = room.night;
    writeLog(room, "EXILE_CONFIRMED", record);
    if (room.mode === "SYSTEM") {
      const assignment = seat ? room.assignments.find((item) => item.seat === seat) : null;
      const revealText = assignment?.roleId === "idiot" ? `，身份为白痴` : "";
      addPublicAnnouncement(room, noExile ? "白天无人出局。" : `${seat}号玩家被放逐出局${revealText}。`);
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
    await ensureGameResultsTable(env);
    await env.DB.prepare(
      "INSERT INTO game_results (id, board_id, room_id, result, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    ).bind(
      `${room.id}-${Date.now()}`,
      room.boardId,
      room.id,
      result,
      JSON.stringify((room.assignments || []).map((a) => ({ seat: a.seat, roleId: a.roleId, camp: a.camp, alive: a.alive }))),
      Date.now()
    ).run();
  } else {
    return error(404, "接口不存在");
  }

  await saveRoom(env, room);
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
    return await handleRoomAction(request, env, route);
  } catch (err) {
    return error(500, err && err.message ? err.message : "服务器错误");
  }
}
