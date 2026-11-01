(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SkillVoiceWindow = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // A server-authoritative gate: a deadline alone is never enough to skip a skill.
  // Playback completion must be acknowledged for the same window and attempt.
  function create(id, kind, seat, now = Date.now()) {
    if (!id || !kind) throw new Error("技能播报窗口缺少标识或类型");
    return { id, kind, seat: Number(seat || 0), attempt: 1, phase: "ANNOUNCING", createdAt: now, deadlineAt: 0 };
  }

  function matches(window, id, attempt) {
    return Boolean(window && window.id === id && window.attempt === Number(attempt));
  }

  function announceFinished(window, id, attempt, now = Date.now()) {
    if (!matches(window, id, attempt) || window.phase !== "ANNOUNCING") return false;
    window.phase = "COUNTING";
    window.deadlineAt = now + 5000;
    return true;
  }

  function countdownFinished(window, id, attempt, now = Date.now()) {
    if (!matches(window, id, attempt) || window.phase !== "COUNTING" || now < window.deadlineAt) return false;
    window.phase = "COMPLETE";
    return true;
  }

  function retry(window, id, attempt) {
    if (!matches(window, id, attempt) || window.phase === "COMPLETE") return false;
    window.attempt += 1;
    window.phase = "ANNOUNCING";
    window.deadlineAt = 0;
    return true;
  }

  function canExpire(window) {
    return Boolean(window && window.phase === "COMPLETE");
  }

  return { create, announceFinished, countdownFinished, retry, canExpire };
});
