(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.JudgeFlow=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function reason(room,step){
    if(room?.mode!=='JUDGE' && !(room?.mode==='SYSTEM'&&room.fixedNightFlow===1))return '';
    const assignments=room.assignments||[],actions=room.nightActions||[];
    const actor=assignments.find(a=>a.roleId===step.actor);
    if(step.actor==='wolf_team'){
      if(!assignments.some(a=>a.alive!==false&&(a.currentCamp||a.camp)==='WOLF'))return '狼人已全部出局';
    }else if(assignments.length&&(!actor||actor.alive===false))return step.actor==='lilith'?'莉莉丝已出局':'该身份已出局或不在本局';
    if(room.boardId==='dark_destruction_2'&&step.actor!=='wolf_team'&&step.id!=='dreamer_dream'){
      const bind=actions.find(a=>a.night===room.night&&a.stepId==='lilith_bind'&&!a.skipped);
      if(actor&&bind?.targetSeats?.includes(actor.seat))return '本夜被禁锢';
    }
    const used=id=>actions.some(a=>a.stepId===id&&!a.skipped);
    if(step.id==='witch_action'&&!step.antidoteAvailable&&!step.poisonAvailable)return '药剂已用完';
    if(step.id==='archangel_bless'&&used('archangel_bless'))return '祝福已使用';
    if(step.id==='lia_charge'&&actions.some(a=>a.stepId==='lia_charge'&&a.success))return '已经充能成功';
    if(step.id==='poisoner_poison'&&used('poisoner_poison'))return '毒药已使用';
    if(step.inactive)return step.inactiveReason||'本夜没有可发动的技能或合法目标';
    return '';
  }
  function finish(room,steps){return steps.map(step=>{const why=reason(room,step);return why?{...step,inactive:true,inactiveReason:why,unavailableReason:why,allowSkip:true,targetCount:0,needsCard:false}:step;});}
  function build(room,night,make){
    const actual=make({...room,_fixedJudgeTemplate:true});
    if(room.treasureMaskedFinalNight?.status==='PENDING')return actual;
    const baseline=make({...room,_fixedJudgeTemplate:true,
      assignments:(room.assignments||[]).map(a=>({...a,alive:true})),
      nightActions:(room.nightActions||[]).filter(a=>a.stepId==='mechanical_mimic')});
    return finish(room,baseline.map((step,index)=>{
      const match=actual.find(s=>s.id===step.id)||(step.id==='mechanical_skill_wait'?actual.find(s=>/^mechanical_(guard|poison|check|kill)$/.test(s.id)):null);
      return {...(match||{...step,inactive:true}),label:step.id==='mechanical_skill_wait'?'机械狼技能夜':step.label,index};
    }));
  }
  return {reason,finish,build};
});
