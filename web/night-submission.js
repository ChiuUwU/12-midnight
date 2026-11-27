(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NightSubmission=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function token(room){return `${room.night}:${room.nightActionEpoch||0}:${room.fixedNightTiming?.key||''}:${room.currentNightSteps?.[room.currentNightStepIndex||0]?.id||''}`;}
  function fingerprint(body){return JSON.stringify([body.actionToken||'',body.targetSeats||[],Boolean(body.skipped),body.cardRoleId||'',body.windDirection||'',Boolean(body.antidoteUsed),Number(body.antidoteTargetSeat||0),Number(body.poisonTargetSeat||0)]);}
  function replay(room,body,clientId){
    if(!body.nightRequestId)return null;
    if(typeof body.nightRequestId!=='string'||body.nightRequestId.length>128)return {error:'无效的夜间提交标识'};
    const old=(room.nightSubmissionReceipts||[]).find(r=>r.id===body.nightRequestId&&r.clientId===clientId);
    if(!old)return null;
    return old.fingerprint===fingerprint(body)?{privateResult:old.privateResult||null}:{error:'同一次提交不能更改号码，请使用新的确认操作'};
  }
  function remember(room,body,clientId,privateResult=null){
    if(!body.nightRequestId)return;
    room.nightSubmissionReceipts=[...(room.nightSubmissionReceipts||[]),{id:body.nightRequestId,clientId,night:room.night,fingerprint:fingerprint(body),privateResult}].slice(-64);
  }
  return {token,replay,remember};
});
