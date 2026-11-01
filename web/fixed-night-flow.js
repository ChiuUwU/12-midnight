(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FixedNightFlow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const boards = ['pre_witch_hunter_idiot_mixed', 'realm_of_trickery', 'mechanical_wolf_spirit_medium'];
  function enabled(room) { return room?.mode === 'SYSTEM' && room.fixedNightFlow === 1 && boards.includes(room.boardId); }
  function step(room) { return room.currentNightSteps?.[room.currentNightStepIndex || 0]; }
  function settle(t, now) {
    if (t && t.leaseUntil && now > t.leaseUntil && ['ACTION','FINAL','COUNTING'].includes(t.phase)) pause(t, t.leaseUntil);
    return t;
  }
  function pause(t, now) {
    if (!t || t.phase === 'PAUSED') return;
    t.resumePhase = t.phase;
    t.remainingMs = Math.max(0, (t.deadlineAt || t.readyAt || now) - now);
    t.phase = 'PAUSED'; t.leaseUntil = 0;
  }
  function start(room, now = Date.now(), gap = 0) {
    if (!enabled(room)) return;
    room.fixedNightSequence = (room.fixedNightSequence || 0) + 1;
    room.fixedNightTiming = step(room) ? { key: `${room.night}:${room.fixedNightSequence}`, phase: gap ? 'GAP' : 'ANNOUNCEMENT', readyAt: now + gap, deadlineAt: 0, extensions: 0, submitted: false } : null;
  }
  function submitted(room) {
    if (!enabled(room)) return false;
    const timing = room.fixedNightTiming;
    room.currentNightStepIndex -= 1;
    timing.submitted = true;
    const current = step(room);
    const matching = room.nightActions.filter(a => a.night === room.night && a.stepId === current.id);
    if (matching.length > 1) {
      const latest = matching[matching.length - 1];
      room.nightActions = room.nightActions.filter(a => a.night !== room.night || a.stepId !== current.id || a === latest);
    }
    return true;
  }
  function actionable(room, now = Date.now()) {
    const t = settle(room.fixedNightTiming, now);
    return !!t && ['ACTION', 'FINAL', 'REQUIRED'].includes(t.phase) && (now < t.deadlineAt || step(room)?.id === 'mixed_blood_model') && (!t.submitted || step(room)?.id === 'wolves_kill');
  }
  function control(room, action, key, now = Date.now()) {
    const t = settle(room.fixedNightTiming, now);
    if (!t || t.key !== key) throw new Error('夜间步骤已更新，请刷新后重试');
    const current = step(room);
    if (action === 'pause') { pause(t, now); return; }
    if (action === 'heartbeat') { if (t.phase !== 'PAUSED') t.leaseUntil = now + 10000; return; }
    if (action === 'resume') {
      if(t.phase !== 'PAUSED') throw new Error('当前流程未暂停');
      room.fixedNightSequence = (room.fixedNightSequence || 0) + 1;
      t.key = `${room.night}:${room.fixedNightSequence}`;
      t.phase = t.resumePhase; t.deadlineAt = now + t.remainingMs; t.readyAt = now + t.remainingMs; t.leaseUntil = now + 10000;
      return;
    }
    if (action === 'ack') {
      if (!['ANNOUNCEMENT', 'GAP'].includes(t.phase) || now < t.readyAt) throw new Error('当前不等待播报确认');
      t.phase = 'ACTION'; t.deadlineAt = now + (current.id === 'wolves_kill' ? 120000 : 60000); t.leaseUntil = now + 10000;
    } else if (action === 'extend') {
      if (current.id !== 'wolves_kill' || t.phase !== 'ACTION' || now >= t.deadlineAt || t.extensions >= 2) throw new Error('当前不能加时');
      t.extensions += 1; t.deadlineAt += 20000;
    } else if (action === 'advance') {
      if (!['ACTION', 'FINAL', 'REQUIRED'].includes(t.phase) || now < t.deadlineAt) throw new Error('步骤尚未结束');
      if (current.id === 'wolves_kill' && t.phase === 'ACTION' && t.submitted) { t.phase = 'FINAL'; t.deadlineAt = now + 10000; return; }
      const actorAlive = room.assignments.some(a => a.alive !== false && a.roleId === current.actor);
      if (current.id === 'mixed_blood_model' && actorAlive && !t.submitted) { t.phase = 'REQUIRED'; return; }
      if (!t.submitted) room.nightActions.push({ night: room.night, stepId: current.id, label: current.label, skipped: true, targetSeats: [], timeout: true, createdAt: now });
      room.currentNightStepIndex += 1;
      start(room, now, 5000);
    } else throw new Error('未知夜间计时操作');
  }
  function view(room) { settle(room.fixedNightTiming, Date.now()); return room.fixedNightTiming ? { ...room.fixedNightTiming, submitted: undefined } : null; }
  return { enabled, start, submitted, actionable, control, view, settle, pause };
});
