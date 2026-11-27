(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NightTimingPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const NORMAL_MS = 60000;
  const WOLF_MS = 120000;
  const WOLF_EXTRA_MS = 20000;

  // Timing policy only: caller must validate authority, target and room revision.
  function create(kind, startedAt, required = false) {
    if (!["NORMAL", "WOLF"].includes(kind) || !Number.isFinite(startedAt)) throw new Error("无效的夜间计时配置");
    return { kind, startedAt, deadlineAt: startedAt + (kind === "WOLF" ? WOLF_MS : NORMAL_MS), required: Boolean(required), extensions: 0, submission: null, finalDeadlineAt: 0 };
  }

  function submit(state, value, now) {
    if (!Number.isFinite(now) || now < state.startedAt) throw new Error("无效的提交时间");
    if (state.kind === "NORMAL") {
      if (state.submission !== null) throw new Error("本步骤已提交");
      if (now >= state.deadlineAt && !state.required) throw new Error("本步骤已结束");
      state.submission = { value, at: now };
      return;
    }
    if (now >= state.deadlineAt) throw new Error("狼刀修改时间已结束");
    state.submission = { value, at: now };
  }

  function extend(state, now) {
    if (!Number.isFinite(now) || state.kind !== "WOLF" || state.extensions >= 2 || now >= state.deadlineAt || now < state.startedAt) throw new Error("当前不能加时");
    state.extensions += 1;
    state.deadlineAt += WOLF_EXTRA_MS;
  }

  function status(state, now) {
    if (!Number.isFinite(now) || now < state.startedAt) throw new Error("无效的查询时间");
    if (state.kind === "NORMAL") {
      if (now < state.deadlineAt) return "WAITING";
      return state.required && state.submission === null ? "WAITING_REQUIRED" : "COMPLETE";
    }
    return now >= state.deadlineAt ? (state.submission ? "COMPLETE" : "AUTO_NO_KILL") : "WAITING";
  }

  return { create, submit, extend, status };
});
