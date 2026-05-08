const app = getApp();
const { getBoard } = require("../../data/boards");
const { getRole, getCampName } = require("../../data/roles");
const { getCurrentRoom } = require("../../utils/store");

Page({
  data: {
    room: null,
    board: null,
    players: [],
    logs: []
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
        campName: getCampName(assignment.camp)
      };
    });
    const logs = room.logs.map((log) => ({
      ...log,
      text: JSON.stringify(log.payload || {})
    }));

    this.setData({ room, board, players, logs });
  }
});
