const app = getApp();

Page({
  data: {
    hasRoom: false
  },

  onShow() {
    this.setData({
      hasRoom: Boolean(app.globalData.state.currentRoomId)
    });
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create-room/create-room" });
  },

  goJoin() {
    wx.navigateTo({ url: "/pages/join-room/join-room" });
  },

  continueRoom() {
    wx.navigateTo({ url: "/pages/room/room" });
  }
});
