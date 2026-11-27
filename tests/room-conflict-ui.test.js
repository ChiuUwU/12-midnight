const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

async function client(nextStep='wolves_kill') {
  let renders=0,posts=0,initial=true;
  const seats=Array.from({length:12},(_,i)=>({seat:i+1,occupied:true}));
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',fixedNightFlow:1,nightFlowVersion:2,phase:'NIGHT',night:2,revision:3,
    isJudge:false,isController:false,mySeat:seats[0],seats,assignments:[{seat:1,roleId:'wolf',camp:'WOLF',alive:true,abilityState:{}}],aliveSeats:seats.map(s=>s.seat),nightActions:[],logs:[],deathRecords:[],exileRecords:[],
    currentNightSteps:[{id:'wolves_kill',label:'狼人选择目标',targetCount:1,allowSkip:true}],currentNightStepIndex:0,systemNight:{canAct:true,canControl:false}};
  const app={className:'app',get innerHTML(){return '';},set innerHTML(v){renders++;},addEventListener(){},querySelector:s=>s.includes('.seat.selected')?{}:null,querySelectorAll:()=>[]};
  const saved={view:'night',currentUserId:'p1',currentRoomId:room.id,judgeTokens:{},rooms:{}};
  const context={document:{querySelector:()=>app,body:{classList:{toggle(){}}},addEventListener(){}},location:{protocol:'https:',origin:'https://unit.test',pathname:'/',search:''},
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}},crypto:webcrypto,URLSearchParams,Image:class{},console,setTimeout(){},clearTimeout(){},setInterval(){},
    fetch:async(url,options={})=>{if(options.method==='POST'){posts++;return {ok:false,status:409,text:async()=>JSON.stringify({error:'房间状态已更新，请刷新后重试'})};}
      const view=JSON.parse(JSON.stringify(room));if(!initial){view.revision++;view.currentNightSteps[0].id=nextStep;}initial=false;return {ok:true,status:200,text:async()=>JSON.stringify({room:view})};}};
  context.window=context;
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8').replace('  async function remotePost(action, payload = {}) {','  window.testRemotePost = remotePost;\n  async function remotePost(action, payload = {}) {');
  vm.runInNewContext(source,context);await new Promise(setImmediate);await new Promise(setImmediate);
  const before=renders;await assert.rejects(context.testRemotePost('night-action',{targetSeats:[3]}),e=>e.status===409);
  return {before,after:renders,posts};
}
test('409 refresh preserves an unfinished selection in the same night step without resubmitting',async()=>{const r=await client();assert.equal(r.after,r.before);assert.equal(r.posts,1);});
test('409 refresh discards the old selection when the actionable step changes',async()=>{const r=await client('hunter_confirm');assert.ok(r.after>r.before);assert.equal(r.posts,1);});

test('an ambiguous night response retries with the original request identity',async()=>{
  const submissions=[];
  let loseSeatResponses=false,loseGetResponses=false;
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',fixedNightFlow:1,nightFlowVersion:2,phase:'NIGHT',night:2,revision:3,
    isJudge:false,isController:false,mySeat:{seat:1,occupied:true},seats:Array.from({length:12},(_,i)=>({seat:i+1,occupied:true})),assignments:[{seat:1,roleId:'wolf',camp:'WOLF',alive:true,abilityState:{}}],aliveSeats:Array.from({length:12},(_,i)=>i+1),nightActions:[],logs:[],deathRecords:[],exileRecords:[],
    currentNightSteps:[{id:'wolves_kill',label:'狼人选择目标',targetCount:1,allowSkip:true}],currentNightStepIndex:0,systemNight:{canAct:true,canControl:false,actionToken:'2:0:2:1:wolves_kill'}};
  const app={className:'app',innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const saved={view:'night',currentUserId:'p1',currentRoomId:room.id,judgeTokens:{},rooms:{}};
  const context={document:{querySelector:()=>app,body:{classList:{toggle(){}}},addEventListener(){}},location:{protocol:'https:',origin:'https://unit.test',pathname:'/',search:''},
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}},crypto:webcrypto,URLSearchParams,Image:class{},console,setTimeout,clearTimeout,setInterval(){},
    fetch:async(url,options={})=>{if(options.method==='POST'){submissions.push(JSON.parse(options.body));if(loseSeatResponses&&url.endsWith('/seat'))throw new TypeError('response lost');return submissions.length===1?{ok:true,status:200,text:async()=>url.endsWith('/seat')?'{}':''}:{ok:true,status:200,text:async()=>JSON.stringify({room})};}
      if(loseGetResponses)throw new TypeError('offline');return {ok:true,status:200,text:async()=>JSON.stringify({room})};}};
  context.window=context;
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8').replace('  async function remotePost(action, payload = {}) {','  window.testRemotePost = remotePost;\n  async function remotePost(action, payload = {}) {');
  vm.runInNewContext(source,context);await new Promise(setImmediate);await new Promise(setImmediate);
  await context.testRemotePost('night-action',{targetSeats:[3]});
  assert.equal(submissions.length,2);
  assert.equal(submissions[1].nightRequestId,submissions[0].nightRequestId);
  submissions.length=0;
  await context.testRemotePost('seat',{seat:2,nickname:'我'});
  assert.equal(submissions.length,2,'seat selection should retry safely');
  submissions.length=0;
  await context.testRemotePost('dark-ballot-vote',{targetSeat:0,ballotId:'round-1'});
  assert.equal(submissions.length,2,'ballot vote should retry safely');
  submissions.length=0;
  await assert.rejects(context.testRemotePost('death-record',{seats:[3]}),e=>e.responseAmbiguous);
  assert.equal(submissions.length,1,'a non-idempotent judge record must not be replayed blindly');
  submissions.length=0;
  loseSeatResponses=true;
  room.mySeat={seat:2,occupied:true};
  room.seats[1].occupied=true;
  const recovered=await context.testRemotePost('seat',{seat:2,nickname:'我'});
  assert.equal(recovered.room.mySeat.seat,2,'a committed seat must be recovered after every POST response is lost');
  assert.equal(submissions.length,3,'recovery must remain bounded');
  submissions.length=0;
  loseGetResponses=true;
  await assert.rejects(context.testRemotePost('seat',{seat:3,nickname:'我'}),/提交结果尚未确认/);
  assert.equal(submissions.length,3,'offline requests must not retry forever or claim a result');
});

test('another player taking a waiting-room seat updates seats without rebuilding the room',async()=>{
  let renders=0,poll;
  const seatButtons=Array.from({length:12},(_,index)=>{const classes=new Set(['seat']);return {dataset:{seat:String(index+1)},classList:{toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},disabled:false};});
  const countNode={textContent:''},nextNode={textContent:''},dealButton={disabled:true};
  const app={className:'app',addEventListener(){},set innerHTML(value){renders++;this.html=value;},get innerHTML(){return this.html||'';},
    querySelector(selector){if(selector==='[data-room-occupied-count]')return countNode;if(selector==='[data-room-next-step]')return nextNode;if(selector==='[data-action="deal"]')return dealButton;return null;},
    querySelectorAll(selector){return selector==='[data-action="choose-seat"]'?seatButtons:[];}};
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',nightFlowVersion:2,phase:'WAITING',night:0,revision:1,
    isJudge:false,isController:false,mySeat:null,seats:Array.from({length:12},(_,i)=>({seat:i+1,occupied:false,nickname:''})),assignments:[],logs:[],nightActions:[],deathRecords:[],exileRecords:[]};
  const saved={view:'room',currentUserId:'p1',currentRoomId:room.id,judgeTokens:{},rooms:{}};
  const context={document:{querySelector:()=>app,body:{classList:{toggle(){}}},addEventListener(){}},location:{protocol:'https:',origin:'https://unit.test',pathname:'/',search:''},
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}},crypto:webcrypto,URLSearchParams,Image:class{},console,setTimeout(){},clearTimeout(){},setInterval(callback,delay){if(delay===2500)poll=callback;},
    fetch:async()=>({ok:true,status:200,text:async()=>JSON.stringify({room})})};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8'),context);await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(typeof poll,'function');
  const before=renders;room.seats[6].occupied=true;room.revision++;
  poll();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(renders,before,'seat polling must not replace the whole room DOM');
  assert.equal(seatButtons[6].classList.contains('taken'),true);
  assert.equal(countNode.textContent,'1 / 12');
  room.controllerTransferCode='123456';room.revision++;
  poll();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(renders,before+1,'non-seat changes must still refresh the room view');
});

test('judge writes recover only when the committed deal or death record is visible',async()=>{
  const seats=Array.from({length:12},(_,i)=>({seat:i+1,occupied:true,clientId:`p${i+1}`}));
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'JUDGE',phase:'WAITING',night:0,revision:1,isJudge:true,isController:true,seats,assignments:[],logs:[],nightActions:[],deathRecords:[],exileRecords:[]};
  const app={className:'app',innerHTML:'',addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];}};
  const saved={view:'room',currentUserId:'judge',currentRoomId:room.id,judgeTokens:{[room.id]:'token'},rooms:{}};
  let losePost=false;
  const context={document:{querySelector:()=>app,body:{classList:{toggle(){}}},addEventListener(){}},location:{protocol:'https:',origin:'https://unit.test',pathname:'/',search:''},
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}},crypto:webcrypto,URLSearchParams,Image:class{},console,setTimeout(){},clearTimeout(){},setInterval(){},
    fetch:async(url,options={})=>{if(options.method==='POST'&&losePost)throw new TypeError('response lost');return {ok:true,status:200,text:async()=>JSON.stringify({room})};}};
  context.window=context;
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8').replace('  async function remotePost(action, payload = {}) {','  window.testRemotePost = remotePost;\n  async function remotePost(action, payload = {}) {');
  vm.runInNewContext(source,context);await new Promise(setImmediate);await new Promise(setImmediate);
  losePost=true;
  room.phase='DEALT';room.revision++;room.assignments=seats.map(seat=>({seat:seat.seat,roleId:'villager',camp:'GOOD',alive:true}));
  const deal=await context.testRemotePost('deal');
  assert.equal(deal.recovered,true);
  room.phase='DAY';room.night=1;room.revision++;room.deathRecords=[{day:1,phase:'DAYBREAK',seats:[3]}];
  const death=await context.testRemotePost('death-record',{seats:[3]});
  assert.equal(death.recovered,true);
  await assert.rejects(context.testRemotePost('death-record',{seats:[4]}),/结果尚未确认/);
  room.exileRecords=[{day:1,seat:5,noExile:false}];room.revision++;
  const exile=await context.testRemotePost('exile-record',{seat:5,noExile:false});
  assert.equal(exile.recovered,true);
});
