const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const {BOARDS}=require('../miniprogram/data/boards'),{dealBoard}=require('../miniprogram/utils/deal');
const root=path.resolve(__dirname,'..'),judgeFlow=require('../web/judge-flow');
function browser(savedState=null){
  let renders=0,cancels=0;const intervals=[],listeners={},spoken=[];
  const app={className:'app',markup:'',set innerHTML(v){renders++;this.markup=v},addEventListener(){},querySelector(){return null},querySelectorAll(){return []}};
  const context={document:{hidden:false,querySelector:()=>app,addEventListener:(k,f)=>{listeners[k]=f},body:{classList:{toggle(){}}}},location:{protocol:'https:',search:'',origin:'https://unit.test'},
    localStorage:{getItem:()=>savedState?JSON.stringify(savedState):null,setItem(){}},crypto:require('node:crypto').webcrypto,URLSearchParams,Image:class{},console,setTimeout,clearTimeout,setInterval:(f,ms)=>intervals.push({f,ms}),JudgeFlow:judgeFlow,
    SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:{cancel(){cancels++},speak(u){spoken.push(u);queueMicrotask(()=>u.onend())}},fetch:async()=>{throw new Error('transient-network')}};
  context.window=context;
  let source=fs.readFileSync(path.join(root,'web/app.js'),'utf8').replace('  let state = loadState();','  window.nightSteps=createNightSteps;\n  let state = loadState();');
  source=source.replace('  function createInitialState() {','  window.voiceTest={post:remotePost,token:t=>{renderedNightActionToken=t;},speak:fixedSpeak,night:runFixedNightClock,adopt:adoptRemoteRoom,getRoom:()=>state.remoteRoom,roomId:()=>state.currentRoomId,currentView:()=>state.view,refresh:refreshRemoteRoom,view:v=>{state.view=v;},setRoom:r=>{state.remoteRoom=r;state.currentRoomId=r.id;},error:()=>fixedVoiceError};\n  window.renderRoomForTest=renderRoom;\n  function createInitialState() {');
  vm.runInNewContext(source,context);
  return {context,intervals,listeners,spoken,cancels:()=>cancels,renders:()=>renders,app};
}
function backend(file){
  if(file==='server.js')return require('../server').createRoomService().createNightSteps;
  let source=fs.readFileSync(path.join(root,file),'utf8');
  source=source.replace(/^import (\w+) from "([^"]+)";/gm,(_,name,p)=>`const ${name}=require(${JSON.stringify(path.resolve(path.dirname(path.join(root,file)),p))});`).replace('export async function onRequest','async function onRequest');
  const c={require:createRequire(path.join(root,file)),process,console,Buffer,URL,Response,Request,crypto:globalThis.crypto,__dirname:root};
  vm.runInNewContext(source+'\nglobalThis.nightSteps=createNightSteps;',c);return c.nightSteps;
}
for(const [name,load] of [['browser',()=>browser().context.nightSteps],['Node',()=>backend('server.js')],['Pages',()=>backend('functions/api/rooms/[[path]].js')]]){
  test(`${name}: all nine judge boards retain cue order after death and exhaustion`,()=>{
    const create=load();
    for(const board of BOARDS){
      const assignments=dealBoard(board.id,Array.from({length:12},(_,i)=>i+1));
      const room={boardId:board.id,mode:'JUDGE',night:2,assignments,nightActions:[],seats:assignments.map(a=>({seat:a.seat})),logs:[]};
      const baseline=create(board.id,2,room).map(s=>s.label);
      for(const actor of assignments){
        const changed={...room,assignments:assignments.map(a=>({...a,alive:a.seat!==actor.seat}))};
        const steps=create(board.id,2,changed);assert.deepEqual(Array.from(steps,s=>s.label),Array.from(baseline),board.id+'/'+actor.roleId);
        for(const s of steps.filter(s=>s.actor===actor.roleId))assert.equal(s.inactive,true,board.id+'/'+s.id);
      }
      room.nightActions=[{night:1,stepId:'witch_action',antidoteUsed:true,poisonTargetSeat:3},{night:1,stepId:'poisoner_poison',skipped:false},{night:1,stepId:'archangel_bless',targetSeats:[4],skipped:false},{night:1,stepId:'lia_charge',targetSeats:[6],success:true}];
      assert.deepEqual(Array.from(create(board.id,3,{...room,night:3}),s=>s.label),Array.from(baseline),board.id+' exhausted');
      const first=create(board.id,1,{...room,night:1,nightActions:[]});
      for(const id of ['idiot_confirm','order_prince_confirm','hunter_confirm'])if(first.some(s=>s.id===id))assert.ok(!create(board.id,2,room).some(s=>s.id===id));
    }
  });
}
test('speech finishes without self-cancelling or poisoning later announcements',async()=>{
  const b=browser();await b.context.voiceTest.speak('狼人请睁眼');await b.context.voiceTest.speak('等待玩家发动技能');assert.equal(b.cancels(),0);assert.equal(b.spoken.length,2);
});
test('hiding an idle or player page does not disable future controller speech',()=>{
  const b=browser();b.context.document.hidden=true;b.listeners.visibilitychange();assert.equal(b.context.voiceTest.error(),'');
});
test('one failed heartbeat is not diagnosed as broken speech',async()=>{
  const b=browser();b.context.voiceTest.setRoom({id:'123456',mode:'SYSTEM',fixedNightFlow:1,nightFlowVersion:2,isController:true,phase:'NIGHT',systemNight:{timing:{key:'2:1',phase:'ACTION'}}});
  await b.intervals.find(x=>x.ms===2000).f();assert.equal(b.context.voiceTest.error(),'');
});
test('failed voice acknowledgement retries without replaying completed audio or claiming sound failure',async()=>{
  const b=browser();b.context.voiceTest.setRoom({id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',fixedNightFlow:1,nightFlowVersion:2,night:2,isController:true,phase:'NIGHT',systemNight:{stepId:'wolves_kill',timing:{key:'2:1',phase:'ANNOUNCEMENT',readyAt:0}}});
  await b.context.voiceTest.night();assert.equal(b.spoken.length,1);assert.equal(b.context.voiceTest.error(),'');
  await b.context.voiceTest.night();assert.equal(b.spoken.length,1);assert.equal(b.context.voiceTest.error(),'');
});
test('unchanged polling does not redraw the seating page',async()=>{
  const b=browser();const room={id:'123456',revision:1,phase:'WAITING'};b.context.voiceTest.setRoom(room);b.context.voiceTest.view('room');
  b.context.fetch=async()=>({ok:true,text:async()=>JSON.stringify({room:{...room,serverNow:42}})});const before=b.renders();b.intervals.find(x=>x.ms===2500).f();await new Promise(setImmediate);assert.equal(b.renders(),before);
  assert.equal(b.context.voiceTest.getRoom().serverNow,42);
});

test('startup network failure keeps the saved room for retry',async()=>{
  const b=browser({currentUserId:'user-reconnect',currentRoomId:'123456',view:'room'});
  await new Promise(setImmediate);
  assert.equal(b.context.voiceTest.roomId(),'123456');
  assert.equal(b.context.voiceTest.currentView(),'room');
  assert.match(b.app.markup,/重试连接/);
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',nightFlowVersion:2,revision:1,phase:'WAITING',night:0,
    seats:Array.from({length:12},(_,i)=>({seat:i+1,occupied:false})),assignments:[],sheriffBadge:{holderSeat:0,lost:false}};
  b.context.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({room})});
  b.intervals.find(x=>x.ms===2500).f();
  await new Promise(setImmediate);
  assert.equal(b.context.voiceTest.getRoom().id,'123456');
  assert.doesNotMatch(b.app.markup,/重试连接/);
});

test('out-of-order snapshots cannot roll back an equal revision or the server clock',()=>{
  const b=browser();const room={id:'123456',revision:3,phase:'DAY',serverNow:2000};
  b.context.voiceTest.setRoom(room);
  b.context.voiceTest.adopt({...room,serverNow:1000,phase:'NIGHT'});
  assert.equal(b.context.voiceTest.getRoom().phase,'DAY');
  b.context.voiceTest.adopt({...room,revision:2,serverNow:3000,phase:'NIGHT'});
  assert.equal(b.context.voiceTest.getRoom().revision,3);
  b.context.voiceTest.adopt({...room,serverNow:3000});
  assert.equal(b.context.voiceTest.getRoom().serverNow,3000);
});

test('daytime timeout uses server time rather than a device clock one hour ahead',async()=>{
  const b=browser();const serverNow=Date.now()-3600000;
  const room={id:'123456',revision:1,phase:'DAY',mode:'SYSTEM',mySeat:{seat:1},serverNow,systemSkillDeadlineAt:serverNow+5000};
  b.context.voiceTest.setRoom(room);b.context.voiceTest.adopt(room);
  let requests=0;b.context.fetch=async()=>{requests++;return {ok:true,text:async()=>JSON.stringify({room})};};
  const tick=b.intervals.filter(x=>x.ms===500).at(-1).f;
  tick();await new Promise(setImmediate);assert.equal(requests,0);
  b.context.voiceTest.adopt({...room,serverNow:serverNow+6000});
  tick();await new Promise(setImmediate);assert.equal(requests,1);
});
test('judge-mode players see shared sheriff status and only their own eligible controls',()=>{
  const b=browser();
  const room={id:'sheriff-ui',revision:4,boardId:'pre_witch_hunter_idiot_mixed',mode:'JUDGE',phase:'DAY',night:1,isJudge:false,
    mySeat:{seat:4},seats:Array.from({length:12},(_,i)=>({seat:i+1,occupied:true})),
    assignments:Array.from({length:12},(_,i)=>({seat:i+1,roleId:'villager',camp:'GOOD',alive:true,abilityState:{}})),aliveSeats:Array.from({length:12},(_,i)=>i+1),
    sheriffCandidates:[2,7],sheriffWithdrawn:[7],sheriffWithdrawOpenDay:0,sheriffElectionDone:false,sheriffBadge:{holderSeat:0,lost:false},
    nightActions:[],deathRecords:[],exileRecords:[],logs:[],currentNightSteps:[],currentNightStepIndex:0,dayVoteRecord:null,publicReveals:[]};
  b.context.voiceTest.setRoom(room);b.context.renderRoomForTest();
  assert.match(b.app.markup,/上警玩家[\s\S]*2号、7号/);
  assert.match(b.app.markup,/已退水：7号/);
  assert.match(b.app.markup,/data-action="self-sheriff-candidate"/);
  assert.doesNotMatch(b.app.markup,/data-action="self-withdraw"/);

  room.sheriffCandidates=[2,4,7];room.sheriffWithdrawOpenDay=1;
  b.context.renderRoomForTest();
  assert.match(b.app.markup,/仍在警上：2号、4号/);
  assert.match(b.app.markup,/data-action="self-withdraw"/);
  assert.doesNotMatch(b.app.markup,/data-action="self-sheriff-candidate"/);
});
test('judge sheriff panel gives stage cues and deferred day names only active candidates',()=>{
  const b=browser();
  const room={id:'sheriff-judge-cues',revision:1,boardId:'pre_witch_hunter_idiot_mixed',mode:'JUDGE',phase:'DAY',night:1,isJudge:true,
    mySeat:null,seats:Array.from({length:12},(_,i)=>({seat:i+1,occupied:true})),
    assignments:Array.from({length:12},(_,i)=>({seat:i+1,roleId:i===0?'wolf':'villager',camp:i===0?'WOLF':'GOOD',alive:true,abilityState:{}})),
    aliveSeats:Array.from({length:12},(_,i)=>i+1),sheriffCandidates:[2,7],sheriffWithdrawn:[7],sheriffWithdrawOpenDay:0,
    sheriffElectionDone:false,sheriffStageClosedDay:0,sheriffElectionDeferredDay:0,sheriffBadge:{holderSeat:0,lost:false},
    nightActions:[],deathRecords:[{day:1,phase:'DAYBREAK',seats:[]},{day:2,phase:'DAYBREAK',seats:[]}],exileRecords:[],logs:[],currentNightSteps:[],currentNightStepIndex:0,dayVoteRecord:null,publicReveals:[]};
  b.context.voiceTest.setRoom(room);b.context.renderRoomForTest();
  assert.match(b.app.markup,/警上所有玩家发言结束，退水自爆环节，5、4、3、2、1/);

  room.night=2;room.sheriffElectionDeferredDay=1;room.sheriffWithdrawOpenDay=2;
  b.context.renderRoomForTest();
  assert.match(b.app.markup,/延期竞选环节，仍留警上玩家2号/);
  assert.doesNotMatch(b.app.markup,/延期竞选环节，仍留警上玩家[^<]*7号/);

  room.sheriffCandidates=[2,4,7];room.sheriffWithdrawn=[7];room.sheriffStageClosedDay=2;
  b.context.renderRoomForTest();
  assert.match(b.app.markup,/仍留警上的玩家有2号、4号，请警下玩家投票/);

  room.isJudge=false;
  b.context.renderRoomForTest();
  assert.doesNotMatch(b.app.markup,/延期竞选环节，仍留警上玩家/);
});
test('rapid confirms share one request and network retries reuse its identity',async()=>{
  const b=browser(),room={id:'123456',revision:1,phase:'NIGHT',night:1};b.context.voiceTest.setRoom(room);b.context.voiceTest.token('1:0:1:1:mixed_blood_model');
  let calls=0,release;const sent=[];
  b.context.fetch=async(_,options)=>{calls++;sent.push(JSON.parse(options.body));await new Promise(r=>{release=r;});return {ok:true,status:200,text:async()=>JSON.stringify({room})};};
  const one=b.context.voiceTest.post('night-action',{targetSeats:[3]}),two=b.context.voiceTest.post('night-action',{targetSeats:[3]});
  assert.equal(calls,1);release();await Promise.all([one,two]);
  b.context.fetch=async(_,options)=>{sent.push(JSON.parse(options.body));throw new TypeError('response lost')};
  await assert.rejects(b.context.voiceTest.post('night-action',{targetSeats:[4]}));
  b.context.fetch=async(_,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200,text:async()=>JSON.stringify({room})}};
  await b.context.voiceTest.post('night-action',{targetSeats:[4]});
  assert.equal(sent[1].nightRequestId,sent[2].nightRequestId);assert.equal(sent[1].actionToken,sent[2].actionToken);
});
test('empty successful API responses refresh room state and warn before a possible retry',async()=>{
  const b=browser(),room={id:'123456',revision:2,phase:'DAY'};b.context.voiceTest.setRoom(room);const calls=[];
  b.context.fetch=async(url,options={})=>{calls.push({url,options});return options.method==='POST'
    ? {ok:true,status:204,text:async()=>''}
    : {ok:true,status:200,text:async()=>JSON.stringify({room})};};
  await assert.rejects(b.context.voiceTest.post('finish-game'),error=>error.responseAmbiguous&&/已刷新房间状态/.test(error.message));
  assert.equal(calls.length,2);
  assert.equal(calls[1].options.headers['X-Client-Id']!==undefined,true);
});
