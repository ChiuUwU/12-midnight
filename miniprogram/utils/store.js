const STORAGE_KEY = "twelve_midnight_state_v1";

function createSeats() {
  return Array.from({ length: 12 }, (_, index) => ({
    seat: index + 1,
    userId: "",
    nickname: "",
    occupied: false
  }));
}

function createInitialState() {
  return {
    currentUserId: "local-user",
    currentRoomId: "",
    rooms: {}
  };
}

function loadState() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || createInitialState();
  } catch (error) {
    return createInitialState();
  }
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state);
}

function createRoom({ mode, boardId }) {
  const roomId = `${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    id: roomId,
    name: "十二点天黑",
    mode,
    boardId,
    phase: "WAITING",
    day: 0,
    night: 0,
    judgeUserId: "local-user",
    seats: createSeats(),
    assignments: [],
    logs: []
  };
}

function getCurrentRoom(state) {
  if (!state.currentRoomId) return null;
  return state.rooms[state.currentRoomId] || null;
}

function writeLog(room, type, payload) {
  room.logs.push({
    id: `${Date.now()}-${room.logs.length}`,
    type,
    payload,
    createdAt: Date.now()
  });
}

module.exports = {
  createInitialState,
  loadState,
  saveState,
  createRoom,
  getCurrentRoom,
  writeLog
};
