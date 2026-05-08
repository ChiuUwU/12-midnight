const { createInitialState, loadState, saveState } = require("./utils/store");

App({
  globalData: {
    state: createInitialState()
  },

  onLaunch() {
    this.globalData.state = loadState();
  },

  save() {
    saveState(this.globalData.state);
  },

  reset() {
    this.globalData.state = createInitialState();
    this.save();
  }
});
