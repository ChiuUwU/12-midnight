const test = require("node:test");
const assert = require("node:assert/strict");
const timing = require("../web/night-timing-policy.js");

test("ordinary action waits a full minute, mandatory action cannot be skipped", () => {
  const regular = timing.create("NORMAL", 1000);
  timing.submit(regular, 5, 2000);
  assert.equal(timing.status(regular, 60999), "WAITING");
  assert.equal(timing.status(regular, 61000), "COMPLETE");
  const mandatory = timing.create("NORMAL", 0, true);
  assert.equal(timing.status(mandatory, 60000), "WAITING_REQUIRED");
  timing.submit(mandatory, 3, 70000);
  assert.equal(timing.status(mandatory, 70000), "COMPLETE");
});

test("early wolf confirmation waits two minutes and changes do not reset final countdown", () => {
  const wolf = timing.create("WOLF", 0);
  timing.submit(wolf, 3, 30000);
  assert.equal(timing.status(wolf, 119999), "WAITING");
  assert.equal(timing.status(wolf, 120000), "FINAL_COUNTDOWN");
  timing.submit(wolf, 5, 129999);
  assert.equal(wolf.finalDeadlineAt, 130000);
  assert.equal(timing.status(wolf, 130000), "COMPLETE");
  assert.throws(() => timing.submit(wolf, 6, 130000));
});

test("wolf can extend twice for twenty seconds each or time out without a submission", () => {
  const wolf = timing.create("WOLF", 0);
  timing.extend(wolf, 119000);
  timing.extend(wolf, 139000);
  assert.throws(() => timing.extend(wolf, 140000));
  assert.equal(timing.status(wolf, 159999), "WAITING");
  assert.equal(timing.status(wolf, 160000), "AUTO_NO_KILL");
  const submitted = timing.create("WOLF", 0);
  timing.submit(submitted, 8, 30000);
  timing.extend(submitted, 119000);
  assert.equal(submitted.finalDeadlineAt, 150000);
});

test("non-finite clocks cannot grant extensions or complete a step", () => {
  const wolf = timing.create("WOLF", 0);
  assert.throws(() => timing.extend(wolf, NaN));
  assert.throws(() => timing.status(wolf, NaN));
  assert.equal(wolf.extensions, 0);
});
