const app = getApp();
const { getBoard } = require("../../data/boards");
const { getRole, getCampName } = require("../../data/roles");
const { getCurrentRoom } = require("../../utils/store");

Page({
  data: {
    room: null,
    board: null,
    players: []
  },

  onShow() {
    const room = getCurrentRoom(app.globalData.state);
    if (!room) return;
    const board = getBoard(room.boardId);
    const players = room.assignments.map((assignment) => {
      const role = getRole(assignment.roleId);
      return {
        seat: assignment.seat,
        roleName: role.name,
        campName: getCampName(assignment.camp),
        aliveText: assignment.alive ? "存活" : "出局",
        revealedText: assignment.revealed ? "已看牌" : "未看牌"
      };
    });

    this.setData({ room, board, players });
  },

  goReview() {
    wx.navigateTo({ url: "/pages/review/review" });
  }
});
