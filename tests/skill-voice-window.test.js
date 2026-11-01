const test = require("node:test");
const assert = require("node:assert/strict");
const voice = require("../web/skill-voice-window.js");

test("a skill never times out before the announcement and complete five-second countdown", () => {
  const window = voice.create("window-1", "DEATH", 3, 1000);
  assert.equal(voice.canExpire(window), false);
  assert.equal(voice.countdownFinished(window, "window-1", 1, 100000), false);
  assert.equal(voice.announceFinished(window, "window-1", 1, 3000), true);
  assert.equal(window.deadlineAt, 8000);
  assert.equal(voice.countdownFinished(window, "window-1", 1, 7999), false);
  assert.equal(voice.canExpire(window), false);
  assert.equal(voice.countdownFinished(window, "window-1", 1, 8000), true);
  assert.equal(voice.canExpire(window), true);
});

test("retry pauses the window and prevents stale audio callbacks from skipping it", () => {
  const window = voice.create("window-2", "ARCHANGEL", 5, 0);
  assert.equal(voice.announceFinished(window, "window-2", 1, 100), true);
  assert.equal(voice.retry(window, "window-2", 1), true);
  assert.equal(window.deadlineAt, 0);
  assert.equal(voice.countdownFinished(window, "window-2", 1, 100000), false);
  assert.equal(voice.announceFinished(window, "different-window", 2, 100000), false);
  assert.equal(voice.announceFinished(window, "window-2", 2, 200000), true);
  assert.equal(voice.countdownFinished(window, "window-2", 2, 205000), true);
});
