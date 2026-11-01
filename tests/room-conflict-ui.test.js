const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');

async function client(nextStep='wolves_kill') {
  let renders=0,posts=0,initial=true;
  const seats=Array.from({length:12},(_,i)=>({seat:i+1,occupied:true}));
  const room={id:'123456',boardId:'pre_witch_hunter_idiot_mixed',mode:'SYSTEM',phase:'NIGHT',night:2,revision:3,
    isJudge:false,isController:false,mySeat:seats[0],seats,assignments:[{seat:1,roleId:'wolf',camp:'WOLF',alive:true,abilityState:{}}],aliveSeats:seats.map(s=>s.seat),nightActions:[],logs:[],deathRecords:[],exileRecords:[],
    currentNightSteps:[{id:'wolves_kill',label:'狼人选择目标',targetCount:1,allowSkip:true}],currentNightStepIndex:0,systemNight:{canAct:true,canControl:false}};
  const app={className:'app',get innerHTML(){return '';},set innerHTML(v){renders++;},addEventListener(){},querySelector:s=>s.includes('.seat.selected')?{}:null,querySelectorAll:()=>[]};
  const saved={view:'night',currentUserId:'p1',currentRoomId:room.id,judgeTokens:{},rooms:{}};
  const context={document:{querySelector:()=>app,body:{classList:{toggle(){}}},addEventListener(){}},location:{protocol:'https:',origin:'https://unit.test',pathname:'/',search:''},
    localStorage:{getItem:()=>JSON.stringify(saved),setItem(){}},crypto:webcrypto,URLSearchParams,Image:class{},console,setTimeout(){},clearTimeout(){},setInterval(){},
    fetch:async(url,options={})=>{if(options.method==='POST'){posts++;return {ok:false,status:409,json:async()=>({error:'房间状态已更新，请刷新后重试'})};}
      const view=JSON.parse(JSON.stringify(room));if(!initial){view.revision++;view.currentNightSteps[0].id=nextStep;}initial=false;return {ok:true,json:async()=>({room:view})};}};
  context.window=context;
  const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8').replace('  async function remotePost(action, payload = {}) {','  window.testRemotePost = remotePost;\n  async function remotePost(action, payload = {}) {');
  vm.runInNewContext(source,context);await new Promise(setImmediate);await new Promise(setImmediate);
  const before=renders;await assert.rejects(context.testRemotePost('night-action',{targetSeats:[3]}),e=>e.status===409);
  return {before,after:renders,posts};
}
test('409 refresh preserves an unfinished selection in the same night step without resubmitting',async()=>{const r=await client();assert.equal(r.after,r.before);assert.equal(r.posts,1);});
test('409 refresh discards the old selection when the actionable step changes',async()=>{const r=await client('hunter_confirm');assert.ok(r.after>r.before);assert.equal(r.posts,1);});
