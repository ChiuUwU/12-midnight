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
    const bytes = new Uint8Array(1);
    crypto.getRandomValues(bytes);
    const swapIndex = bytes[0] % (index + 1);
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
  const bytes = new Uint8Array(1);
  crypto.getRandomValues(bytes);
  const chosen = candidates[bytes[0] % candidates.length];
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

function createNightSteps(boardId, night, room = null) {
  const firstNight = night === 1;
  const steps = [];
  if (boardId === "pre_witch_hunter_idiot_mixed") {
    if (firstNight) steps.push({ id: "mixed_blood_model", actor: "mixed_blood", label: "混血儿选择榜样", targetCount: 1, allowSkip: false });
    steps.push(
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true },
      { id: "witch_antidote", actor: "witch", label: "女巫选择是否救人", targetCount: 1, allowSkip: true },
      { id: "witch_poison", actor: "witch", label: "女巫选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false }
    );
  } else if (boardId === "masquerade") {
    steps.push(
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true },
      { id: "witch_antidote", actor: "witch", label: "女巫选择是否救人", targetCount: 1, allowSkip: true },
      { id: "witch_poison", actor: "witch", label: "女巫选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false }
    );
    if (!firstNight) steps.push({ id: "dancer_dance", actor: "dancer", label: "舞者选择三名共舞玩家", targetCount: 3, allowSkip: false });
    steps.push(
      { id: "mask_check", actor: "mask", label: "假面验证是否在舞池", targetCount: 1, allowSkip: false },
      { id: "mask_give", actor: "mask", label: "假面给予面具", targetCount: 1, allowSkip: false }
    );
  } else if (boardId === "treasure_master") {
    steps.push(
      { id: "treasure_pick", actor: "treasure_master", label: "盗宝大师选择今晚使用的盗宝牌", targetCount: 0, allowSkip: false, needsCard: true },
      { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false }
    );
    if (!firstNight) steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    steps.push(
      { id: "poisoner_poison", actor: "poisoner", label: "毒师选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
  } else if (boardId === "mechanical_wolf_spirit_medium") {
    steps.push(
      { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true },
      { id: "witch_antidote", actor: "witch", label: "女巫选择是否救人", targetCount: 1, allowSkip: true },
      { id: "witch_poison", actor: "witch", label: "女巫选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "mechanical_mimic", actor: "mechanical_wolf", label: "机械狼选择模仿目标", targetCount: 1, allowSkip: false },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
  }
  return steps
    .filter((step) => !(step.id === "witch_antidote" && hasUsedNightStep(room, "witch_antidote")))
    .map((step, index) => ({ ...step, index }));
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
  return Boolean(token && token === room.judgeToken);
}

function sanitizeRoom(room, { clientId, judgeToken }) {
  const judge = isJudge(room, judgeToken);
  const mySeat = room.seats.find((seat) => seat.clientId === clientId);
  const myAssignment = mySeat ? room.assignments.find((assignment) => assignment.seat === mySeat.seat) : null;
  const seats = room.seats.map((seat) => ({ ...seat, userId: seat.clientId }));
  return {
    id: room.id,
    name: room.name,
    mode: room.mode,
    boardId: room.boardId,
    phase: room.phase,
    day: room.day,
    night: room.night,
    seats,
    logs: judge ? room.logs : [],
    isJudge: judge,
    mySeat: mySeat ? { ...mySeat, userId: mySeat.clientId } : null,
    assignments: judge ? room.assignments : myAssignment ? [myAssignment] : [],
    nightActions: judge ? room.nightActions : [],
    currentNightSteps: judge ? room.currentNightSteps : [],
    currentNightStepIndex: judge ? room.currentNightStepIndex : 0,
    sheriffCandidates: room.sheriffCandidates || [],
    sheriffWithdrawn: room.sheriffWithdrawn || [],
    sheriffElectionDone: Boolean(room.sheriffElectionDone),
    sheriffVoteRecord: room.sheriffVoteRecord || null,
    sheriffBadge: room.sheriffBadge || { holderSeat: 0, lost: false },
    dayVoteRecord: room.dayVoteRecord || null,
    judgeCode: judge ? room.judgeCode : "",
    deathRecords: room.deathRecords || [],
    exileRecords: room.exileRecords || []
  };
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

function validateNightAction(room, step, targetSeats, skipped) {
  if (skipped) return "";
  if (step.id === "guard_guard") {
    const lastGuard = [...(room.nightActions || [])]
      .reverse()
      .find((action) => action.stepId === "guard_guard" && action.night === room.night - 1 && !action.skipped);
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
    deathRecords: [],
    exileRecords: [],
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

  if (request.method === "GET" && !route.action) {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }
  if (request.method !== "POST") return error(405, "方法不支持");

  if (route.action === "join") {
    return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
  }

  if (route.action === "judge-claim") {
    if (String(body.judgeCode || "") !== room.judgeCode) return error(403, "法官口令错误");
    return json({
      room: sanitizeRoom(room, { clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken
    });
  }

  if (route.action === "seat") {
    if (room.phase !== "WAITING") return error(400, "发牌后不能换座");
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以补齐测试座位");
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以发牌");
    if (room.phase !== "WAITING") return error(400, "已经发过牌");
    if (room.seats.some((seat) => !seat.occupied)) return error(400, "需要 12 人满座才能发牌");
    room.assignments = dealBoard(room.boardId, room.seats.map((seat) => seat.seat));
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以开始夜晚");
    if (room.phase !== "DEALT" && room.phase !== "DAY") return error(400, "当前阶段不能开始夜晚");
    room.night += 1;
    room.phase = "NIGHT";
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
    room.currentNightStepIndex = 0;
    writeLog(room, "NIGHT_STARTED", { night: room.night });
  } else if (route.action === "night-action") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录夜间行动");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) return error(400, "夜间流程已完成");
    const targetSeats = uniqueSeats(body.targetSeats);
    const skipped = Boolean(body.skipped);
    const cardRoleId = body.cardRoleId || "";
    if (!skipped && !step.needsCard && targetSeats.length !== step.targetCount) return error(400, `需要选择 ${step.targetCount} 个目标`);
    if (skipped && !step.allowSkip) return error(400, "这个步骤不能跳过");
    if (step.needsCard && !cardRoleId) return error(400, "需要选择一张盗宝牌");
    const ruleError = validateNightAction(room, step, targetSeats, skipped);
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
    room.nightActions.push(record);
    writeLog(room, "NIGHT_ACTION", record);
    room.currentNightStepIndex += 1;
  } else if (route.action === "night-undo") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以撤回夜间行动");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    const index = [...room.nightActions].map((action, actionIndex) => ({ action, actionIndex }))
      .reverse()
      .find((item) => item.action.night === room.night);
    if (!index) return error(400, "没有可撤回的夜间行动");
    const [removed] = room.nightActions.splice(index.actionIndex, 1);
    room.currentNightStepIndex = Math.max(0, (room.currentNightStepIndex || 0) - 1);
    writeLog(room, "NIGHT_ACTION_UNDONE", { stepId: removed.stepId, label: removed.label, night: removed.night });
  } else if (route.action === "night-finish") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以结束夜晚");
    if (room.phase !== "NIGHT") return error(400, "当前不在夜晚阶段");
    room.phase = "DAY";
    writeLog(room, "NIGHT_FINISHED", { night: room.night });
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
    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    const votes = Array.isArray(body.votes) ? body.votes : [];
    votes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
    });
    const maxVotes = Math.max(0, ...Object.values(counts));
    const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
    const electedSeat = topSeats.length === 1 ? topSeats[0] : 0;
    const badgeLost = round === 2 && !electedSeat;
    const record = {
      round,
      votes,
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
    const record = { day: room.night, phase: "DAYBREAK", seats, createdAt: Date.now() };
    room.deathRecords.push(record);
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
  } else if (route.action === "day-vote") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录放逐投票");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐投票");
    const record = calculateDayVote(room, body);
    room.dayVoteRecord = record;
    if (record.exiledSeat || record.noExile) {
      if (record.exiledSeat) {
        const assignment = room.assignments.find((item) => item.seat === record.exiledSeat);
        if (assignment) assignment.alive = false;
      }
      const exileRecord = {
        day: room.night,
        seat: record.exiledSeat,
        noExile: record.noExile,
        source: "DAY_VOTE",
        createdAt: Date.now()
      };
      room.exileRecords.push(exileRecord);
      writeLog(room, "EXILE_CONFIRMED", exileRecord);
    }
    writeLog(room, "DAY_VOTE_CONFIRMED", record);
  } else if (route.action === "exile-record") {
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以记录放逐");
    if (room.phase !== "DAY") return error(400, "当前阶段不能记录放逐");
    const noExile = Boolean(body.noExile);
    const seat = Number(body.seat || 0);
    if (!noExile && (seat < 1 || seat > 12)) return error(400, "放逐座位不合法");
    if (!noExile) {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) assignment.alive = false;
    }
    const record = { day: room.night, seat: noExile ? 0 : seat, noExile, createdAt: Date.now() };
    room.exileRecords.push(record);
    writeLog(room, "EXILE_CONFIRMED", record);
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
    if (!isJudge(room, judgeToken)) return error(403, "只有房主可以结束游戏");
    room.phase = "GAME_OVER";
    writeLog(room, "GAME_ENDED", {});
  } else {
    return error(404, "接口不存在");
  }

  await saveRoom(env, room);
  return json({ room: sanitizeRoom(room, { clientId, judgeToken }) });
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
