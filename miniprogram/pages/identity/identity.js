const app = getApp();
const { getRole, getCampName } = require("../../data/roles");
const { getCurrentRoom, writeLog } = require("../../utils/store");

Page({
  data: {
    assignment: null,
    role: null,
    campName: "",
    seat: 0,
    treasureCards: []
  },

  onShow() {
    const state = app.globalData.state;
    const room = getCurrentRoom(state);
    if (!room) return;

    const mySeat = room.seats.find((seat) => seat.userId === state.currentUserId);
    const assignment = mySeat
      ? room.assignments.find((item) => item.seat === mySeat.seat)
      : null;

    if (!assignment) {
      this.setData({ assignment: null });
      return;
    }

    const role = getRole(assignment.roleId);
    const treasureCards = (assignment.abilityState.treasureCards || []).map((roleId) => getRole(roleId));
    assignment.revealed = true;
    writeLog(room, "IDENTITY_VIEWED", { seat: assignment.seat });
    app.save();

    this.setData({
      assignment,
      role,
      seat: assignment.seat,
      campName: getCampName(assignment.camp),
      treasureCards
    });
  },

  backRoom() {
    wx.navigateBack();
  }
});
