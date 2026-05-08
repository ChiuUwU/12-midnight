const app = getApp();

Page({
  data: {
    roomId: ""
  },

  onRoomInput(event) {
    this.setData({ roomId: event.detail.value.trim() });
  },

  joinRoom() {
    const state = app.globalData.state;
    const room = state.rooms[this.data.roomId];
    if (!room) {
      wx.showToast({ title: "房间不存在", icon: "none" });
      return;
    }

    state.currentRoomId = room.id;
    app.save();
    wx.redirectTo({ url: "/pages/room/room" });
  }
});
