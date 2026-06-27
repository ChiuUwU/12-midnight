const ROLES = {
  seer: {
    id: "seer",
    name: "预言家",
    camp: "GOOD",
    summary: "每晚必须查验一名玩家，获得好人或狼人结果。"
  },
  witch: {
    id: "witch",
    name: "女巫",
    camp: "GOOD",
    summary: "拥有一瓶解药和一瓶毒药。首夜不可自救。"
  },
  hunter: {
    id: "hunter",
    name: "猎人",
    camp: "GOOD",
    summary: "被狼刀或放逐时可开枪；被毒或作为最后一神时不能开枪。"
  },
  idiot: {
    id: "idiot",
    name: "白痴",
    camp: "GOOD",
    summary: "被放逐后出局并公布身份。"
  },
  villager: {
    id: "villager",
    name: "平民",
    camp: "GOOD",
    summary: "无夜间技能，依靠发言和投票帮助好人阵营获胜。"
  },
  wolf: {
    id: "wolf",
    name: "狼人",
    camp: "WOLF",
    summary: "夜间与狼人同伴选择击杀目标，允许空刀。"
  },
  wolf_king: {
    id: "wolf_king",
    name: "狼王",
    camp: "WOLF",
    summary: "出局时可带走一名玩家；被毒或作为最后一狼时不能发动。"
  },
  mixed_blood: {
    id: "mixed_blood",
    name: "混血儿",
    camp: "FOLLOW",
    summary: "首夜选择榜样，胜利条件跟随榜样阵营；预言家查验永远为好人。"
  },
  dancer: {
    id: "dancer",
    name: "舞者",
    camp: "GOOD",
    summary: "自第二夜起选择三名玩家共舞，根据舞池阵营结算死亡。"
  },
  mask: {
    id: "mask",
    name: "假面",
    camp: "WOLF",
    summary: "不与狼人见面；验证舞池并给予面具，面具只影响舞池结算。"
  },
  spirit_medium: {
    id: "spirit_medium",
    name: "通灵师",
    camp: "GOOD",
    summary: "每晚必须查验一名存活玩家的具体身份。"
  },
  poisoner: {
    id: "poisoner",
    name: "毒师",
    camp: "GOOD",
    summary: "拥有一瓶毒药，可夜间毒杀一名玩家。"
  },
  dreamer: {
    id: "dreamer",
    name: "摄梦人",
    camp: "GOOD",
    summary: "每晚必须摄一名玩家；被摄免刀免毒，连续被摄死亡。"
  },
  masked_man: {
    id: "masked_man",
    name: "蒙面人",
    camp: "GOOD",
    summary: "夜间被毒、被摄、被刀时当晚不死，次日自己发言后死亡。"
  },
  mechanical_wolf: {
    id: "mechanical_wolf",
    name: "机械狼",
    camp: "WOLF",
    summary: "夜间模仿一名玩家，不与其他狼人见面，其他狼人出局后方可带刀。"
  },
  treasure_master: {
    id: "treasure_master",
    name: "盗宝大师",
    camp: "WOLF",
    summary: "首夜获得三张盗宝牌；当前固定为狼人阵营。每晚切换一张牌使用技能。"
  },
  guard: {
    id: "guard",
    name: "守卫",
    camp: "GOOD",
    summary: "每晚守护一名玩家，不能连续两晚守同一人。"
  },
  magician: {
    id: "magician",
    name: "魔术师",
    camp: "GOOD",
    summary: "每晚可交换两个号码，换号影响当晚狼刀、毒药和预言家查验。"
  },
  order_prince: {
    id: "order_prince",
    name: "定序王子",
    camp: "GOOD",
    summary: "整局一次，在白天首轮投票结算前发动回溯，额外发言并重新投票。"
  },
  trickster: {
    id: "trickster",
    name: "诡术师",
    camp: "WOLF",
    summary: "每晚可交换两个号码，换号影响次日放逐，且不能连续两晚空换。"
  },
  siren: {
    id: "siren",
    name: "海妖",
    camp: "WOLF",
    summary: "每晚选择风向（无风/顺风/逆风），不可连续两晚相同。与狼人见面，参与刀人。死后风向固定。"
  },
  captain: {
    id: "captain",
    name: "船长",
    camp: "GOOD",
    summary: "第二晚起每晚必须选择一名其他玩家登船。有风时上风向玩家溺亡；无风时登船者免疫狼刀。免疫溺亡。"
  }
};

function getRole(roleId) {
  return ROLES[roleId];
}

function getCampName(camp) {
  return {
    GOOD: "好人阵营",
    WOLF: "狼人阵营",
    FOLLOW: "跟随阵营",
    THIRD: "第三方阵营"
  }[camp] || "未知阵营";
}

module.exports = {
  ROLES,
  getRole,
  getCampName
};
