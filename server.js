const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { dealBoard } = require("./miniprogram/utils/deal");
const { createBalancedDeal } = require("./web/balanced-deal");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";
const WEB_ROOT = path.join(__dirname, "web");
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const rooms = new Map();
const dealHistories = new Map();

function createSeats() {
  return Array.from({ length: 12 }, (_, index) => ({
    seat: index + 1,
    clientId: "",
    nickname: "",
    occupied: false
  }));
}

function createRoomId() {
  cleanupExpiredRooms();
  let id = "";
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(id));
  return id;
}

function createJudgeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function writeLog(room, type, payload) {
  room.updatedAt = Date.now();
  room.logs.push({
    id: `${Date.now()}-${room.logs.length}`,
    type,
    payload,
    createdAt: Date.now()
  });
}

function isRoomExpired(room) {
  return Boolean(room && Date.now() - Number(room.updatedAt || room.createdAt || 0) > ROOM_TTL_MS);
}

function cleanupExpiredRooms() {
  rooms.forEach((room, roomId) => {
    if (isRoomExpired(room)) rooms.delete(roomId);
  });
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
  return { id: "witch_action", actor: "witch", label: "女巫行动", targetCount: 0, allowSkip: false, antidoteAvailable, poisonAvailable, singlePotionPerNight: room && room.boardId === "realm_of_trickery" };
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

function createNightSteps(boardId, night, room = null) {
  const firstNight = night === 1;
  const common = [];
  if (boardId === "pre_witch_hunter_idiot_mixed") {
    if (firstNight) common.push({ id: "mixed_blood_model", actor: "mixed_blood", label: "混血儿选择榜样", targetCount: 1, allowSkip: false });
    const witchStep = createWitchStep(room);
    common.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) common.push(witchStep);
    common.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
  } else if (boardId === "masquerade") {
    const witchStep = createWitchStep(room);
    common.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) common.push(witchStep);
    common.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    if (!firstNight) {
      const availableDanceSeats = getAvailableDanceSeats(room);
      if (availableDanceSeats.length >= 3) {
        common.push({ id: "dancer_dance", actor: "dancer", label: "舞者选择三名共舞玩家", targetCount: 3, allowSkip: false, allowedSeats: availableDanceSeats });
      }
      common.push(
        { id: "mask_check", actor: "mask", label: "假面验证是否在舞池", targetCount: 1, allowSkip: false },
        { id: "mask_give", actor: "mask", label: "假面给予面具", targetCount: 1, allowSkip: false }
      );
    }
  } else if (boardId === "treasure_master") {
    common.push(
      { id: "treasure_pick", actor: "treasure_master", label: "盗宝大师选择今晚使用的盗宝牌", targetCount: 0, allowSkip: false, needsCard: true },
      { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false }
    );
    if (!firstNight) common.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    common.push(
      { id: "poisoner_poison", actor: "poisoner", label: "毒师选择是否毒人", targetCount: 1, allowSkip: true },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
  } else if (boardId === "mechanical_wolf_spirit_medium") {
    const witchStep = createWitchStep(room);
    common.push(
      { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
      { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
    );
    if (witchStep) common.push(witchStep);
    common.push(
      { id: "mechanical_mimic", actor: "mechanical_wolf", label: "机械狼选择模仿目标", targetCount: 1, allowSkip: false },
      { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
    );
  } else if (boardId === "realm_of_trickery") {
    const tricksterSeats = getAvailableSwapSeats(room, "trickster_swap");
    const magicianSeats = getAvailableSwapSeats(room, "magician_swap");
    const witchStep = createWitchStep(room);
    if (tricksterSeats.length >= 2) common.push({ id: "trickster_swap", actor: "trickster", label: "诡术师交换两个号码", targetCount: 2, allowSkip: !didSkipPreviousNight(room, "trickster_swap", night), allowedSeats: tricksterSeats });
    if (magicianSeats.length >= 2) common.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 2, allowSkip: true, allowedSeats: magicianSeats });
    common.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
    if (witchStep) common.push(witchStep);
    common.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
  }
  return common.map((step, index) => ({ ...step, index }));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("请求体过大"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 格式错误"));
      }
    });
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  sendJson(response, status, { error: message });
}

function isJudge(room, token) {
  return Boolean(token && token === room.judgeToken);
}

function sanitizeRoom(room, { clientId, judgeToken }) {
  const judge = isJudge(room, judgeToken);
  const mySeat = room.seats.find((seat) => seat.clientId === clientId);
  const myAssignment = mySeat
    ? room.assignments.find((assignment) => assignment.seat === mySeat.seat)
    : null;
  const seats = room.seats.map((seat) => ({
    ...seat,
    userId: seat.clientId
  }));

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
    dealBalanceMeta: judge ? room.dealBalanceMeta || null : null,
    pendingExileResult: judge ? room.pendingExileResult || null : null,
    orderPrinceUsed: Boolean(room.orderPrinceUsed),
    orderPrinceRevotePending: judge ? Boolean(room.orderPrinceRevotePending) : false,
    judgeCode: judge ? room.judgeCode : "",
    deathRecords: room.deathRecords || [],
    exileRecords: room.exileRecords || []
  };
}

function getAliveSeats(room) {
  const aliveAssignments = (room.assignments || []).filter((assignment) => assignment.alive !== false);
  if (aliveAssignments.length) return aliveAssignments.map((assignment) => assignment.seat).sort((a, b) => a - b);
  return room.seats.map((seat) => seat.seat);
}

function isSheriffElectionFinished(room) {
  if (!room || room.night !== 1) return true;
  if (room.sheriffElectionDone) return true;
  const record = room.sheriffVoteRecord;
  return Boolean(record && (record.electedSeat || record.badgeLost));
}

function calculateDayVote(room, body) {
  const round = Number(body.round || 1);
  const aliveSeats = getAliveSeats(room);
  const pkSeats = Array.isArray(body.pkSeats)
    ? body.pkSeats.map(Number).filter((seat) => aliveSeats.includes(seat))
    : [];
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
    if (assignment) assignment.alive = false;
  }
  const exileRecord = { day: room.night, seat: actualExiledSeat, rawSeat: rawExiledSeat, noExile: record.noExile, source, createdAt: Date.now() };
  room.exileRecords.push(exileRecord);
  writeLog(room, "EXILE_CONFIRMED", exileRecord);
}

function validateNightAction(room, step, targetSeats, skipped) {
  if (skipped) return "";
  if (Array.isArray(step.allowedSeats) && targetSeats.some((seat) => !step.allowedSeats.includes(seat))) {
    return "所选玩家不符合当前技能的可选范围";
  }
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

function getRoomFromPath(urlPath) {
  const match = urlPath.match(/^\/api\/rooms\/(\d{6})(?:\/([^/]+))?$/);
  if (!match) return null;
  const room = rooms.get(match[1]);
  if (isRoomExpired(room)) {
    rooms.delete(match[1]);
    return {
      roomId: match[1],
      action: match[2] || "",
      room: null
    };
  }
  return {
    roomId: match[1],
    action: match[2] || "",
    room
  };
}

async function handleApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readBody(request);
    if (!body.clientId) return sendError(response, 400, "缺少 clientId");
    if (!body.boardId) return sendError(response, 400, "缺少 boardId");

    const room = {
      id: createRoomId(),
      name: "十二点天黑",
      mode: body.mode === "SYSTEM" ? "SYSTEM" : "JUDGE",
      boardId: body.boardId,
      phase: "WAITING",
      day: 0,
      night: 0,
      judgeClientId: body.clientId,
      balanceProfileId: body.balanceProfileId || body.clientId,
      judgeToken: crypto.randomBytes(18).toString("hex"),
      judgeCode: createJudgeCode(),
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
      exileRecords: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    rooms.set(room.id, room);
    writeLog(room, "ROOM_CREATED", { mode: room.mode, boardId: room.boardId });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId: body.clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken
    });
  }

  const target = getRoomFromPath(url.pathname);
  if (!target) return sendError(response, 404, "接口不存在");
  if (!target.room) return sendError(response, 404, "房间不存在");

  const room = target.room;

  if (request.method === "GET" && !target.action) {
    const clientId = url.searchParams.get("clientId") || "";
    const judgeToken = url.searchParams.get("judgeToken") || "";
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (request.method !== "POST") return sendError(response, 405, "方法不支持");

  const body = await readBody(request);
  const clientId = body.clientId || "";
  const judgeToken = body.judgeToken || "";

  if (target.action === "join") {
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "judge-claim") {
    if (String(body.judgeCode || "") !== room.judgeCode) {
      return sendError(response, 403, "法官口令错误");
    }
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken: room.judgeToken }),
      judgeToken: room.judgeToken
    });
  }

  if (target.action === "seat") {
    if (room.phase !== "WAITING") return sendError(response, 400, "发牌后不能换座");
    const seatNumber = Number(body.seat);
    const targetSeat = room.seats.find((seat) => seat.seat === seatNumber);
    if (!targetSeat) return sendError(response, 400, "座位不存在");
    if (targetSeat.occupied && targetSeat.clientId !== clientId) {
      return sendError(response, 400, "座位已被占用");
    }
    room.seats.forEach((seat) => {
      if (seat.clientId === clientId) {
        seat.clientId = "";
        seat.nickname = "";
        seat.occupied = false;
      }
    });
    targetSeat.clientId = clientId;
    targetSeat.nickname = body.nickname || `${seatNumber}号`;
    targetSeat.occupied = true;
    writeLog(room, "SEAT_SELECTED", { seat: seatNumber });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "fill-test") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以补齐测试座位");
    if (room.phase !== "WAITING") return sendError(response, 400, "发牌后不能补座");
    room.seats.forEach((seat) => {
      if (!seat.occupied) {
        seat.clientId = `test-${seat.seat}`;
        seat.nickname = `${seat.seat}号`;
        seat.occupied = true;
      }
    });
    writeLog(room, "TEST_SEATS_FILLED", {});
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "deal") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以发牌");
    if (room.phase !== "WAITING") return sendError(response, 400, "已经发过牌");
    if (room.seats.some((seat) => !seat.occupied)) return sendError(response, 400, "需要 12 人满座才能发牌");
    const seats = room.seats.map((seat) => seat.seat);
    const profileId = room.balanceProfileId || room.judgeClientId;
    const balanced = createBalancedDeal({
      boardId: room.boardId,
      history: dealHistories.get(profileId) || [],
      randomInt: (maximum) => crypto.randomInt(maximum),
      createCandidate: () => dealBoard(room.boardId, seats)
    });
    room.assignments = balanced.assignments;
    room.dealBalanceMeta = balanced.meta;
    dealHistories.set(profileId, balanced.history);
    room.phase = "DEALT";
    writeLog(room, "DEALT", { boardId: room.boardId });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "sheriff-candidates") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录上警");
    if (room.phase !== "DAY" || room.night !== 1) {
      return sendError(response, 400, "上警应在第一夜结束后的第一天白天记录");
    }
    const seats = Array.isArray(body.seats)
      ? [...new Set(body.seats.map(Number).filter((seat) => seat >= 1 && seat <= 12))].sort((a, b) => a - b)
      : [];
    room.sheriffCandidates = seats;
    room.sheriffWithdrawn = (room.sheriffWithdrawn || []).filter((seat) => seats.includes(seat));
    room.sheriffElectionDone = seats.length === 0;
    room.sheriffVoteRecord = null;
    if (!seats.length) room.sheriffBadge = { holderSeat: 0, lost: true };
    writeLog(room, "SHERIFF_CANDIDATES_CONFIRMED", { seats });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "sheriff-withdraw") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录退水");
    if (room.phase !== "DAY" || room.night !== 1) {
      return sendError(response, 400, "退水应在第一天警上阶段记录");
    }
    const candidates = room.sheriffCandidates || [];
    const seats = Array.isArray(body.seats)
      ? [...new Set(body.seats.map(Number).filter((seat) => candidates.includes(seat)))].sort((a, b) => a - b)
      : [];
    room.sheriffWithdrawn = seats;
    const activeCandidates = candidates.filter((seat) => !room.sheriffWithdrawn.includes(seat));
    if (candidates.length && !activeCandidates.length) {
      room.sheriffElectionDone = true;
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_WITHDRAW_CONFIRMED", { seats });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "sheriff-self-withdraw") {
    if (room.phase !== "DAY" || room.night !== 1) {
      return sendError(response, 400, "退水应在第一天警上阶段记录");
    }
    const mySeat = room.seats.find((seat) => seat.clientId === clientId);
    if (!mySeat) return sendError(response, 400, "请先选择座位");
    const candidates = room.sheriffCandidates || [];
    if (!candidates.includes(mySeat.seat)) return sendError(response, 400, "只有上警玩家可以退水");
    const withdrawn = new Set(room.sheriffWithdrawn || []);
    withdrawn.add(mySeat.seat);
    room.sheriffWithdrawn = [...withdrawn].filter((seat) => candidates.includes(seat)).sort((a, b) => a - b);
    const activeCandidates = candidates.filter((seat) => !room.sheriffWithdrawn.includes(seat));
    if (candidates.length && !activeCandidates.length) {
      room.sheriffElectionDone = true;
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_SELF_WITHDRAWN", { seat: mySeat.seat });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "sheriff-vote") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录警徽投票");
    if (room.phase !== "DAY" || room.night !== 1) {
      return sendError(response, 400, "警徽投票应在第一天警上阶段记录");
    }
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
    const votes = Array.isArray(body.votes) ? body.votes : [];
    const round = Number(body.round || 1);
    const allowedTargets = round === 1
      ? activeCandidates
      : Array.isArray(body.pkSeats) ? body.pkSeats.map(Number).filter((seat) => activeCandidates.includes(seat)) : [];
    const allowedVoters = room.seats
      .map((seat) => seat.seat)
      .filter((seat) => round === 1 ? !candidates.includes(seat) : !activeCandidates.includes(seat));

    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    const validVotes = votes.filter((vote) => allowedVoters.includes(Number(vote.voterSeat)));
    validVotes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      if (allowedTargets.includes(targetSeat)) {
        counts[targetSeat] += 1;
      }
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
      room.assignments.forEach((assignment) => {
        assignment.sheriff = assignment.seat === electedSeat;
      });
    } else if (badgeLost) {
      room.sheriffBadge = { holderSeat: 0, lost: true };
    }
    writeLog(room, "SHERIFF_VOTE_CONFIRMED", record);
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "death-record") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录死亡");
    if (room.phase !== "DAY") return sendError(response, 400, "当前阶段不能记录天亮死亡");
    if (!isSheriffElectionFinished(room)) return sendError(response, 400, "第一天死亡结果应在警长竞选结束后公布");
    const seats = Array.isArray(body.seats)
      ? [...new Set(body.seats.map(Number).filter((seat) => seat >= 1 && seat <= 12))].sort((a, b) => a - b)
      : [];
    seats.forEach((seat) => {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) assignment.alive = false;
    });
    const record = {
      day: room.night,
      phase: "DAYBREAK",
      seats,
      createdAt: Date.now()
    };
    room.deathRecords.push(record);
    writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "day-vote") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录放逐投票");
    if (room.phase !== "DAY") return sendError(response, 400, "当前阶段不能记录放逐投票");
    if (room.pendingExileResult) return sendError(response, 400, "请先处理定序王子的发动时机");
    if (Boolean(body.orderPrinceRevote) !== Boolean(room.orderPrinceRevotePending)) return sendError(response, 400, "当前投票轮次与定序王子状态不一致");
    const record = calculateDayVote(room, body);
    room.dayVoteRecord = record;
    const princeRevote = Boolean(body.orderPrinceRevote);
    if (room.boardId === "realm_of_trickery" && record.round === 1 && !room.orderPrinceUsed && !princeRevote) {
      room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
      writeLog(room, "DAY_VOTE_PENDING", record);
      return sendJson(response, 200, { room: sanitizeRoom(room, { clientId, judgeToken }) });
    }
    if (princeRevote) room.orderPrinceRevotePending = false;
    if (record.exiledSeat || record.noExile) {
      finalizeDayVote(room, record, princeRevote ? "ORDER_PRINCE_REVOTE" : "DAY_VOTE");
    }
    writeLog(room, "DAY_VOTE_CONFIRMED", record);
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "exile-record") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录放逐");
    if (room.phase !== "DAY") return sendError(response, 400, "当前阶段不能记录放逐");
    if (room.pendingExileResult || room.orderPrinceRevotePending) return sendError(response, 400, "请先完成定序王子的投票流程");
    const seat = Number(body.seat || 0);
    const noExile = Boolean(body.noExile);
    if (!noExile && (seat < 1 || seat > 12)) return sendError(response, 400, "放逐座位不合法");
    if (!noExile) {
      const assignment = room.assignments.find((item) => item.seat === seat);
      if (assignment) assignment.alive = false;
    }
    const record = {
      day: room.night,
      seat: noExile ? 0 : seat,
      noExile,
      createdAt: Date.now()
    };
    room.exileRecords.push(record);
    writeLog(room, "EXILE_CONFIRMED", record);
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "sheriff-badge") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以处理警徽");
    const mode = body.mode;
    const seat = Number(body.seat || 0);
    if (mode === "destroy") {
      room.sheriffBadge = { holderSeat: 0, lost: true };
      room.assignments.forEach((assignment) => { assignment.sheriff = false; });
      writeLog(room, "SHERIFF_BADGE_DESTROYED", {});
    } else if (mode === "transfer") {
      if (seat < 1 || seat > 12) return sendError(response, 400, "移交座位不合法");
      room.sheriffBadge = { holderSeat: seat, lost: false };
      room.assignments.forEach((assignment) => {
        assignment.sheriff = assignment.seat === seat;
      });
      writeLog(room, "SHERIFF_BADGE_TRANSFERRED", { seat });
    } else {
      return sendError(response, 400, "警徽处理方式不合法");
    }
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "night-start") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以开始夜晚");
    if (room.phase !== "DEALT" && room.phase !== "DAY") return sendError(response, 400, "当前阶段不能开始夜晚");
    if (room.pendingExileResult || room.orderPrinceRevotePending) return sendError(response, 400, "请先完成定序王子的投票流程");
    room.night += 1;
    room.phase = "NIGHT";
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
    room.currentNightStepIndex = 0;
    writeLog(room, "NIGHT_STARTED", { night: room.night });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "night-action") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以记录夜间行动");
    if (room.phase !== "NIGHT") return sendError(response, 400, "当前不在夜晚阶段");
    const step = room.currentNightSteps[room.currentNightStepIndex];
    if (!step) return sendError(response, 400, "夜间流程已完成");
    const targetSeats = Array.isArray(body.targetSeats) ? [...new Set(body.targetSeats.map(Number).filter(Boolean))] : [];
    const skipped = Boolean(body.skipped);
    const cardRoleId = body.cardRoleId || "";

    if (step.id === "witch_action") {
      const antidoteUsed = Boolean(body.antidoteUsed) && step.antidoteAvailable;
      const wolfAction = [...room.nightActions].reverse().find((action) => action.night === room.night && action.stepId === "wolves_kill" && !action.skipped);
      const antidoteTargetSeat = antidoteUsed && wolfAction && wolfAction.targetSeats ? Number(wolfAction.targetSeats[0]) : 0;
      if (antidoteUsed && !antidoteTargetSeat) return sendError(response, 400, "今晚无人被击杀，不能使用解药");
      const requestedPoisonSeat = Number(body.poisonTargetSeat || 0);
      const poisonTargetSeat = step.poisonAvailable && requestedPoisonSeat >= 1 && requestedPoisonSeat <= 12 ? requestedPoisonSeat : 0;
      if (requestedPoisonSeat && !poisonTargetSeat) return sendError(response, 400, "毒药目标不合法或毒药已经使用");
      if (step.singlePotionPerNight && antidoteUsed && poisonTargetSeat) return sendError(response, 400, "诡术之境中，女巫同一晚不能同时使用解药和毒药");
      const actionRecord = {
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
      room.nightActions.push(actionRecord);
      writeLog(room, "NIGHT_ACTION", actionRecord);
      room.currentNightStepIndex += 1;
      return sendJson(response, 200, { room: sanitizeRoom(room, { clientId, judgeToken }) });
    }

    if (!skipped && !step.needsCard && targetSeats.length !== step.targetCount) {
      return sendError(response, 400, `需要选择 ${step.targetCount} 个目标`);
    }
    if (skipped && !step.allowSkip) {
      return sendError(response, 400, "这个步骤不能跳过");
    }
    if (step.needsCard && !cardRoleId) {
      return sendError(response, 400, "需要选择一张盗宝牌");
    }
    const ruleError = validateNightAction(room, step, targetSeats, skipped);
    if (ruleError) return sendError(response, 400, ruleError);

    const actionRecord = {
      night: room.night,
      stepId: step.id,
      label: step.label,
      targetSeats,
      skipped,
      cardRoleId,
      createdAt: Date.now()
    };
    room.nightActions.push(actionRecord);
    refreshSwapConflict(room, room.night);
    writeLog(room, "NIGHT_ACTION", actionRecord);
    room.currentNightStepIndex += 1;
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "order-prince-activate" || target.action === "order-prince-decline") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以处理定序王子技能");
    if (room.boardId !== "realm_of_trickery" || !room.pendingExileResult) return sendError(response, 400, "当前没有待处理的定序王子时机");
    const pending = room.pendingExileResult;
    if (target.action === "order-prince-activate") {
      if (room.orderPrinceUsed) return sendError(response, 400, "定序王子已经发动过技能");
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
    return sendJson(response, 200, { room: sanitizeRoom(room, { clientId, judgeToken }) });
  }

  if (target.action === "night-undo") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以撤回夜间行动");
    if (room.phase !== "NIGHT") return sendError(response, 400, "当前不在夜晚阶段");
    const index = [...room.nightActions].map((action, actionIndex) => ({ action, actionIndex }))
      .reverse()
      .find((item) => item.action.night === room.night);
    if (!index) return sendError(response, 400, "没有可撤回的夜间行动");
    const [removed] = room.nightActions.splice(index.actionIndex, 1);
    refreshSwapConflict(room, room.night);
    room.currentNightStepIndex = Math.max(0, (room.currentNightStepIndex || 0) - 1);
    writeLog(room, "NIGHT_ACTION_UNDONE", { stepId: removed.stepId, label: removed.label, night: removed.night });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "night-finish") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以结束夜晚");
    if (room.phase !== "NIGHT") return sendError(response, 400, "当前不在夜晚阶段");
    room.phase = "DAY";
    writeLog(room, "NIGHT_FINISHED", { night: room.night });
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "game-end") {
    if (!isJudge(room, judgeToken)) return sendError(response, 403, "只有房主可以结束游戏");
    room.phase = "GAME_OVER";
    writeLog(room, "GAME_ENDED", {});
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  if (target.action === "reveal") {
    const mySeat = room.seats.find((seat) => seat.clientId === clientId);
    const assignment = mySeat
      ? room.assignments.find((item) => item.seat === mySeat.seat)
      : null;
    if (assignment) {
      assignment.revealed = true;
      writeLog(room, "IDENTITY_VIEWED", { seat: assignment.seat });
    }
    return sendJson(response, 200, {
      room: sanitizeRoom(room, { clientId, judgeToken })
    });
  }

  return sendError(response, 404, "接口不存在");
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function serveStatic(request, response, url) {
  let relativePath = decodeURIComponent(url.pathname);
  if (relativePath === "/") {
    relativePath = "index.html";
  } else {
    relativePath = path.posix.normalize(relativePath).replace(/^\/+/, "");
  }
  if (relativePath.startsWith("..")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const filePath = path.join(WEB_ROOT, relativePath);
  if (!filePath.startsWith(WEB_ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-cache"
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url).catch((error) => {
      sendError(response, 500, error.message || "服务器错误");
    });
    return;
  }
  serveStatic(request, response, url);
});

server.listen(PORT, HOST, () => {
  console.log(`十二点天黑联机版已启动: http://localhost:${PORT}`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .forEach((item) => {
      console.log(`同 Wi-Fi 手机访问: http://${item.address}:${PORT}`);
    });
});
