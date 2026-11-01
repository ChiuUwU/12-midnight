const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../web/fixed-night-flow');
function room(id = 'wolves_kill') { return { mode: 'SYSTEM', fixedNightFlow: 1, boardId: 'pre_witch_hunter_idiot_mixed', night: 1, currentNightSteps: [{id, actor: id === 'wolves_kill' ? 'wolf_team' : 'mixed_blood'}], currentNightStepIndex: 0, nightActions: [], assignments: [{roleId:'mixed_blood', alive:true}] }; }
test('voice acknowledgement and full wolf window gate advancement', () => {
  const r = room(); flow.start(r, 0); const key = r.fixedNightTiming.key;
  assert.equal(flow.actionable(r, 100), false);
  assert.throws(() => flow.control(r, 'advance', key, 999999));
  flow.control(r, 'ack', key, 1000);
  r.fixedNightTiming.leaseUntil=0;
  assert.throws(() => flow.control(r, 'ack', key, 2000));
  r.nightActions.push({night:1, stepId:'wolves_kill',targetSeats:[2]}); r.currentNightStepIndex++;
  flow.submitted(r); flow.control(r, 'extend', key, 3000); flow.control(r, 'extend', key, 4000);
  assert.throws(() => flow.control(r, 'extend', key, 5000));
  assert.throws(() => flow.control(r, 'advance', key, 160999));
  flow.control(r, 'advance', key, 161000); assert.equal(r.fixedNightTiming.phase, 'FINAL');
  assert.throws(() => flow.control(r, 'advance', key, 170999));
  flow.control(r, 'advance', key, 171000); assert.equal(r.currentNightStepIndex, 1);
});
test('mandatory first-night selection waits while dead roles time out and stale keys fail', () => {
  const r = room('mixed_blood_model'); flow.start(r, 0); const key = r.fixedNightTiming.key;
  flow.control(r, 'ack', key, 0);
  r.fixedNightTiming.leaseUntil=0;
  flow.control(r, 'advance', key, 60000); assert.equal(r.fixedNightTiming.phase, 'REQUIRED');
  assert.equal(flow.actionable(r, 70000),true);
  assert.throws(() => flow.control(r, 'advance', 'old', 60000));
  r.assignments[0].alive=false; flow.control(r, 'advance', key, 60000);
  assert.equal(r.nightActions[0].skipped,true);
});
test('disconnect freezes remaining time and resume invalidates old callbacks', () => {
  const r=room(); flow.start(r,0); const first=r.fixedNightTiming.key;
  flow.control(r,'ack',first,1000);
  assert.equal(flow.actionable(r,12000),false);
  assert.equal(r.fixedNightTiming.phase,'PAUSED');
  assert.equal(r.fixedNightTiming.remainingMs,110000);
  flow.control(r,'resume',first,50000);
  assert.notEqual(r.fixedNightTiming.key,first);
  assert.equal(r.fixedNightTiming.deadlineAt,160000);
  assert.throws(()=>flow.control(r,'advance',first,200000));
});
