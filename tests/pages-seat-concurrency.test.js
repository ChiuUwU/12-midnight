const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let onRequestPromise;

test('required selection waiting is a read-only no-op and does not race the actor',async()=>{
  const f=await conflictFixture(),room=f.load();room.night=1;room.assignments[0].roleId='mixed_blood';room.assignments[0].camp='GOOD';room.currentNightSteps=[{id:'mixed_blood_model',actor:'mixed_blood',targetCount:1,allowSkip:false}];
  room.fixedNightTiming={key:'1:1',phase:'REQUIRED',deadlineAt:Date.now()-1,leaseUntil:0,submitted:false};f.env.DB.rooms.get(f.id).data=JSON.stringify(room);
  const revision=room.revision;
  for(let i=0;i<5;i++)assert.equal((await f.post('system-fixed-night',{...f.auth,operation:'advance',stepKey:'1:1'})).status,200);
  assert.equal(f.load().revision,revision);
  const player=await request(f.env,`/api/rooms/${f.id}`,null,{"X-Client-Id":"conflict-1"});
  const body={clientId:'conflict-1',actionToken:player.body.room.systemNight.actionToken,expectedRevision:revision,nightRequestId:'required-select',targetSeats:[3]};
  const submitted=await f.post('night-action',body);assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  assert.equal(submitted.body.room.systemNight.submittedForMe,true);
  const duplicate=await f.post('night-action',body);assert.equal(duplicate.status,200);assert.equal(f.load().nightActions.length,1);
  const ctl=await request(f.env,`/api/rooms/${f.id}`,null,{"X-Client-Id":f.auth.clientId,Authorization:`Bearer ${f.auth.judgeToken}`});
  assert.equal(ctl.body.room.systemNight.timing.readyToAdvance,true);
});

test('mechanical variants, treasure cards and witch potions tolerate identical retry without spending twice',async()=>{
  const cases=[...['mechanical_guard','mechanical_poison','mechanical_check','mechanical_kill'].map(id=>({id,board:'mechanical_wolf_spirit_medium',role:'mechanical_wolf'})),...['wolf','villager','hunter','masked_man','spirit_medium','dreamer','poisoner'].map(card=>({id:'treasure_skill',board:'treasure_master',role:'treasure_master',card})),...['antidote','poison','neither'].map(potion=>({id:'witch_action',board:'pre_witch_hunter_idiot_mixed',role:'witch',potion}))];
  for(const c of cases){
    const f=await conflictFixture(),room=f.load();room.boardId=c.board;room.assignments[0].roleId=c.role;room.assignments[0].abilityState={treasureCards:['wolf','villager',c.card||'hunter']};
    room.currentNightSteps=[{id:c.id,actor:c.role,targetCount:c.potion?0:1,allowSkip:true,antidoteAvailable:true,poisonAvailable:true,singlePotionPerNight:true}];
    room.nightActions=c.card?[{night:2,stepId:'treasure_pick',cardRoleId:c.card,skipped:false}]:c.potion?[{night:2,stepId:'wolves_kill',targetSeats:[4],skipped:false}]:[];
    f.env.DB.rooms.get(f.id).data=JSON.stringify(room);
    const view=await request(f.env,`/api/rooms/${f.id}`,null,{"X-Client-Id":"conflict-1"});
    const body={clientId:'conflict-1',actionToken:view.body.room.systemNight.actionToken,expectedRevision:0,nightRequestId:'variant-'+c.id+(c.card||c.potion||''),targetSeats:c.potion?[]:[4],skipped:false};
    if(c.card&&!['spirit_medium','dreamer','poisoner'].includes(c.card)){body.skipped=true;body.targetSeats=[];}
    if(c.potion)Object.assign(body,{antidoteUsed:c.potion==='antidote',poisonTargetSeat:c.potion==='poison'?4:0});
    const first=await f.post('night-action',body),again=await f.post('night-action',body);
    assert.equal(first.status,200,c.id+'/'+c.card+'/'+c.potion+JSON.stringify(first.body));assert.equal(again.status,200);
    assert.deepEqual(first.body.privateResult??null,again.body.privateResult??null);
    assert.equal(f.load().nightActions.filter(a=>a.stepId===c.id&&a.night===2).length,1,c.id);
  }
});

async function submissionMatrix(useNode=false){
  const local=useNode?require('./helpers/node-room-api')():null;
  const send=local?local.request:request;
  const {BOARDS}=require('../miniprogram/data/boards'),{dealBoard}=require('../miniprogram/utils/deal');
  const fixed=require('../web/fixed-night-flow');
  const covered=new Set();
  for(const board of BOARDS){
    const env=local?local.env:{DB:new MemoryD1()},created=await send(env,'/api/rooms',{clientId:'matrix-control',mode:'SYSTEM',boardId:board.id,fixedNightFlow:1});
    const id=created.body.room.id,auth={clientId:'matrix-control',judgeToken:created.body.judgeToken};
    const load=()=>JSON.parse(env.DB.rooms.get(id).data),save=r=>{env.DB.rooms.get(id).data=JSON.stringify(r);};
    const post=(action,body=auth)=>send(env,`/api/rooms/${id}/${action}`,body);
    let room=load();room.assignments=dealBoard(board.id,room.seats.map(s=>s.seat));room.seats.forEach(s=>{s.clientId=`matrix-${s.seat}`;s.occupied=true;});save(room);
    for(let night=1;night<=2;night++){
      room=load();room.phase='DEALT';save(room);assert.equal((await post('night-start')).status,200);
      let turns=0;
      while(load().currentNightStepIndex<load().currentNightSteps.length){
        assert.ok(turns++<30,board.id+' stuck');room=load();room.systemAnnouncementNotBefore=0;
        if(fixed.enabled(room)&&['ANNOUNCEMENT','GAP'].includes(room.fixedNightTiming.phase)){room.fixedNightTiming.readyAt=0;save(room);assert.equal((await post('system-fixed-night',{...auth,operation:'ack',stepKey:room.fixedNightTiming.key})).status,200);}
        else save(room);
        room=load();const step=room.currentNightSteps[room.currentNightStepIndex];
        let actor;
        for(const a of room.assignments){const view=await send(env,`/api/rooms/${id}`,null,{"X-Client-Id":`matrix-${a.seat}`});if(view.body.room.systemNight?.canAct){actor={a,view:view.body.room};break;}}
        if(actor){
          covered.add(step.id);const self=actor.a.seat;
          const alive=room.assignments.filter(a=>a.alive!==false&&a.seat!==self).map(a=>a.seat);
          let body={clientId:`matrix-${self}`,expectedRevision:0,actionToken:actor.view.systemNight.actionToken,nightRequestId:`${board.id}:${night}:${turns}`,targetSeats:[],skipped:false};
          if(step.id==='witch_action')Object.assign(body,{antidoteUsed:false,poisonTargetSeat:0});
          else if(step.id==='siren_wind')body.windDirection=night===1?'calm':'tailwind';
          else if(step.id==='treasure_pick'){const previous=room.nightActions.find(a=>a.night===night-1&&a.stepId==='treasure_pick')?.cardRoleId;body.cardRoleId=actor.a.abilityState.treasureCards.find(c=>c!==previous);}
          else if(step.id==='treasure_skill'){const card=room.nightActions.find(a=>a.night===night&&a.stepId==='treasure_pick').cardRoleId;body.skipped=!['spirit_medium','dreamer'].includes(card);if(!body.skipped)body.targetSeats=[alive[0]];}
          else if(step.id==='mechanical_mimic')body.targetSeats=[room.assignments.find(a=>a.roleId==='guard').seat];
          else if(step.id==='lilith_bind')body.targetSeats=[room.assignments.filter(a=>a.roleId==='villager')[night-1].seat];
          else if(step.id==='lia_charge')body.targetSeats=[room.assignments.find(a=>a.roleId==='villager').seat];
          else if(step.id==='trickster_swap'||step.id==='magician_swap'||step.id==='dancer_dance')body.targetSeats=step.allowedSeats.slice(0,step.targetCount);
          else if(step.allowSkip)body.skipped=true;
          else if(step.targetCount)body.targetSeats=(step.allowedSeats||alive).slice(0,step.targetCount);
          const replies=await Promise.all([post('night-action',body),post('night-action',body)]);
          replies.forEach(r=>assert.equal(r.status,200,`${board.id}/${step.id}: ${JSON.stringify(r.body)}`));
          assert.deepEqual(replies[0].body.privateResult??null,replies[1].body.privateResult??null);
          assert.equal(load().nightActions.filter(a=>a.night===night&&a.stepId===step.id).length,1,board.id+'/'+step.id);
          const changed=await post('night-action',{...body,targetSeats:[12,11]});assert.equal(changed.status,409,'request identity cannot change targets');
          const stale=await post('night-action',{...body,nightRequestId:body.nightRequestId+'-new',actionToken:'previous-night-step'});assert.equal(stale.status,409);
        }else assert.ok(fixed.enabled(room)&&step.inactive,`${board.id}/${step.id} has no actor`);
        if(fixed.enabled(room)){
          for(let i=0;i<2;i++){
            room=load();if(room.currentNightSteps[room.currentNightStepIndex]?.id!==step.id)break;
            room.fixedNightTiming.deadlineAt=Date.now()-1;room.fixedNightTiming.leaseUntil=0;save(room);
            const result=await post('system-fixed-night',{...auth,operation:'advance',stepKey:room.fixedNightTiming.key});assert.equal(result.status,200,JSON.stringify(result.body));
          }
        }
      }
    }
  }
  for(const id of ['mixed_blood_model','puppet_select','wolves_kill','witch_action','seer_check','spirit_medium_check','guard_guard','trickster_swap','magician_swap','treasure_pick','treasure_skill','mechanical_mimic','mechanical_guard','mechanical_knife_confirm','mask_knife_confirm','treasure_knife_confirm','lia_knife_confirm','mask_check','mask_give','dancer_dance','lilith_bind','lia_raise','lia_charge','lia_fog','archangel_bless','cain_check','dreamer_dream','siren_wind','captain_board','hunter_confirm','idiot_confirm','order_prince_confirm'])assert.ok(covered.has(id),'uncovered '+id);
}
test('Pages all identities submit once and reject stale steps',()=>submissionMatrix());
test('Node all identities submit once and reject stale steps',()=>submissionMatrix(true));


test('twelve simultaneous distinct seats succeed with the same stale revision',async()=>{
  const env={DB:new MemoryD1()};const created=await createRoom(env,'twelve-concurrent');const {id,revision}=created.body.room;
  const results=await Promise.all(Array.from({length:12},(_,i)=>request(env,`/api/rooms/${id}/seat`,{clientId:`seat-stress-${i}`,seat:i+1,expectedRevision:revision})));
  results.forEach(r=>assert.equal(r.status,200,JSON.stringify(r.body)));
  const room=JSON.parse(env.DB.rooms.get(id).data);assert.equal(room.seats.filter(s=>s.occupied).length,12);assert.equal(new Set(room.seats.map(s=>s.clientId)).size,12);
});

async function conflictFixture() {
  const env = { DB: new MemoryD1() };
  const created = await request(env, '/api/rooms', {clientId:'conflict-controller', mode:'SYSTEM',boardId:'pre_witch_hunter_idiot_mixed',fixedNightFlow:1});
  const id=created.body.room.id, auth={clientId:'conflict-controller',judgeToken:created.body.judgeToken};
  const load=()=>JSON.parse(env.DB.rooms.get(id).data);
  const room=load();room.phase='NIGHT';room.night=2;
  room.seats.forEach(s=>{s.clientId=`conflict-${s.seat}`;s.occupied=true;});
  room.assignments=room.seats.map(({seat})=>({seat,roleId:seat===1?'wolf':seat===2?'seer':'villager',camp:seat===1?'WOLF':'GOOD',alive:true,abilityState:{}}));
  room.currentNightSteps=[{id:'wolves_kill',actor:'wolf_team',label:'狼人选择目标',targetCount:1,allowSkip:true}];room.currentNightStepIndex=0;
  room.fixedNightTiming={key:'2:1',phase:'ACTION',deadlineAt:Date.now()+120000,leaseUntil:Date.now()+10000,submitted:false};
  env.DB.rooms.get(id).data=JSON.stringify(room);
  return {env,id,auth,load,post:(action,body)=>request(env,`/api/rooms/${id}/${action}`,body)};
}

test('Pages parses one bounded request body and rejects malformed JSON or oversized input cleanly', async()=>{
  const env={DB:new MemoryD1()};
  assert.equal((await requestRaw(env,'/api/rooms/123456/seat','null')).status,400);
  const tooLarge=await requestRaw(env,'/api/rooms/123456/seat',JSON.stringify({nickname:'x'.repeat(1024*1024)}));
  assert.equal(tooLarge.status,413);
});

test('Node and Pages reject old system-room writes without migrating stored room data',async()=>{
  const pages=await conflictFixture(),oldPageRoom=pages.load();
  delete oldPageRoom.nightFlowVersion;
  pages.env.DB.rooms.get(pages.id).data=JSON.stringify(oldPageRoom);
  const pageResult=await pages.post('night-start',pages.auth);
  assert.equal(pageResult.status,409);
  assert.equal(pages.load().nightFlowVersion,undefined);

  const local=require('./helpers/node-room-api')();
  const created=await local.request(null,'/api/rooms',{clientId:'legacy-controller',mode:'SYSTEM',boardId:'pre_witch_hunter_idiot_mixed',fixedNightFlow:1});
  const id=created.body.room.id,room=JSON.parse(local.env.DB.rooms.get(id).data);
  delete room.nightFlowVersion;
  local.env.DB.rooms.get(id).data=JSON.stringify(room);
  const nodeResult=await local.request(null,`/api/rooms/${id}/night-start`,{clientId:'legacy-controller',judgeToken:created.body.judgeToken});
  assert.equal(nodeResult.status,409);
  assert.equal(JSON.parse(local.env.DB.rooms.get(id).data).nightFlowVersion,undefined);
});

test('Pages heartbeats do not invalidate player submissions or rearchive the game', async()=>{
  const f=await conflictFixture(),revision=f.load().revision;
  for(let i=0;i<3;i++)assert.equal((await f.post('system-fixed-night',{...f.auth,expectedRevision:revision,operation:'heartbeat',stepKey:'2:1'})).status,200);
  assert.equal(f.load().revision,revision);assert.equal(f.env.DB.archives.size,0);
  const action=await f.post('night-action',{clientId:'conflict-1',expectedRevision:revision,targetSeats:[3]});
  assert.equal(action.status,200,JSON.stringify(action.body));
  assert.deepEqual(f.load().nightActions.at(-1).targetSeats,[3]);
  assert.equal((await f.post('system-fixed-night',{...f.auth,expectedRevision:revision,operation:'heartbeat',stepKey:'old-key'})).status,409);
  assert.equal((await f.post('system-fixed-night',{clientId:'stranger',operation:'heartbeat',stepKey:'2:1'})).status,403);
});

test('Pages simultaneous identity views are private, idempotent and do not advance business revision',async()=>{
  const f=await conflictFixture(),revision=f.load().revision;
  const results=await Promise.all([1,2].map(seat=>f.post('reveal',{clientId:`conflict-${seat}`,expectedRevision:revision-1})));
  results.forEach((r,i)=>{assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.room.assignments.length,1);assert.equal(r.body.room.assignments[0].seat,i+1);});
  assert.equal(f.load().revision,revision);
  assert.equal(f.load().assignments.filter(a=>a.revealed).length,2);
  await f.post('reveal',{clientId:'conflict-1',expectedRevision:revision});
  assert.equal(f.load().logs.filter(l=>l.type==='IDENTITY_VIEWED').length,2);
});

test('Pages retries storage-only CAS interference but still rejects stale business actions',async()=>{
  const f=await conflictFixture(),revision=f.load().revision;
  const prepare=f.env.DB.prepare.bind(f.env.DB);let injected=false;
  f.env.DB.prepare=sql=>{const stmt=prepare(sql),run=stmt.run;stmt.run=async function(){
    if(!injected&&sql.startsWith('UPDATE rooms SET data')){injected=true;const row=f.env.DB.rooms.get(f.id);row.updatedAt+=1;}
    return run.call(this);
  };return stmt;};
  const action=await f.post('night-action',{clientId:'conflict-1',expectedRevision:revision,targetSeats:[3]});
  assert.equal(action.status,200,JSON.stringify(action.body));assert.ok(injected);
  assert.equal(f.load().nightActions.length,1);
  const stale=await f.post('night-action',{clientId:'conflict-1',expectedRevision:revision,targetSeats:[4]});
  assert.equal(stale.status,409);assert.deepEqual(f.load().nightActions.at(-1).targetSeats,[3]);
});

test('Pages daytime heartbeats retain revision while acknowledgements remain keyed',async()=>{
  const f=await conflictFixture();const room=f.load();room.phase='DAY';room.pendingDeathSkills=[{seat:3,day:2,eligible:false,createdAt:1}];
  f.env.DB.rooms.get(f.id).data=JSON.stringify(room);
  const view=await request(f.env,`/api/rooms/${f.id}`,null,{"X-Client-Id":f.auth.clientId,Authorization:`Bearer ${f.auth.judgeToken}`}),key=view.body.room.daySkillVoice.key,revision=room.revision;
  assert.equal((await f.post('system-day-voice',{...f.auth,operation:'heartbeat',windowKey:key,expectedRevision:revision-1})).status,200);
  assert.equal(f.load().revision,revision);
  assert.equal((await f.post('system-day-voice',{...f.auth,operation:'ack',windowKey:key,expectedRevision:revision-1})).status,200);
  assert.ok(f.load().revision>revision);
  assert.equal((await f.post('system-day-voice',{...f.auth,operation:'finish',windowKey:'old-key'})).status,409);
});

function loadPagesFunction() {
  if (!onRequestPromise) {
    const functionPath = path.resolve(__dirname, "../functions/api/rooms/[[path]].js");
    const source = fs.readFileSync(functionPath, "utf8").replace(
      /from "\.\.\/\.\.\/\.\.\/web\/([^"]+)"/g,
      (_, dependency) => `from "${pathToFileURL(path.resolve(__dirname, "../web", dependency)).href}"`
    );
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
    onRequestPromise = import(dataUrl).then((module) => module.onRequest);
  }
  return onRequestPromise;
}

class MemoryD1Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (!this.sql.startsWith("SELECT data, updated_at FROM rooms")) throw new Error(`Unsupported first(): ${this.sql}`);
    const row = this.database.rooms.get(this.values[0]);
    return row ? { data: row.data, updated_at: row.updatedAt } : null;
  }

  async run() {
    if (this.sql.startsWith("DELETE FROM rooms WHERE updated_at < ?")
      || this.sql.startsWith("CREATE TABLE IF NOT EXISTS deal_histories")
      || this.sql.startsWith("CREATE TABLE IF NOT EXISTS game_archives")
      || this.sql.startsWith("CREATE INDEX IF NOT EXISTS idx_game_archives_updated_at")
      || this.sql.startsWith("DELETE FROM deal_histories WHERE updated_at < ?")) {
      return { meta: { changes: 0 } };
    }
    if (this.sql.startsWith("INSERT INTO rooms")) {
      const [id, data, , updatedAt] = this.values;
      if (this.database.rooms.has(id)) return { meta: { changes: 0 } };
      this.database.rooms.set(id, { data, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("UPDATE rooms SET data = ?, updated_at = ? WHERE id = ? AND updated_at = ?")) {
      const [data, updatedAt, id, expectedUpdatedAt] = this.values;
      const row = this.database.rooms.get(id);
      if (!row || row.updatedAt !== expectedUpdatedAt) return { meta: { changes: 0 } };
      this.database.rooms.set(id, { data, updatedAt });
      return { meta: { changes: 1 } };
    }
    if (this.sql.startsWith("INSERT INTO game_archives")) {
      const [id, roomId, boardId, mode, phase, createdAt, updatedAt, data, sourceRoomId, mutationId] = this.values;
      const source = this.database.rooms.get(sourceRoomId);
      if (!source || JSON.parse(source.data).persistenceMutationId !== mutationId) return { meta: { changes: 0 } };
      this.database.archives.set(id, { id, roomId, boardId, mode, phase, createdAt, updatedAt, data });
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unsupported run(): ${this.sql}`);
  }
}

class MemoryD1 {
  rooms = new Map();
  archives = new Map();

  prepare(sql) {
    return new MemoryD1Statement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

async function request(env, path, body = null, extraHeaders = {}) {
  const onRequest = await loadPagesFunction();
  const response = await onRequest({
    request: new Request(`https://unit.test${path}`, {
      method: body === null ? "GET" : "POST",
      headers: { ...(body === null ? {} : { "Content-Type": "application/json" }), ...extraHeaders },
      body: body === null ? undefined : JSON.stringify(body)
    }),
    env
  });
  return { status: response.status, body: await response.json() };
}

async function requestRaw(env, path, rawBody) {
  const onRequest = await loadPagesFunction();
  const response = await onRequest({
    request: new Request(`https://unit.test${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: rawBody }),
    env
  });
  return { status: response.status, body: await response.json() };
}

async function createRoom(env, suffix) {
  return request(env, "/api/rooms", {
    clientId: `controller-${suffix}`,
    mode: "SYSTEM",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
}

for (const useNode of [false, true]) {
  test(`${useNode ? 'Node' : 'Pages'} rejects malformed votes, invalid badge targets and repeated finalized exiles`, async () => {
    const local = useNode ? require('./helpers/node-room-api')() : null;
    const send = local ? local.request : request;
    const env = local ? local.env : { DB: new MemoryD1() };
    const created = await send(env, '/api/rooms', { clientId: 'day-validation', mode: 'JUDGE', boardId: 'pre_witch_hunter_idiot_mixed' });
    const id = created.body.room.id;
    const auth = { clientId: 'day-validation', judgeToken: created.body.judgeToken };
    const load = () => JSON.parse(env.DB.rooms.get(id).data);
    const post = (action, body = {}) => send(env, `/api/rooms/${id}/${action}`, { ...auth, ...body });
    const room = load();
    room.phase = 'DAY'; room.night = 1;
    room.assignments = room.seats.map(({ seat }) => ({ seat, roleId: seat <= 4 ? 'wolf' : 'villager', camp: seat <= 4 ? 'WOLF' : 'GOOD', alive: seat !== 12 }));
    room.deathRecords = [{ day: 1, phase: 'DAYBREAK', seats: [] }];
    room.sheriffCandidates = [1, 2];
    env.DB.rooms.get(id).data = JSON.stringify(room);
    for (const action of ['sheriff-vote', 'day-vote']) {
      for (const votes of [[null], 'invalid', [{ voterSeat: true, targetSeat: [] }], [{ voterSeat: '1', targetSeat: '2' }], Array(13).fill({ voterSeat: 1, targetSeat: 2 })]) {
        assert.equal((await post(action, { votes })).status, 400, action);
      }
      assert.equal((await post(action, { votes: [], round: 3 })).status, 400, action);
      assert.equal((await post(action, { votes: [], round: 2 })).status, 400, `${action} requires a first-round tie`);
    }
    assert.equal(load().revision, room.revision, 'invalid votes must not mutate the room');
    assert.equal((await post('sheriff-vote', { round: 1, votes: [{ voterSeat: 3, targetSeat: 1 }] })).status, 200);
    assert.equal(load().sheriffBadge.holderSeat, 1);
    assert.equal((await post('sheriff-vote', { round: 1, votes: [{ voterSeat: 3, targetSeat: 2 }] })).status, 400);
    assert.equal(load().sheriffBadge.holderSeat, 1);
    for (const seat of ['abc', 1.5, 13, 12]) {
      assert.equal((await post('sheriff-badge', { mode: 'transfer', seat })).status, 400);
    }
    assert.equal((await post('sheriff-badge', { mode: 'transfer', seat: 2 })).status, 200);
    assert.equal(load().sheriffBadge.holderSeat, 2);
    assert.equal((await post('day-vote', { round: 1, votes: [{ voterSeat: 1, targetSeat: 3 }] })).status, 200);
    assert.equal((await post('day-vote', { round: 1, votes: [{ voterSeat: 1, targetSeat: 4 }] })).status, 400);
    assert.equal(load().assignments.find((item) => item.seat === 4).alive, true);
    assert.equal(load().exileRecords.length, 1);
  });

  test(`${useNode ? 'Node' : 'Pages'} accepts a second vote only after a real first-round tie`, async () => {
    const local = useNode ? require('./helpers/node-room-api')() : null;
    const send = local ? local.request : request;
    const env = local ? local.env : { DB: new MemoryD1() };
    const created = await send(env, '/api/rooms', { clientId: 'pk-controller', mode: 'JUDGE', boardId: 'pre_witch_hunter_idiot_mixed' });
    const id = created.body.room.id;
    const auth = { clientId: 'pk-controller', judgeToken: created.body.judgeToken };
    const load = () => JSON.parse(env.DB.rooms.get(id).data);
    const post = (action, body) => send(env, `/api/rooms/${id}/${action}`, { ...auth, ...body });
    const room = load();
    room.phase = 'DAY'; room.night = 1;
    room.assignments = room.seats.map(({ seat }) => ({ seat, roleId: 'villager', camp: 'GOOD', alive: true }));
    env.DB.rooms.get(id).data = JSON.stringify(room);
    assert.equal((await post('day-vote', { round: 1, votes: [{ voterSeat: 5, targetSeat: 6 }] })).status, 400, 'daybreak must be announced first');
    room.deathRecords = [{ day: 1, phase: 'DAYBREAK', seats: [] }];
    room.sheriffCandidates = [1, 2];
    env.DB.rooms.get(id).data = JSON.stringify(room);
    assert.equal((await post('sheriff-vote', { round: 1, votes: [{ voterSeat: 3, targetSeat: 1 }, { voterSeat: 4, targetSeat: 2 }] })).status, 200);
    assert.deepEqual(load().sheriffVoteRecord.pkSeats, [1, 2]);
    assert.equal((await post('sheriff-vote', { round: 2, votes: [{ voterSeat: 3, targetSeat: 1 }] })).status, 200);
    assert.equal(load().sheriffBadge.holderSeat, 1);
    assert.equal((await post('day-vote', { round: 1, votes: [{ voterSeat: 5, targetSeat: 6 }, { voterSeat: 7, targetSeat: 8 }] })).status, 200);
    assert.deepEqual(load().dayVoteRecord.pkSeats, [6, 8]);
    assert.equal((await post('day-vote', { round: 2, votes: [{ voterSeat: 5, targetSeat: 6 }] })).status, 200);
    assert.equal(load().exileRecords.length, 1);
    assert.equal(load().exileRecords[0].seat, 6);
  });
}

test("Node and Pages keep public room views sanitized and reserve complete game details for authorized viewers", async () => {
  const fixtures = [];
  const env = { DB: new MemoryD1() };
  const created = await createRoom(env, "privacy");
  fixtures.push({
    name: "Pages",
    id: created.body.room.id,
    token: created.body.judgeToken,
    controllerId: "controller-privacy",
    read: (path, clientId = "", token = "") => request(env, path, null, {
      ...(clientId ? { "X-Client-Id": clientId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }),
    setRoom(room) { env.DB.rooms.get(created.body.room.id).data = JSON.stringify(room); }
  });

  const nodeApi = require("./helpers/node-room-api")();
  const nodeCreated = await nodeApi.request(null, "/api/rooms", { clientId: "controller-node-privacy", mode: "SYSTEM", boardId: "pre_witch_hunter_idiot_mixed" });
  const nodeId = nodeCreated.body.room.id;
  fixtures.push({
    name: "Node",
    id: nodeId,
    token: nodeCreated.body.judgeToken,
    controllerId: "controller-node-privacy",
    read: (path, clientId = "", token = "") => nodeApi.request(null, path, null, {
      ...(clientId ? { "X-Client-Id": clientId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }),
    setRoom(room) { nodeApi.env.DB.rooms.get(nodeId).data = JSON.stringify(room); }
  });

  for (const fixture of fixtures) {
    const waiting = await fixture.read(`/api/rooms/${fixture.id}`);
    assert.equal(waiting.status, 200, `${fixture.name}: room entry must remain available before the game starts`);
    assert.equal(waiting.body.room.mySeat, null, `${fixture.name}: an empty client ID must not match an empty seat`);
    const room = JSON.parse(fixture.name === "Pages" ? env.DB.rooms.get(fixture.id).data : nodeApi.env.DB.rooms.get(fixture.id).data);
    room.phase = "DAY";
    room.activeDaySkillWindow = {
      id: "order-prince-rewind-1", day: 1, trigger: "AFTER_FIRST_DAY_VOTE", kind: "ORDER_PRINCE_REWIND",
      eligibleSeats: [7], action: "ACTIVATE_OR_DECLINE", resume: "DAY_VOTE_OR_EXILE", metadata: { rawExiledSeat: 4 },
      status: "OPEN", deadlineAt: 123, createdAt: 100
    };
    fixture.setRoom(room);
    const activeWindow = await fixture.read(`/api/rooms/${fixture.id}`, fixture.controllerId, fixture.token);
    assert.equal(activeWindow.status, 200);
    assert.equal(activeWindow.body.room.activeDaySkillWindow.id, "order-prince-rewind-1");
    assert.equal(activeWindow.body.room.activeDaySkillWindow.status, "OPEN");
    assert.equal(Object.hasOwn(activeWindow.body.room.activeDaySkillWindow, "eligibleSeats"), false, `${fixture.name}: controller must not see the Prince seat`);
    assert.equal(Object.hasOwn(activeWindow.body.room.activeDaySkillWindow, "metadata"), false, `${fixture.name}: controller must not see private window metadata`);
    const publicWindow = await fixture.read(`/api/rooms/${fixture.id}`, "public-observer");
    assert.equal(publicWindow.status, 200, `${fixture.name}: active rooms expose only their public read view`);
    assert.equal(publicWindow.body.room.activeDaySkillWindow, null, `${fixture.name}: public observers must not see a pending role window`);
    assert.equal(publicWindow.body.room.assignments.length, 0, `${fixture.name}: public observers must not see role assignments`);
    room.phase = "GAME_OVER";
    room.seats[0].clientId = `${fixture.name.toLowerCase()}-player`;
    room.seats[0].occupied = true;
    room.assignments = room.seats.map((seat) => ({ seat: seat.seat, roleId: seat.seat === 1 ? "seer" : "villager", camp: "GOOD", alive: true }));
    room.nightActions = [{ night: 1, stepId: "seer_check", targetSeats: [2] }];
    fixture.setRoom(room);

    const queryOnly = await fixture.read(`/api/rooms/${fixture.id}?clientId=${fixture.controllerId}&judgeToken=${fixture.token}`);
    assert.equal(queryOnly.status, 200, `${fixture.name}: started rooms retain a public read-only view`);
    assert.equal(queryOnly.body.room.assignments.length, 0, `${fixture.name}: query-string credentials must not authorize full details`);
    const outsider = await fixture.read(`/api/rooms/${fixture.id}`, "not-seated");
    assert.equal(outsider.status, 200, `${fixture.name}: unseated users may read public status`);
    assert.equal(outsider.body.room.assignments.length, 0, `${fixture.name}: public status must not reveal identities`);
    assert.equal(outsider.body.room.nightActions.length, 0, `${fixture.name}: public status must not reveal private actions`);
    const player = await fixture.read(`/api/rooms/${fixture.id}`, `${fixture.name.toLowerCase()}-player`);
    assert.equal(player.status, 200);
    assert.equal(player.body.room.assignments.length, 12, `${fixture.name}: seated players retain completed-game review`);
    assert.equal(player.body.room.nightActions.length, 1);
    const controller = await fixture.read(`/api/rooms/${fixture.id}`, fixture.controllerId, fixture.token);
    assert.equal(controller.status, 200);
    assert.equal(controller.body.room.isController, true);
    assert.equal(controller.body.room.assignments.length, 12);
    assert.equal(JSON.stringify(controller.body).includes(fixture.token), false, `${fixture.name}: judge token must not be returned in room data`);
  }
});

test("empty client IDs cannot inherit an unoccupied seat to use player actions", async () => {
  const fixtures = [];
  const env = { DB: new MemoryD1() };
  const created = await createRoom(env, "empty-client");
  fixtures.push({
    name: "Pages",
    id: created.body.room.id,
    load: () => JSON.parse(env.DB.rooms.get(created.body.room.id).data),
    save: (room) => { env.DB.rooms.get(created.body.room.id).data = JSON.stringify(room); },
    post: (path) => request(env, `/api/rooms/${created.body.room.id}/${path}`, {})
  });

  const nodeApi = require("./helpers/node-room-api")();
  const nodeCreated = await nodeApi.request(null, "/api/rooms", { clientId: "controller-empty-client", mode: "SYSTEM", boardId: "pre_witch_hunter_idiot_mixed" });
  fixtures.push({
    name: "Node",
    id: nodeCreated.body.room.id,
    load: () => JSON.parse(nodeApi.env.DB.rooms.get(nodeCreated.body.room.id).data),
    save: (room) => { nodeApi.env.DB.rooms.get(nodeCreated.body.room.id).data = JSON.stringify(room); },
    post: (path) => nodeApi.request(null, `/api/rooms/${nodeCreated.body.room.id}/${path}`, {})
  });

  for (const fixture of fixtures) {
    const room = fixture.load();
    room.phase = "DAY";
    room.night = 1;
    room.systemDayOutcomeRecordedDay = 0;
    room.seats.forEach((seat, index) => {
      seat.clientId = index === 0 ? "" : `${fixture.name.toLowerCase()}-player-${seat.seat}`;
      seat.occupied = index !== 0;
    });
    room.assignments = room.seats.map(({ seat }) => ({
      seat,
      roleId: seat === 1 ? "wolf" : "villager",
      camp: seat === 1 ? "WOLF" : "GOOD",
      alive: true,
      abilityState: {}
    }));
    fixture.save(room);

    const attempt = await fixture.post("wolf-self-destruct");
    assert.equal(attempt.status, 403, `${fixture.name}: an empty client ID must not act as the wolf in an unoccupied seat`);
    assert.equal(fixture.load().assignments[0].alive, true);
  }
});

test("malformed static paths return 400 instead of throwing", () => {
  const nodeApi = require("./helpers/node-room-api")();
  let status = 0;
  let body = "";
  nodeApi.serveStatic({ writeHead(value) { status = value; }, end(value) { body = value; } }, new URL("http://unit.test/%E0%A4%A"));
  assert.equal(status, 400);
  assert.equal(body, "Bad request");
});

test("Pages D1 retries concurrent distinct seat reservations without losing writes", async () => {
  const env = { DB: new MemoryD1() };
  const created = await createRoom(env, "distinct");
  assert.equal(created.status, 200);
  const { id, revision } = created.body.room;

  const reservations = await Promise.all(Array.from({ length: 12 }, (_, index) => request(env, `/api/rooms/${id}/seat`, {
    clientId: `player-${index + 1}`,
    seat: index + 1,
    expectedRevision: revision
  })));
  assert.ok(reservations.every((result) => result.status === 200), JSON.stringify(reservations.map((result) => result.body)));

  const observer = await request(env, `/api/rooms/${id}`, null, { "X-Client-Id": "observer" });
  assert.equal(observer.body.room.seats.filter((seat) => seat.occupied).length, 12);
  assert.equal(observer.body.room.revision, revision + 12);
});

test("Pages D1 allows only one player to reserve a contested seat", async () => {
  const env = { DB: new MemoryD1() };
  const created = await createRoom(env, "contested");
  const { id, revision } = created.body.room;
  const results = await Promise.all(["a", "b"].map((player) => request(env, `/api/rooms/${id}/seat`, {
    clientId: `player-${player}`,
    seat: 7,
    expectedRevision: revision
  })));

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.match(results.find((result) => result.status === 409).body.error, /刚被其他玩家选中/);
  const observer = await request(env, `/api/rooms/${id}`, null, { "X-Client-Id": "observer" });
  assert.equal(observer.body.room.seats.filter((seat) => seat.occupied).length, 1);
  assert.equal(observer.body.room.seats.find((seat) => seat.seat === 7).occupied, true);
});

test("Pages D1 accepts concurrent ballot submissions once per voter without losing votes", async () => {
  const env = { DB: new MemoryD1() };
  const created = await createRoom(env, "ballot");
  const { id } = created.body.room;
  for (let seat = 1; seat <= 12; seat += 1) {
    assert.equal((await request(env, `/api/rooms/${id}/seat`, { clientId: `voter-${seat}`, seat })).status, 200);
  }
  const stored = env.DB.rooms.get(id);
  const room = JSON.parse(stored.data);
  room.phase = "DAY";
  room.night = 1;
  room.assignments = room.seats.map((seat) => ({ seat: seat.seat, roleId: "villager", camp: "GOOD", alive: true }));
  room.activeDarkBallot = { id: "ballot-round-one", day: 1, round: 1, status: "OPEN", voterSeats: room.seats.map((seat) => seat.seat), allowedTargets: room.seats.map((seat) => seat.seat), votes: {} };
  stored.data = JSON.stringify(room);
  const results = await Promise.all(room.seats.map((seat) => request(env, `/api/rooms/${id}/dark-ballot-vote`, {
    clientId: `voter-${seat.seat}`, targetSeat: 2, ballotId: "ballot-round-one", expectedRevision: room.revision
  })));
  assert.ok(results.every((result) => result.status === 200), JSON.stringify(results.map((result) => result.body)));
  const persisted = JSON.parse(env.DB.rooms.get(id).data);
  assert.equal(Object.keys(persisted.activeDarkBallot.votes).length, 12);
  const archived = JSON.parse(env.DB.archives.get(persisted.archiveId).data);
  assert.equal(Object.keys(archived.activeBallot.votes).length, 12);
  assert.equal(Object.hasOwn(archived, "judgeToken"), false);
  assert.equal(JSON.stringify(archived).includes("voter-1"), false);
  assert.equal((await request(env, `/api/rooms/${id}/dark-ballot-vote`, { clientId: "voter-1", targetSeat: 3, ballotId: "ballot-round-one" })).status, 409);
  assert.equal((await request(env, `/api/rooms/${id}/dark-ballot-vote`, { clientId: "voter-1", targetSeat: 2, ballotId: "old-round" })).status, 409);
});

test("Pages grants hidden wolves the ordinary knife only after the visible pack dies", async () => {
  for (const [boardId, hiddenRole] of [["masquerade", "mask"], ["mechanical_wolf_spirit_medium", "mechanical_wolf"], ["treasure_master", "treasure_master"], ["dark_destruction_2", "lia"]]) {
    const env = { DB: new MemoryD1() };
    const created = await request(env, "/api/rooms", { clientId: `controller-${boardId}`, mode: "SYSTEM", boardId });
    const id = created.body.room.id;
    const stored = env.DB.rooms.get(id);
    const room = JSON.parse(stored.data);
    room.phase = "NIGHT";
    room.night = 2;
    room.seats.forEach((seat) => { seat.clientId = `player-${seat.seat}`; seat.occupied = true; });
    room.assignments = room.seats.map((seat) => ({ seat: seat.seat, roleId: seat.seat === 1 ? hiddenRole : seat.seat === 2 ? "wolf" : "villager", camp: seat.seat <= 2 ? "WOLF" : "GOOD", alive: true, abilityState: {} }));
    room.currentNightSteps = [{ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }];
    room.currentNightStepIndex = 0;
    stored.data = JSON.stringify(room);
    const before = await request(env, `/api/rooms/${id}`, null, { "X-Client-Id": "player-1" });
    assert.equal(before.body.room.systemNight.canAct, false, boardId);
    assert.equal((await request(env, `/api/rooms/${id}/night-action`, { clientId: "player-1", targetSeats: [12] })).status, 403, boardId);
    room.assignments[1].alive = false;
    stored.data = JSON.stringify(room);
    const after = await request(env, `/api/rooms/${id}`, null, { "X-Client-Id": "player-1" });
    assert.equal(after.body.room.systemNight.canAct, true, boardId);
    const other = await request(env, `/api/rooms/${id}`, null, { "X-Client-Id": "player-3" });
    assert.equal(other.body.room.assignments.length, 1, boardId);
    const accepted = await request(env, `/api/rooms/${id}/night-action`, { clientId: "player-1", targetSeats: [12] });
    assert.equal(accepted.status, 200, `${boardId}: ${JSON.stringify(accepted.body)}`);
  }
});

test("Pages rejects an extra treasure wolf-card knife even when the pack is gone", async () => {
  const env = { DB: new MemoryD1() };
  const created = await request(env, "/api/rooms", { clientId: "controller-treasure", mode: "SYSTEM", boardId: "treasure_master" });
  const id = created.body.room.id;
  const stored = env.DB.rooms.get(id);
  const room = JSON.parse(stored.data);
  room.phase = "NIGHT"; room.night = 2;
  room.seats.forEach((seat) => { seat.clientId = `player-${seat.seat}`; seat.occupied = true; });
  room.assignments = room.seats.map((seat) => ({ seat: seat.seat, roleId: seat.seat === 1 ? "treasure_master" : "villager", camp: seat.seat === 1 ? "WOLF" : "GOOD", alive: true, abilityState: {} }));
  room.nightActions = [{ night: 2, stepId: "treasure_pick", cardRoleId: "wolf", skipped: false }];
  room.currentNightSteps = [{ id: "treasure_skill", actor: "treasure_master", label: "盗宝大师使用盗宝牌技能", targetCount: 1, allowSkip: true }];
  room.currentNightStepIndex = 0;
  stored.data = JSON.stringify(room);
  const attempt = await request(env, `/api/rooms/${id}/night-action`, { clientId: "player-1", targetSeats: [12], skipped: false });
  assert.equal(attempt.status, 400);
  assert.match(attempt.body.error, /不提供额外技能刀/);
});

test("Pages judge keeps a dead Lilith cue and rejects fog without charge", async () => {
  const env = { DB: new MemoryD1() };
  const created = await request(env, "/api/rooms", { clientId: "dark-judge-fixture", mode: "JUDGE", boardId: "dark_destruction_2" });
  const id = created.body.room.id;
  const auth = { clientId: "dark-judge-fixture", judgeToken: created.body.judgeToken };
  const stored = env.DB.rooms.get(id);
  const room = JSON.parse(stored.data);
  room.phase = "DEALT"; room.night = 1;
  room.assignments = room.seats.map((seat) => ({ seat: seat.seat, roleId: seat.seat === 1 ? "lilith" : seat.seat === 2 ? "lia" : seat.seat === 3 ? "wolf" : "villager", camp: seat.seat <= 3 ? "WOLF" : "GOOD", alive: seat.seat !== 1, abilityState: {} }));
  stored.data = JSON.stringify(room);
  const started = await request(env, `/api/rooms/${id}/night-start`, auth);
  assert.equal(started.status, 200);
  assert.equal(started.body.room.currentNightSteps[0].id, "lilith_bind");
  assert.equal(started.body.room.currentNightSteps[0].inactive, true);
  const forged = await request(env, `/api/rooms/${id}/night-action`, { ...auth, targetSeats: [4], skipped: false });
  assert.equal(forged.status, 400);
  assert.match(forged.body.error, /莉莉丝已出局/);
  assert.equal((await request(env, `/api/rooms/${id}/night-action`, { ...auth, targetSeats: [], skipped: true })).status, 200);
  const nextStored = env.DB.rooms.get(id);
  const nextRoom = JSON.parse(nextStored.data);
  nextRoom.currentNightSteps = [{ id: "lia_fog", actor: "lia", label: "莉娅选择是否开启迷雾", targetCount: 0, allowSkip: true }];
  nextRoom.currentNightStepIndex = 0;
  nextStored.data = JSON.stringify(nextRoom);
  const impossible = await request(env, `/api/rooms/${id}/night-action`, { ...auth, targetSeats: [], skipped: false });
  assert.equal(impossible.status, 400);
  assert.match(impossible.body.error, /不能开启迷雾/);
  assert.equal((await request(env, `/api/rooms/${id}/night-action`, { ...auth, targetSeats: [], skipped: true })).status, 200);
});

test("Pages judge and system direct exile open rewind before resolving the trickster swap", async () => {
  for (const mode of ["JUDGE", "SYSTEM"]) {
  const env = { DB: new MemoryD1() };
  const created = await request(env, "/api/rooms", { clientId: "trick-judge", mode, boardId: "realm_of_trickery" });
  const id = created.body.room.id;
  const auth = { clientId: "trick-judge", judgeToken: created.body.judgeToken };
  const stored = env.DB.rooms.get(id);
  const room = JSON.parse(stored.data);
  room.phase = "DAY"; room.night = 1;
  room.assignments = room.seats.map(({ seat }) => ({ seat, roleId: seat === 2 ? "order_prince" : "villager", camp: "GOOD", alive: true, abilityState: {} }));
  room.nightActions = [{ night: 1, stepId: "trickster_swap", targetSeats: [1, 11], skipped: false }];
  room.deathRecords = [{ day: 1, phase: "DAYBREAK", seats: [] }];
  stored.data = JSON.stringify(room);
  const pending = await request(env, `/api/rooms/${id}/exile-record`, { ...auth, seat: 11, noExile: false });
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  assert.equal(pending.body.room.pendingExileResult.record.exiledSeat, 11);
  assert.equal(JSON.parse(env.DB.rooms.get(id).data).assignments.find((item) => item.seat === 1).alive, true);
  const declined = await request(env, `/api/rooms/${id}/order-prince-decline`, auth);
  assert.equal(declined.status, 200, JSON.stringify(declined.body));
  assert.equal(declined.body.room.exileRecords.at(-1).seat, 1);
  assert.equal(declined.body.room.exileRecords.at(-1).rawSeat, 11);
  assert.equal(JSON.parse(env.DB.rooms.get(id).data).assignments.find((item) => item.seat === 1).alive, false);
  assert.equal(JSON.parse(env.DB.rooms.get(id).data).assignments.find((item) => item.seat === 11).alive, true);
  }
});

test("Node and Pages allow recording the final offline exile after Order Prince rewind", async () => {
  const fixtures = [];
  const env = { DB: new MemoryD1() };
  const created = await request(env, "/api/rooms", { clientId: "prince-offline-pages", mode: "JUDGE", boardId: "realm_of_trickery" });
  fixtures.push({
    name: "Pages",
    id: created.body.room.id,
    auth: { clientId: "prince-offline-pages", judgeToken: created.body.judgeToken },
    load: () => JSON.parse(env.DB.rooms.get(created.body.room.id).data),
    save: (room) => { env.DB.rooms.get(created.body.room.id).data = JSON.stringify(room); },
    post: (action, body) => request(env, `/api/rooms/${created.body.room.id}/${action}`, body)
  });
  const nodeApi = require("./helpers/node-room-api")();
  const nodeCreated = await nodeApi.request(null, "/api/rooms", { clientId: "prince-offline-node", mode: "JUDGE", boardId: "realm_of_trickery" });
  fixtures.push({
    name: "Node",
    id: nodeCreated.body.room.id,
    auth: { clientId: "prince-offline-node", judgeToken: nodeCreated.body.judgeToken },
    load: () => JSON.parse(nodeApi.env.DB.rooms.get(nodeCreated.body.room.id).data),
    save: (room) => { nodeApi.env.DB.rooms.get(nodeCreated.body.room.id).data = JSON.stringify(room); },
    post: (action, body) => nodeApi.request(null, `/api/rooms/${nodeCreated.body.room.id}/${action}`, body)
  });

  for (const fixture of fixtures) {
    const room = fixture.load();
    room.phase = "DAY";
    room.night = 1;
    room.assignments = room.seats.map(({ seat }) => ({ seat, roleId: seat === 2 ? "order_prince" : "villager", camp: "GOOD", alive: true, abilityState: {} }));
    room.nightActions = [{ night: 1, stepId: "trickster_swap", targetSeats: [1, 11], skipped: false }];
    room.deathRecords = [{ day: 1, phase: "DAYBREAK", seats: [] }];
    fixture.save(room);

    const firstResult = await fixture.post("exile-record", { ...fixture.auth, seat: 11, noExile: false });
    assert.equal(firstResult.status, 200, `${fixture.name}: ${JSON.stringify(firstResult.body)}`);
    const activated = await fixture.post("order-prince-activate", fixture.auth);
    assert.equal(activated.status, 200, `${fixture.name}: ${JSON.stringify(activated.body)}`);
    assert.equal(activated.body.room.orderPrinceRevotePending, true);

    const missingRevoteFlag = await fixture.post("exile-record", { ...fixture.auth, seat: 11, noExile: false });
    assert.equal(missingRevoteFlag.status, 400, `${fixture.name}: must explicitly mark the post-rewind result`);
    const finalResult = await fixture.post("exile-record", { ...fixture.auth, seat: 11, noExile: false, orderPrinceRevote: true });
    assert.equal(finalResult.status, 200, `${fixture.name}: ${JSON.stringify(finalResult.body)}`);
    assert.equal(finalResult.body.room.orderPrinceRevotePending, false);
    assert.equal(finalResult.body.room.exileRecords.at(-1).source, "ORDER_PRINCE_REVOTE");
    assert.equal(finalResult.body.room.exileRecords.at(-1).rawSeat, 11);
    assert.equal(finalResult.body.room.exileRecords.at(-1).seat, 1);
    assert.equal(fixture.load().assignments.find((item) => item.seat === 1).alive, false);
    assert.equal(fixture.load().assignments.find((item) => item.seat === 11).alive, true);
    assert.equal(fixture.load().assignments.find((item) => item.seat === 2).alive, true);
  }
});

test("Pages fixed night requires voice ack, rejects early advancement and holds submitted actions", async () => {
  const env = { DB: new MemoryD1() };
  const created = await request(env, '/api/rooms', { clientId: 'fixed-controller', mode: 'SYSTEM', boardId: 'pre_witch_hunter_idiot_mixed', fixedNightFlow: 1 });
  const id = created.body.room.id;
  const auth = { clientId: 'fixed-controller', judgeToken: created.body.judgeToken };
  const stored = env.DB.rooms.get(id);
  const room = JSON.parse(stored.data);
  room.phase = 'DEALT'; room.night = 1;
  room.assignments = room.seats.map(({seat}) => ({ seat, roleId: seat === 1 ? 'mixed_blood' : seat === 2 ? 'wolf' : seat === 3 ? 'witch' : seat === 4 ? 'seer' : 'villager', camp: seat === 2 ? 'WOLF' : 'GOOD', alive: true, abilityState: {} }));
  room.night = 0;
  room.seats.forEach(s => { s.clientId = `fixed-player-${s.seat}`; s.occupied = true; });
  stored.data = JSON.stringify(room);
  const started = await request(env, `/api/rooms/${id}/night-start`, auth);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const key = started.body.room.systemNight.timing.key;
  const blocked = await request(env, `/api/rooms/${id}/night-action`, {clientId:'fixed-player-1',targetSeats:[2]});
  assert.equal(blocked.status,409);
  assert.equal((await request(env, `/api/rooms/${id}/system-fixed-night`, {...auth, operation:'ack',stepKey:key})).status,200);
  assert.equal((await request(env, `/api/rooms/${id}/system-fixed-night`, {...auth, operation:'advance',stepKey:key})).status,409);
  const submitted = await request(env, `/api/rooms/${id}/night-action`, {clientId:'fixed-player-1',targetSeats:[2]});
  assert.equal(submitted.status,200,JSON.stringify(submitted.body));
  let current = JSON.parse(env.DB.rooms.get(id).data);
  assert.equal(current.currentNightStepIndex,0);
  assert.equal(current.nightActions.filter(a=>a.stepId==='mixed_blood_model').length,1);
  current.fixedNightTiming.deadlineAt = Date.now()-1;
  env.DB.rooms.get(id).data=JSON.stringify(current);
  assert.equal((await request(env, `/api/rooms/${id}/system-fixed-night`, {...auth,operation:'advance',stepKey:key})).status,200);
  assert.equal((await request(env, `/api/rooms/${id}/system-fixed-night`, {...auth,operation:'ack',stepKey:key})).status,409);
});

test('Pages day voice gates anonymous death windows and rejects unauthorized or premature ack', async () => {
  const env={DB:new MemoryD1()};
  const created=await request(env,'/api/rooms',{clientId:'day-controller',mode:'SYSTEM',boardId:'pre_witch_hunter_idiot_mixed',fixedNightFlow:1});
  const id=created.body.room.id;
  const auth={clientId:'day-controller',judgeToken:created.body.judgeToken};
  const stored=env.DB.rooms.get(id), room=JSON.parse(stored.data);
  room.phase='DAY'; room.night=1;
  room.assignments=[{seat:1,roleId:'wolf',camp:'WOLF',alive:true},{seat:2,roleId:'villager',camp:'GOOD',alive:false},{seat:3,roleId:'seer',camp:'GOOD',alive:true},{seat:4,roleId:'villager',camp:'GOOD',alive:true}];
  room.pendingDeathSkills=[{seat:2,day:1,eligible:false,createdAt:100,deadlineAt:Date.now()-1000}];
  room.seats[1].clientId='day-player-2'; room.seats[1].occupied=true;
  stored.data=JSON.stringify(room);
  const view=await request(env,`/api/rooms/${id}`,null,{"X-Client-Id":"day-controller",Authorization:`Bearer ${created.body.judgeToken}`});
  const key=view.body.room.daySkillVoice.key;
  assert.equal(view.body.room.systemSkillDeadlineAt,0);
  assert.equal((await request(env,`/api/rooms/${id}/death-skill`,{clientId:'day-player-2',seat:2,targetSeat:1})).status,403);
  assert.equal((await request(env,`/api/rooms/${id}/system-skill-timeout`,auth)).status,409);
  assert.equal((await request(env,`/api/rooms/${id}/system-day-voice`,{clientId:'stranger',operation:'ack',windowKey:key})).status,403);
  assert.equal((await request(env,`/api/rooms/${id}/system-day-voice`,{...auth,operation:'ack',windowKey:key})).status,200);
  assert.equal((await request(env,`/api/rooms/${id}/system-day-voice`,{...auth,operation:'finish',windowKey:key})).status,409);
});

test('new fixed flow completes two nights and daytime for all three boards', async () => {
  const boards={
    pre_witch_hunter_idiot_mixed:['mixed_blood','witch','seer','hunter','idiot','villager','villager','villager','wolf','wolf','wolf','wolf'],
    realm_of_trickery:['trickster','magician','witch','seer','order_prince','villager','villager','villager','villager','wolf','wolf','wolf'],
    mechanical_wolf_spirit_medium:['mechanical_wolf','guard','witch','spirit_medium','hunter','villager','villager','villager','villager','wolf','wolf','wolf']
  };
  for(const [boardId,roles] of Object.entries(boards)) {
    const env={DB:new MemoryD1()};
    const created=await request(env,'/api/rooms',{clientId:'harness-controller',mode:'SYSTEM',boardId,fixedNightFlow:1});
    const id=created.body.room.id, auth={clientId:'harness-controller',judgeToken:created.body.judgeToken};
    const load=()=>JSON.parse(env.DB.rooms.get(id).data);
    const save=r=>{env.DB.rooms.get(id).data=JSON.stringify(r);};
    const r=load(); r.phase='DEALT'; r.night=0;
    r.assignments=roles.map((roleId,i)=>({seat:i+1,roleId,camp:['wolf','trickster','mechanical_wolf'].includes(roleId)?'WOLF':'GOOD',alive:true,abilityState:{}}));
    r.seats.forEach(s=>{s.clientId=`harness-${s.seat}`;s.occupied=true;});save(r);
    async function post(action,payload=auth) {
      const result=await request(env,`/api/rooms/${id}/${action}`,payload);
      assert.equal(result.status,200,`${boardId}/${action}: ${JSON.stringify(result.body)}`); return result.body.room;
    }
    for(let night=1;night<=2;night++) {
      await post('night-start');
      for(let guard=0;guard<60;guard++) {
        let current=load(); const clock=current.fixedNightTiming;
        if(!clock) break;
        const step=current.currentNightSteps[current.currentNightStepIndex];
        if(['GAP','ANNOUNCEMENT'].includes(clock.phase)) {
          clock.readyAt=0;save(current);
          await post('system-fixed-night',{...auth,operation:'ack',stepKey:clock.key});
        }
        current=load();
        if(current.fixedNightTiming.phase!=='FINAL' && !current.fixedNightTiming.submitted && !step.inactive) {
          const actor=current.assignments.find(a=>a.alive!==false && (step.actor==='wolf_team'?a.roleId==='wolf':a.roleId===step.actor));
          if(actor) {
            let payload={clientId:`harness-${actor.seat}`,targetSeats:[],skipped:false};
            if(step.id==='witch_action') Object.assign(payload,{antidoteUsed:false,poisonTargetSeat:0});
            else if(step.allowSkip) payload.skipped=true;
            if(step.id==='trickster_swap') {payload.skipped=false;payload.targetSeats=step.allowedSeats.slice(0,2);}
            else if(step.id==='mechanical_mimic') payload.targetSeats=[roles.indexOf('guard')+1];
            else if(step.targetCount && !payload.skipped) payload.targetSeats=current.assignments.filter(a=>a.alive!==false && a.seat!==actor.seat).slice(0,step.targetCount).map(a=>a.seat);
            await post('night-action',payload);
          }
        }
        current=load();current.fixedNightTiming.deadlineAt=Date.now()-1;current.fixedNightTiming.leaseUntil=0;save(current);
        await post('system-fixed-night',{...auth,operation:'advance',stepKey:clock.key});
      }
      assert.equal(load().fixedNightTiming,null,boardId+' night did not finish');
      await post('night-finish'); await post('system-publish-daybreak');
      const outcome=await post('exile-record',{...auth,noExile:true,seat:0});
      if(outcome.pendingExileResult) await post('order-prince-decline');
      assert.equal(load().systemDayOutcomeRecordedDay,night);
    }
    await post('game-end');assert.equal(load().phase,'GAME_OVER');
  }
});

test('unavailable archangel keeps anonymous revival window without granting revival', async () => {
  for(const mode of ['JUDGE','SYSTEM']) {
    const env={DB:new MemoryD1()};
    const created=await request(env,'/api/rooms',{clientId:'angel-controller',mode,boardId:'dark_destruction_2',fixedNightFlow:1});
    const id=created.body.room.id, auth={clientId:'angel-controller',judgeToken:created.body.judgeToken};
    const stored=env.DB.rooms.get(id),room=JSON.parse(stored.data);
    room.phase='DAY';room.night=1;
    room.assignments=room.seats.map(({seat})=>({seat,roleId:seat===1?'archangel':seat===3?'wolf':'villager',camp:seat===3?'WOLF':'GOOD',alive:true,abilityState:{}}));
    room.nightActions=[{night:1,stepId:'lilith_bind',targetSeats:[1]}];
    room.pendingNightResolution={deaths:[{seat:2,reasons:['狼刀']}],delayedDeaths:[]};
    stored.data=JSON.stringify(room);
    const published=await request(env,`/api/rooms/${id}/${mode==='JUDGE'?'death-record':'system-publish-daybreak'}`,{...auth,seats:[2]});
    assert.equal(published.status,200,JSON.stringify(published.body));
    const pending=JSON.parse(env.DB.rooms.get(id).data).pendingArchangelRevival;
    assert.equal(pending.virtual,true);
    assert.ok(pending);
    const denied=await request(env,`/api/rooms/${id}/archangel-revival`,{...auth,use:true});
    assert.equal(denied.status,mode==='JUDGE'?400:403);
    assert.ok(JSON.parse(env.DB.rooms.get(id).data).pendingArchangelRevival,'invalid request must preserve window');
    if(mode==='JUDGE') assert.equal((await request(env,`/api/rooms/${id}/archangel-revival`,{...auth,use:false})).status,200);
  }
});

async function sheriffSelfServiceFixture(useNode = false) {
  const local = useNode ? require("./helpers/node-room-api")() : null;
  const env = local ? local.env : { DB: new MemoryD1() };
  const send = local
    ? (path, body = null) => local.request(null, path, body)
    : (path, body = null) => request(env, path, body);
  const created = await send("/api/rooms", {
    clientId: "sheriff-judge",
    mode: "JUDGE",
    boardId: "pre_witch_hunter_idiot_mixed"
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const id = created.body.room.id;
  const auth = { clientId: "sheriff-judge", judgeToken: created.body.judgeToken };
  const record = env.DB.rooms.get(id);
  const room = JSON.parse(record.data);
  room.phase = "DAY";
  room.night = 1;
  room.assignments = room.seats.map(({ seat }) => ({
    seat,
    roleId: seat === 12 ? "hunter" : "villager",
    camp: "GOOD",
    alive: seat !== 12,
    abilityState: {}
  }));
  room.seats.forEach((seat) => {
    seat.clientId = `sheriff-player-${seat.seat}`;
    seat.occupied = true;
  });
  room.sheriffCandidates = [];
  room.sheriffWithdrawn = [];
  room.sheriffWithdrawOpenDay = 0;
  room.sheriffElectionDone = false;
  room.sheriffStageClosedDay = 0;
  room.sheriffBadge = { holderSeat: 0, lost: false };
  record.data = JSON.stringify(room);
  return {
    env,
    id,
    auth,
    load: () => JSON.parse(env.DB.rooms.get(id).data),
    post: (action, body) => send(`/api/rooms/${id}/${action}`, body)
  };
}

async function assertSheriffSelfService(useNode) {
  const f = await sheriffSelfServiceFixture(useNode);
  const staleRevision = f.load().revision;
  const registrations = await Promise.all(Array.from({ length: 11 }, (_, index) => f.post("sheriff-self-candidate", {
    clientId: `sheriff-player-${index + 1}`,
    day: 1,
    expectedRevision: staleRevision
  })));
  assert.ok(registrations.every((result) => result.status === 200), JSON.stringify(registrations.map((result) => result.body)));
  assert.deepEqual(f.load().sheriffCandidates, Array.from({ length: 11 }, (_, index) => index + 1));
  assert.equal(f.load().logs.filter((entry) => entry.type === "SHERIFF_SELF_REGISTERED").length, 11);

  const observer = await f.post("join", { clientId: "sheriff-player-9" });
  assert.deepEqual(observer.body.room.sheriffCandidates, f.load().sheriffCandidates);
  assert.equal(observer.body.room.sheriffWithdrawOpenDay, 0);

  const deadPlayer = await f.post("sheriff-self-candidate", { clientId: "sheriff-player-12", day: 1 });
  assert.equal(deadPlayer.status, 400);
  const restoreRoom = f.load();
  restoreRoom.assignments.find((item) => item.seat === 12).alive = true;
  f.env.DB.rooms.get(f.id).data = JSON.stringify(restoreRoom);
  const unauthenticated = await f.post("sheriff-self-candidate", { clientId: "not-seated", day: 1 });
  assert.equal(unauthenticated.status, 400);

  const beforeWithdraw = await f.post("sheriff-self-withdraw", { clientId: "sheriff-player-1", day: 1 });
  assert.equal(beforeWithdraw.status, 409);
  const wrongOpener = await f.post("sheriff-withdraw-open", { clientId: "sheriff-player-2", day: 1 });
  assert.equal(wrongOpener.status, 403);

  const opened = await f.post("sheriff-withdraw-open", { ...f.auth, expectedRevision: f.load().revision });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.room.sheriffWithdrawOpenDay, 1);
  const lateCandidate = await f.post("sheriff-self-candidate", { clientId: "sheriff-player-12", day: 1 });
  assert.equal(lateCandidate.status, 409);
  const nonCandidateWithdraw = await f.post("sheriff-self-withdraw", { clientId: "sheriff-player-12", day: 1 });
  assert.equal(nonCandidateWithdraw.status, 400);

  const withdrawn = await f.post("sheriff-self-withdraw", {
    clientId: "sheriff-player-1",
    day: 1,
    expectedRevision: staleRevision
  });
  assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
  assert.deepEqual(withdrawn.body.room.sheriffWithdrawn, [1]);
  const duplicate = await f.post("sheriff-self-withdraw", { clientId: "sheriff-player-1", day: 1 });
  assert.equal(duplicate.status, 200);
  assert.equal(f.load().logs.filter((entry) => entry.type === "SHERIFF_SELF_WITHDRAWN").length, 1);
  assert.deepEqual(f.load().sheriffCandidates, Array.from({ length: 11 }, (_, index) => index + 1));
}

async function assertSheriffDeferredPreservesCandidates(useNode, withdrawWasOpen) {
  const f = await sheriffSelfServiceFixture(useNode);
  const room = f.load();
  room.assignments[0] = { seat: 1, roleId: "wolf", camp: "WOLF", alive: true, abilityState: {} };
  room.sheriffCandidates = [2, 3, 4];
  room.sheriffWithdrawn = [3];
  room.sheriffWithdrawOpenDay = withdrawWasOpen ? 1 : 0;
  room.sheriffElectionDone = false;
  room.sheriffStageClosedDay = 0;
  room.sheriffBadge = { holderSeat: 0, lost: false };
  f.env.DB.rooms.get(f.id).data = JSON.stringify(room);

  const exploded = await f.post("sheriff-election-self-destruct", {
    ...f.auth,
    seat: 1,
    expectedRevision: room.revision
  });
  assert.equal(exploded.status, 200, JSON.stringify(exploded.body));
  assert.equal(exploded.body.room.phase, "NIGHT");
  assert.equal(exploded.body.room.night, 2);
  assert.equal(exploded.body.room.sheriffElectionDeferredDay, 1);
  assert.deepEqual(exploded.body.room.sheriffCandidates, [2, 3, 4]);
  assert.deepEqual(exploded.body.room.sheriffWithdrawn, [3]);
  assert.equal(exploded.body.room.sheriffWithdrawOpenDay, withdrawWasOpen ? 2 : 0);

  const deferredDay = f.load();
  deferredDay.phase = "DAY";
  deferredDay.night = 2;
  deferredDay.sheriffElectionDone = false;
  deferredDay.sheriffStageClosedDay = 0;
  f.env.DB.rooms.get(f.id).data = JSON.stringify(deferredDay);
  const observer = await f.post("join", { clientId: "sheriff-player-9" });
  assert.equal(observer.status, 200, JSON.stringify(observer.body));
  assert.deepEqual(observer.body.room.sheriffCandidates, [2, 3, 4]);
  assert.deepEqual(observer.body.room.sheriffWithdrawn, [3]);

  const withdrawal = await f.post("sheriff-self-withdraw", { clientId: "sheriff-player-2", day: 2 });
  assert.equal(withdrawal.status, withdrawWasOpen ? 200 : 409, JSON.stringify(withdrawal.body));
}

test("Pages D1 synchronizes judge-mode self-registration and withdrawal under concurrent submits", async () => {
  await assertSheriffSelfService(false);
});

test("Node API synchronizes judge-mode self-registration and withdrawal under concurrent submits", async () => {
  await assertSheriffSelfService(true);
});

test("Pages D1 preserves active sheriff candidates and withdrawal stage when first election is deferred", async () => {
  await assertSheriffDeferredPreservesCandidates(false, true);
  await assertSheriffDeferredPreservesCandidates(false, false);
});

test("Node API preserves active sheriff candidates and withdrawal stage when first election is deferred", async () => {
  await assertSheriffDeferredPreservesCandidates(true, true);
  await assertSheriffDeferredPreservesCandidates(true, false);
});
