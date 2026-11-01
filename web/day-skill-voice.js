(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DaySkillVoice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function pause(gate, now) {
    if (gate.phase === 'PAUSED') return;
    gate.resumePhase=gate.phase; gate.remainingMs=Math.max(0,(gate.deadlineAt || now)-now); gate.phase='PAUSED'; gate.leaseUntil=0;
  }
  function enabled(room) { return room?.mode === 'SYSTEM' && room.fixedNightFlow === 1; }
  function ensure(room, now = Date.now()) {
    if (!enabled(room) || room.phase !== 'DAY') return null;
    const pending = room.activeDaySkillWindow?.status === 'OPEN' ? room.activeDaySkillWindow : room.pendingArchangelRevival || (room.pendingDeathSkills || []).find(p => p.day === room.night);
    if (!pending) { room.daySkillVoice = null; return null; }
    const kind = pending === room.activeDaySkillWindow ? 'ORDER_PRINCE' : pending === room.pendingArchangelRevival ? 'ARCHANGEL' : 'DEATH_SKILL';
    const source = `${kind}:${room.night}:${pending.id || pending.seat || ''}:${pending.createdAt || ''}`;
    if (room.daySkillVoice?.source !== source) {
      room.daySkillVoiceSequence = (room.daySkillVoiceSequence || 0) + 1;
      room.daySkillVoice = { source, key: `${room.night}:${room.daySkillVoiceSequence}`, kind, phase: 'ANNOUNCEMENT', deadlineAt: 0 };
    }
    const gate=room.daySkillVoice;
    if(gate.phase==='COUNTING' && gate.leaseUntil && now>gate.leaseUntil) pause(gate,gate.leaseUntil);
    return gate;
  }
  function control(room, operation, key, now = Date.now()) {
    const gate = ensure(room, now);
    if (!gate || gate.key !== key) throw new Error('技能窗口已更新');
    if(operation==='pause') { pause(gate,now); return; }
    if(operation==='heartbeat') { if(gate.phase!=='PAUSED') gate.leaseUntil=now+10000; return; }
    if(operation==='resume') {
      if(gate.phase!=='PAUSED') throw new Error('当前流程未暂停');
      room.daySkillVoiceSequence+=1; gate.key=`${room.night}:${room.daySkillVoiceSequence}`;
      gate.phase=gate.resumePhase; gate.deadlineAt=now+gate.remainingMs; gate.leaseUntil=now+10000; return;
    }
    if (operation === 'ack' && gate.phase === 'ANNOUNCEMENT') { gate.phase = 'COUNTING'; gate.deadlineAt = now + 5000; gate.leaseUntil=now+10000; }
    else if (operation === 'finish' && gate.phase === 'COUNTING' && now >= gate.deadlineAt) gate.phase = 'COMPLETE';
    else throw new Error('播报或倒计时尚未完成');
  }
  function deadline(room) { const gate = ensure(room); return gate?.phase === 'COMPLETE' ? gate.deadlineAt : 0; }
  function view(room) { const gate = ensure(room); if (!gate) return null; const {source, ...publicGate} = gate; return publicGate; }
  return { enabled, ensure, control, deadline, view };
});
