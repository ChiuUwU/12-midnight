const app = getApp();
const { BOARDS } = require("../../data/boards");
const { createRoom, writeLog } = require("../../utils/store");

Page({
  data: {
    modeIndex: 0,
    modes: ["JUDGE", "SYSTEM"],
    modeNames: ["有法官", "无法官"],
    boardIndex: 0,
    boardNames: BOARDS.map((board) => board.name),
    currentBoard: BOARDS[0]
  },

  onModeChange(event) {
    this.setData({ modeIndex: Number(event.detail.value) });
  },

  onBoardChange(event) {
    const boardIndex = Number(event.detail.value);
    this.setData({
      boardIndex,
      currentBoard: BOARDS[boardIndex]
    });
  },

  createRoom() {
    const state = app.globalData.state;
    const room = createRoom({
      mode: this.data.modes[this.data.modeIndex],
      boardId: BOARDS[this.data.boardIndex].id
    });

    state.rooms[room.id] = room;
    state.currentRoomId = room.id;
    writeLog(room, "ROOM_CREATED", {
      mode: room.mode,
      boardId: room.boardId
    });
    app.save();

    wx.redirectTo({ url: "/pages/room/room" });
  }
});
