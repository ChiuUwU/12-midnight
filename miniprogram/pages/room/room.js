const app = getApp();
const { getBoard } = require("../../data/boards");
const { dealBoard } = require("../../utils/deal");
const { getCurrentRoom, writeLog } = require("../../utils/store");

function getPhaseName(phase) {
  return {
    WAITING: "等待发牌",
    DEALT: "已发牌"
  }[phase] || phase;
}

Page({
  data: {
    room: null,
    board: null,
    seats: [],
    occupiedCount: 0,
    mySeatText: "未选择",
    modeName: "",
    phaseName: "",
    canDeal: false
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const state = app.globalData.state;
    const room = getCurrentRoom(state);
    if (!room) {
      wx.redirectTo({ url: "/pages/home/home" });
      return;
    }

    const board = getBoard(room.boardId);
    const mySeat = room.seats.find((seat) => seat.userId === state.currentUserId);
    const occupiedCount = room.seats.filter((seat) => seat.occupied).length;
    const seats = room.seats.map((seat) => ({
      ...seat,
      className: seat.userId === state.currentUserId ? "active" : seat.occupied ? "taken" : ""
    }));

    this.setData({
      room,
      board,
      seats,
      occupiedCount,
      mySeatText: mySeat ? `${mySeat.seat}号` : "未选择",
      modeName: room.mode === "JUDGE" ? "有法官" : "无法官",
      phaseName: getPhaseName(room.phase),
      canDeal: room.phase === "WAITING" && occupiedCount === board.playerCount
    });
  },

  chooseSeat(event) {
    const seatNumber = Number(event.currentTarget.dataset.seat);
    const state = app.globalData.state;
    const room = getCurrentRoom(state);

    if (room.phase !== "WAITING") {
      wx.showToast({ title: "发牌后不能换座", icon: "none" });
      return;
    }

    const target = room.seats.find((seat) => seat.seat === seatNumber);
    if (target.occupied && target.userId !== state.currentUserId) {
      wx.showToast({ title: "座位已被占用", icon: "none" });
      return;
    }

    room.seats.forEach((seat) => {
      if (seat.userId === state.currentUserId) {
        seat.userId = "";
        seat.nickname = "";
        seat.occupied = false;
      }
    });

    target.userId = state.currentUserId;
    target.nickname = "我";
    target.occupied = true;
    writeLog(room, "SEAT_SELECTED", { seat: seatNumber });
    app.save();
    this.refresh();
  },

  fillTestSeats() {
    const state = app.globalData.state;
    const room = getCurrentRoom(state);
    room.seats.forEach((seat) => {
      if (!seat.occupied) {
        seat.userId = `test-${seat.seat}`;
        seat.nickname = `${seat.seat}号`;
        seat.occupied = true;
      }
    });
    writeLog(room, "TEST_SEATS_FILLED", {});
    app.save();
    this.refresh();
  },

  deal() {
    const state = app.globalData.state;
    const room = getCurrentRoom(state);
    const seats = room.seats.map((seat) => seat.seat);

    try {
      room.assignments = dealBoard(room.boardId, seats);
      room.phase = "DEALT";
      writeLog(room, "DEALT", { boardId: room.boardId });
      app.save();
      this.refresh();
      wx.showToast({ title: "发牌完成", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },

  goIdentity() {
    wx.navigateTo({ url: "/pages/identity/identity" });
  },

  goJudge() {
    wx.navigateTo({ url: "/pages/judge/judge" });
  },

  goReview() {
    wx.navigateTo({ url: "/pages/review/review" });
  },

  resetRoom() {
    app.reset();
    wx.redirectTo({ url: "/pages/home/home" });
  }
});
