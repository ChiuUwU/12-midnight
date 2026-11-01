const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let onRequestPromise;

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
  const view=await request(f.env,`/api/rooms/${f.id}?clientId=${f.auth.clientId}&judgeToken=${f.auth.judgeToken}`),key=view.body.room.daySkillVoice.key,revision=room.revision;
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

async function request(env, path, body = null) {
  const onRequest = await loadPagesFunction();
  const response = await onRequest({
    request: new Request(`https://unit.test${path}`, {
      method: body === null ? "GET" : "POST",
      headers: body === null ? {} : { "Content-Type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body)
    }),
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

  const observer = await request(env, `/api/rooms/${id}?clientId=observer`);
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
  const observer = await request(env, `/api/rooms/${id}?clientId=observer`);
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
    const before = await request(env, `/api/rooms/${id}?clientId=player-1`);
    assert.equal(before.body.room.systemNight.canAct, false, boardId);
    assert.equal((await request(env, `/api/rooms/${id}/night-action`, { clientId: "player-1", targetSeats: [12] })).status, 403, boardId);
    room.assignments[1].alive = false;
    stored.data = JSON.stringify(room);
    const after = await request(env, `/api/rooms/${id}?clientId=player-1`);
    assert.equal(after.body.room.systemNight.canAct, true, boardId);
    const other = await request(env, `/api/rooms/${id}?clientId=player-3`);
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
  const view=await request(env,`/api/rooms/${id}?clientId=day-controller&judgeToken=${created.body.judgeToken}`);
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
