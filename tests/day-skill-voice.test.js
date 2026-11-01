const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../web/day-skill-voice');
test('day skill waits for voice then full countdown and rejects stale windows', () => {
  const room = {mode:'SYSTEM',fixedNightFlow:1,phase:'DAY',night:1,pendingDeathSkills:[{seat:2,day:1,createdAt:100}]};
  const first = voice.view(room);
  assert.equal(voice.deadline(room),0);
  assert.throws(()=>voice.control(room,'finish',first.key,10000));
  voice.control(room,'ack',first.key,10000);
  room.daySkillVoice.leaseUntil=0;
  assert.equal(voice.deadline(room),0);
  assert.throws(()=>voice.control(room,'finish',first.key,14999));
  voice.control(room,'finish',first.key,15000);
  assert.equal(voice.deadline(room),15000);
  room.pendingDeathSkills=[{seat:3,day:1,createdAt:200}];
  assert.notEqual(voice.view(room).key,first.key);
  assert.throws(()=>voice.control(room,'ack',first.key,16000));
});
test('prince precedes death skills and early activation cancels the old window', () => {
  const room = {mode:'SYSTEM',fixedNightFlow:1,phase:'DAY',night:1,activeDaySkillWindow:{id:'prince-1',status:'OPEN'},pendingDeathSkills:[{seat:2,day:1,createdAt:100}]};
  const first = voice.view(room);
  assert.equal(first.kind,'ORDER_PRINCE');
  room.activeDaySkillWindow=null;
  assert.equal(voice.view(room).kind,'DEATH_SKILL');
  assert.throws(()=>voice.control(room,'ack',first.key));
});
