const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('../web/fixed-night-flow');
function room(id = 'wolves_kill') { return { mode: 'SYSTEM', fixedNightFlow: 1, nightFlowVersion:2, boardId: 'pre_witch_hunter_idiot_mixed', night: 1, currentNightSteps: [{id, actor: id === 'wolves_kill' ? 'wolf_team' : 'mixed_blood'}], currentNightStepIndex: 0, nightActions: [], assignments: [{roleId:'mixed_blood', alive:true}] }; }

test('fixed timing requires version 2 on every supported board',()=>{
  const boards=['pre_witch_hunter_idiot_mixed','masquerade','treasure_master','mechanical_wolf_spirit_medium','realm_of_trickery','dawn_voyage','wolf_king_guard','follow_neighbor','dark_destruction_2'];
  const r=room();
  for(const boardId of boards){
    r.boardId=boardId;delete r.nightFlowVersion;assert.equal(flow.enabled(r),false,boardId+' legacy');
    r.nightFlowVersion=2;assert.equal(flow.enabled(r),true,boardId+' current');
  }
});

test('confirmed 30/45/60 second role windows never finish early',()=>{
  const groups={30000:['mixed_blood_model','idiot_confirm','order_prince_confirm','hunter_confirm','dancer_confirm','masked_man_confirm','captain_confirm','mechanical_knife_confirm','mask_knife_confirm','lia_knife_confirm','treasure_knife_confirm','lia_raise','lia_charge','lia_fog'],45000:['mask_check','mask_give'],60000:['guard_guard','seer_check','spirit_medium_check','witch_action','dreamer_dream','poisoner_poison','cain_check','lilith_bind','archangel_bless','magician_swap','trickster_swap','siren_wind','captain_board','mechanical_mimic','mechanical_guard','mechanical_poison','mechanical_check','mechanical_kill','dancer_dance','puppet_select']};
  for(const [duration,ids]of Object.entries(groups))for(const id of ids){
    const r=room(id);flow.start(r,0);const key=r.fixedNightTiming.key;flow.control(r,'ack',key,0);r.fixedNightTiming.leaseUntil=0;
    assert.equal(r.fixedNightTiming.deadlineAt,Number(duration),id);
    r.nightActions.push({night:1,stepId:id});r.currentNightStepIndex++;flow.submitted(r);
    assert.throws(()=>flow.control(r,'advance',key,Number(duration)-1),id);
    flow.control(r,'advance',key,Number(duration));assert.equal(r.currentNightStepIndex,1,id);
  }
});

test('treasure choice and skill share one uninterrupted minute, including timeout',()=>{
  for(const chooses of [true,false]){
    const r=room('treasure_pick');r.boardId='treasure_master';r.currentNightSteps=[{id:'treasure_pick'},{id:'treasure_skill'},{id:'wolves_kill'}];flow.start(r,0);const key=r.fixedNightTiming.key;
    flow.control(r,'ack',key,0);r.fixedNightTiming.leaseUntil=0;
    if(chooses){
      r.nightActions.push({night:1,stepId:'treasure_pick'});r.currentNightStepIndex++;flow.submitted(r);
      assert.equal(r.currentNightStepIndex,1);assert.equal(r.fixedNightTiming.phase,'ACTION');assert.equal(r.fixedNightTiming.deadlineAt,60000);assert.equal(r.fixedNightTiming.key,key);
      r.nightActions.push({night:1,stepId:'treasure_skill'});r.currentNightStepIndex++;flow.submitted(r);
      assert.throws(()=>flow.control(r,'advance',key,59999));
    }
    flow.control(r,'advance',key,60000);assert.equal(r.currentNightStepIndex,2);assert.equal(r.fixedNightTiming.readyAt,65000);
    assert.equal(r.nightActions.length,2);
  }
});

test('first-night puppet remains mandatory after timeout and can still confirm',()=>{
  const r=room('puppet_select');r.boardId='follow_neighbor';r.currentNightSteps[0].actor='wolf_team';r.assignments=[{roleId:'wolf',alive:true}];flow.start(r,0);const key=r.fixedNightTiming.key;
  flow.control(r,'ack',key,0);r.fixedNightTiming.leaseUntil=0;flow.control(r,'advance',key,60000);assert.equal(r.fixedNightTiming.phase,'REQUIRED');assert.equal(flow.actionable(r,65000),true);
  r.nightActions.push({night:1,stepId:'puppet_select',targetSeats:[2]});r.currentNightStepIndex++;flow.submitted(r);
  assert.equal(flow.view(r).readyToAdvance,true);flow.control(r,'advance',key,65000);assert.equal(r.currentNightStepIndex,1);
});
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
  flow.control(r, 'advance', key, 161000); assert.equal(r.fixedNightTiming, null);
  assert.equal(r.currentNightStepIndex, 1);
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
