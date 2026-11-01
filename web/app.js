(function () {
  document.title = "最后一夜 Last-Night";
  const STORAGE_KEY = "twelve_midnight_web_state_v1";
  const app = document.querySelector("#app");
  const IS_REMOTE = location.protocol === "http:" || location.protocol === "https:";
  const AUTO_REFRESH_VIEWS = ["room", "identity", "judge", "review", "night", "darkBallot"];
  const PRELOAD_IMAGES = ["assets/app-icon.png"];

  const RANDOM_POOL = new Uint32Array(4096);
  let randomPoolIndex = RANDOM_POOL.length;

  function nextSecureUint32() {
    if (randomPoolIndex >= RANDOM_POOL.length) {
      crypto.getRandomValues(RANDOM_POOL);
      randomPoolIndex = 0;
    }
    const value = RANDOM_POOL[randomPoolIndex];
    randomPoolIndex += 1;
    return value;
  }

  function secureRandomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new Error("随机数范围不合法");
    const maximum = 0x100000000;
    const limit = Math.floor(maximum / maxExclusive) * maxExclusive;
    let value;
    do {
      value = nextSecureUint32();
    } while (value >= limit);
    return value % maxExclusive;
  }

  function createBalanceProfileId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const values = new Uint8Array(16);
    crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function createClientId() {
    return `user-${createBalanceProfileId()}`;
  }

  const DEFAULT_RULES = {
    winCondition: "KILL_SIDE",
    sheriffEnabled: true,
    lastWordsEnabled: true,
    nightDeathLastWords: false,
    witchCanSelfSave: false,
    witchAntidoteCount: 1,
    witchPoisonCount: 1,
    guardCanRepeatTarget: false,
    wolvesCanNoKill: true,
    seerCanSkipCheck: false,
    spiritMediumCanSkipCheck: false,
    tieRule: "PK_THEN_NO_OUT_ON_SECOND_TIE"
  };

  const ROLES = {
    seer: { id: "seer", name: "预言家", camp: "GOOD", image: "assets/roles/illustrated-v2/seer.jpg", summary: "每晚必须查验一名玩家，获得好人或狼人结果。" },
    witch: { id: "witch", name: "女巫", camp: "GOOD", image: "assets/boards/dark_destruction_2/roles/witch.png", summary: "拥有一瓶解药和一瓶毒药。整局不可自救。" },
    hunter: { id: "hunter", name: "猎人", camp: "GOOD", image: "assets/roles/illustrated-v2/hunter.jpg", summary: "被狼刀或放逐时可开枪；被毒或作为最后一神时不能开枪。" },
    idiot: { id: "idiot", name: "白痴", camp: "GOOD", image: "assets/roles/illustrated-v2/idiot.jpg", summary: "被放逐后出局并公布身份。" },
    villager: { id: "villager", name: "平民", camp: "GOOD", image: "assets/boards/dark_destruction_2/roles/villager.png", summary: "无夜间技能，依靠发言和投票帮助好人阵营获胜。" },
    wolf: { id: "wolf", name: "狼人", camp: "WOLF", image: "assets/roles/illustrated-v2/wolf-candidate-20261031.png", summary: "夜间与狼人同伴选择击杀目标，允许空刀。" },
    wolf_king: { id: "wolf_king", name: "狼王", camp: "WOLF", image: "assets/boards/dark_destruction_2/roles/wolf-king.png", summary: "出局时可带走一名玩家；被毒或作为最后一狼时不能发动。" },
    mixed_blood: { id: "mixed_blood", name: "混血儿", camp: "FOLLOW", image: "assets/roles/illustrated-v2/mixed_blood.jpg", summary: "首夜选择榜样，胜利条件跟随榜样阵营；预言家查验永远为好人。" },
    dancer: { id: "dancer", name: "舞者", camp: "GOOD", image: "assets/roles/illustrated-v2/dancer.jpg", summary: "自第二夜起选择三名玩家共舞，根据舞池阵营结算死亡。" },
    mask: { id: "mask", name: "假面", camp: "WOLF", image: "assets/roles/illustrated-v2/mask.jpg", summary: "不与狼人见面；验证舞池并给予面具，面具只影响舞池结算。" },
    spirit_medium: { id: "spirit_medium", name: "通灵师", camp: "GOOD", image: "assets/roles/illustrated-v2/spirit_medium.jpg", summary: "每晚必须查验一名存活玩家的具体身份。" },
    poisoner: { id: "poisoner", name: "毒师", camp: "GOOD", image: "assets/roles/illustrated-v2/poisoner.jpg", summary: "拥有一瓶毒药，可夜间毒杀一名玩家。" },
    dreamer: { id: "dreamer", name: "摄梦人", camp: "GOOD", image: "assets/boards/dark_destruction_2/roles/dreamer.png", summary: "每晚必须摄一名玩家；被摄免刀免毒，连续被摄死亡。" },
    masked_man: { id: "masked_man", name: "蒙面人", camp: "GOOD", image: "assets/roles/illustrated-v2/masked_man.jpg", summary: "夜间被毒、被摄、被刀时当晚不死，次日自己发言后死亡。" },
    mechanical_wolf: { id: "mechanical_wolf", name: "机械狼", camp: "WOLF", image: "assets/roles/illustrated-v2/mechanical_wolf.jpg", summary: "夜间模仿一名玩家，不与其他狼人见面，其他狼人出局后方可带刀。" },
    treasure_master: { id: "treasure_master", name: "盗宝大师", camp: "WOLF", image: "assets/roles/illustrated-v2/treasure_master.jpg", summary: "首夜获得三张盗宝牌；当前固定为狼人阵营。每晚切换一张牌使用技能。" },
    guard: { id: "guard", name: "守卫", camp: "GOOD", image: "assets/roles/illustrated-v2/guard.jpg", summary: "每晚守护一名玩家，不能连续两晚守同一人。" },
    magician: { id: "magician", name: "魔术师", camp: "GOOD", image: "assets/roles/illustrated-v2/magician.jpg", summary: "每晚可交换两个号码，换号影响当晚狼刀、毒药和预言家查验。" },
    order_prince: { id: "order_prince", name: "定序王子", camp: "GOOD", image: "assets/roles/illustrated-v2/order_prince.jpg", summary: "整局一次，在白天首轮投票结算前发动回溯，额外发言并重新投票。" },
    trickster: { id: "trickster", name: "诡术师", camp: "WOLF", image: "assets/roles/illustrated-v2/trickster.jpg", summary: "每晚可交换两个号码，换号影响次日放逐，且不能连续两晚空换。" },
    siren: { id: "siren", name: "海妖", camp: "WOLF", image: "assets/roles/illustrated-v2/siren.jpg", summary: "每晚选择风向（无风/顺风/逆风），不可连续两晚相同。与狼人见面。死后风向固定。" },
    captain: { id: "captain", name: "船长", camp: "GOOD", image: "assets/roles/illustrated-v2/captain.jpg", summary: "第二晚起必须选择一名其他玩家登船。有风时上风向玩家溺亡；无风时登船者免疫狼刀。免疫溺亡。" },
    archangel: { id: "archangel", name: "天使长", camp: "GOOD", image: "assets/boards/dark_destruction_2/roles/angel-leader.png", summary: "祝福与复活各一次；祝福目标当天放逐票变为三票，祝福莉莉丝会使其死亡。被禁锢后永久失去复活能力。" },
    cain: { id: "cain", name: "凯恩", camp: "GOOD", image: "assets/boards/dark_destruction_2/roles/cain.png", summary: "每晚鉴定两名不同玩家的身份类别关系：同类、向下或狼爪；组合含莉娅时固定反馈同类。" },
    lilith: { id: "lilith", name: "莉莉丝", camp: "WOLF", image: "assets/boards/dark_destruction_2/roles/lilith.png", summary: "每晚禁锢一名玩家：目标当夜免伤、当夜与次日不能发动技能，次日不能被放逐。" },
    lia: { id: "lia", name: "莉娅", camp: "WOLF", image: "assets/boards/dark_destruction_2/roles/leah.png", summary: "不与狼队互认。首夜举手确认身份；每晚可尝试对平民充能，成功后可开启一次迷雾。" }
  };

  const BOARDS = [
    {
      id: "pre_witch_hunter_idiot_mixed",
      name: "预女猎白混",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "hunter", count: 1, camp: "GOOD" },
        { roleId: "idiot", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 3, camp: "GOOD" },
        { roleId: "mixed_blood", count: 1, camp: "FOLLOW" },
        { roleId: "wolf", count: 4, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 猎人 · 白痴 · 混血儿 · 平民×3 · 狼人×4",
      tagline: "混血择主，阵营未定。长夜之后，谁与谁同路？",
      globalRules: DEFAULT_RULES
    },
    {
      id: "masquerade",
      name: "假面舞会",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "dancer", count: 1, camp: "GOOD" },
        { roleId: "idiot", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "mask", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 舞者 · 白痴 · 假面 · 平民×4 · 狼人×3",
      tagline: "假面覆面，舞池暗涌。谁在共舞，谁将离场？",
      globalRules: DEFAULT_RULES
    },
    {
      id: "treasure_master",
      name: "盗宝大师",
      playerCount: 12,
      playerSpecialRole: { roleId: "treasure_master", count: 1, camp: "WOLF" },
      deckPool: [
        { roleId: "spirit_medium", count: 1, camp: "GOOD" },
        { roleId: "poisoner", count: 1, camp: "GOOD" },
        { roleId: "hunter", count: 1, camp: "GOOD" },
        { roleId: "dreamer", count: 1, camp: "GOOD" },
        { roleId: "masked_man", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 5, camp: "GOOD" },
        { roleId: "wolf_king", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "通灵师 · 毒师 · 猎人 · 摄梦人 · 蒙面人 · 盗宝大师 · 平民×5 · 狼王 · 狼人×3",
      tagline: "盗宝入局，三牌在手。夜夜换招，步步为局。",
      globalRules: DEFAULT_RULES,
      specialRules: {
        treasureMaster: {
          fixedCards: ["wolf", "villager"],
          godCardPoolExcludes: [],
          allowMaskedManInTreasureCards: true,
          firstNightWolfKillDisabled: true
        }
      }
    },
    {
      id: "mechanical_wolf_spirit_medium",
      name: "机械狼通灵师",
      playerCount: 12,
      roles: [
        { roleId: "spirit_medium", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "hunter", count: 1, camp: "GOOD" },
        { roleId: "guard", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "mechanical_wolf", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "通灵师 · 女巫 · 猎人 · 守卫 · 机械狼 · 平民×4 · 狼人×3",
      tagline: "机械模仿，通灵辨真。借技入夜，局势生变。",
      globalRules: DEFAULT_RULES
    },
    {
      id: "realm_of_trickery",
      name: "诡术之境",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "magician", count: 1, camp: "GOOD" },
        { roleId: "order_prince", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "trickster", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 魔术师 · 定序王子 · 诡术师 · 平民×4 · 狼人×3",
      tagline: "魔幻对决，回溯归零。眼见为虚，真相错位。",
      globalRules: DEFAULT_RULES
    },
    {
      id: "dawn_voyage",
      name: "曙光航纪",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "captain", count: 1, camp: "GOOD" },
        { roleId: "idiot", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "siren", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 船长 · 白痴 · 海妖 · 平民×4 · 狼人×3",
      tagline: "海妖控风，船长掌船。迷雾中航向黎明。",
      globalRules: DEFAULT_RULES
    },
    {
      id: "wolf_king_guard",
      name: "狼王守卫",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "guard", count: 1, camp: "GOOD" },
        { roleId: "hunter", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "wolf_king", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 3, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 守卫 · 猎人 · 平民×4 · 狼王 · 狼人×3",
      tagline: "狼王临场，守卫执夜。席间风起，黑白交锋。",
      globalRules: DEFAULT_RULES
    },
    {
      id: "follow_neighbor",
      name: "唯邻是从",
      playerCount: 12,
      roles: [
        { roleId: "seer", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "guard", count: 1, camp: "GOOD" },
        { roleId: "hunter", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 5, camp: "GOOD" },
        { roleId: "wolf_king", count: 1, camp: "WOLF" },
        { roleId: "wolf", count: 2, camp: "WOLF" }
      ],
      roleSummary: "预言家 · 女巫 · 守卫 · 猎人 · 平民×5 · 狼王 · 狼人×2",
      tagline: "环座相邻，傀儡暗藏。三狼合谋，左右皆疑。",
      globalRules: DEFAULT_RULES
    },
    {
      id: "dark_destruction_2",
      name: "暗黑破坏2.0",
      playerCount: 12,
      roles: [
        { roleId: "archangel", count: 1, camp: "GOOD" },
        { roleId: "cain", count: 1, camp: "GOOD" },
        { roleId: "witch", count: 1, camp: "GOOD" },
        { roleId: "dreamer", count: 1, camp: "GOOD" },
        { roleId: "villager", count: 4, camp: "GOOD" },
        { roleId: "wolf", count: 1, camp: "WOLF" },
        { roleId: "wolf_king", count: 1, camp: "WOLF" },
        { roleId: "lilith", count: 1, camp: "WOLF" },
        { roleId: "lia", count: 1, camp: "WOLF" }
      ],
      roleSummary: "天使长 · 凯恩 · 女巫 · 摄梦人 · 平民×4 · 狼人 · 狼王 · 莉莉丝 · 莉娅",
      tagline: "神恩降临，迷雾蔽票。祝福与禁锢，皆藏代价。",
      globalRules: DEFAULT_RULES
    }
  ];

  const CAMP_NAMES = {
    GOOD: "好人阵营",
    WOLF: "狼人阵营",
    FOLLOW: "跟随阵营",
    THIRD: "第三方阵营"
  };

  const ROLE_MARKS = {
    seer: "星",
    witch: "药",
    hunter: "猎",
    idiot: "白",
    villager: "民",
    wolf: "狼",
    wolf_king: "王",
    mixed_blood: "混",
    dancer: "舞",
    mask: "面",
    spirit_medium: "灵",
    poisoner: "毒",
    dreamer: "梦",
    masked_man: "蒙",
    mechanical_wolf: "械",
    treasure_master: "宝",
    guard: "盾",
    magician: "术",
    order_prince: "序",
    trickster: "诡",
    siren: "妖",
    captain: "船",
    archangel: "天",
    cain: "凯",
    lilith: "莉",
    lia: "娅"
  };

  function preloadRoleImages() {
    const urls = [
      ...PRELOAD_IMAGES,
      ...Object.values(ROLES).map((role) => role.image).filter(Boolean)
    ];
    [...new Set(urls)].forEach((url) => {
      const image = new Image();
      image.src = url;
    });
  }

  function hasUsedNightStep(room, stepId) {
    return (room && room.nightActions || []).some((action) => action.stepId === stepId && !action.skipped);
  }

  function isDarkDestruction(roomOrBoardId) {
    return (typeof roomOrBoardId === "string" ? roomOrBoardId : roomOrBoardId?.boardId) === "dark_destruction_2";
  }

  function darkRoleSeat(room, roleId) {
    return (room?.assignments || []).find((assignment) => assignment.roleId === roleId)?.seat || 0;
  }

  function darkBindingTarget(room, night = room?.night) {
    const action = (room?.nightActions || []).find((item) => item.night === night && item.stepId === "lilith_bind" && !item.skipped);
    return Number(action?.targetSeats?.[0] || 0);
  }

  function isDarkRoleBound(room, roleId, night = room?.night) {
    const seat = darkRoleSeat(room, roleId);
    return Boolean(seat && darkBindingTarget(room, night) === seat);
  }

  function hasSuccessfulLiaCharge(room) {
    return (room?.nightActions || []).some((action) => action.stepId === "lia_charge" && action.success === true);
  }

  function hasUsedArchangelBless(room) {
    return (room?.nightActions || []).some((action) => action.stepId === "archangel_bless" && !action.skipped);
  }

  function hasUsedLiaFog(room) {
    return (room?.nightActions || []).some((action) => action.stepId === "lia_fog" && !action.skipped);
  }

  function hasUsedWitchAntidote(room) {
    return (room && room.nightActions || []).some((action) =>
      (action.stepId === "witch_antidote" && !action.skipped) ||
      (action.stepId === "witch_action" && action.antidoteUsed)
    );
  }

  function hasUsedWitchPoison(room) {
    return (room && room.nightActions || []).some((action) =>
      (action.stepId === "witch_poison" && !action.skipped) ||
      (action.stepId === "witch_action" && Number(action.poisonTargetSeat) > 0)
    );
  }

  function createWitchStep(room) {
    const antidoteAvailable = !hasUsedWitchAntidote(room);
    const poisonAvailable = !hasUsedWitchPoison(room);
    if (!antidoteAvailable && !poisonAvailable) return null;
    return {
      id: "witch_action",
      actor: "witch",
      label: "女巫行动",
      targetCount: 0,
      allowSkip: false,
      antidoteAvailable,
      poisonAvailable,
      singlePotionPerNight: true
    };
  }

  function getUsedSwapSeats(room, stepId) {
    return new Set(
      (room && room.nightActions || [])
        .filter((action) => action.stepId === stepId && !action.skipped)
        .flatMap((action) => action.targetSeats || [])
        .map(Number)
    );
  }

  function getAvailableSwapSeats(room, stepId) {
    const used = getUsedSwapSeats(room, stepId);
    return (room && room.assignments || [])
      .filter((assignment) => assignment.alive !== false && !used.has(assignment.seat))
      .map((assignment) => assignment.seat)
      .sort((left, right) => left - right);
  }

  function didSkipPreviousNight(room, stepId, night) {
    const previous = (room && room.nightActions || []).find((action) => action.night === night - 1 && action.stepId === stepId);
    return Boolean(previous && previous.skipped);
  }

  function getAvailableDanceSeats(room) {
    if (!room) return [];
    const dancedSeats = new Set(
      (room.nightActions || [])
        .filter((action) => action.stepId === "dancer_dance" && !action.skipped)
        .flatMap((action) => action.targetSeats || [])
    );
    return (room.assignments || [])
      .filter((assignment) => assignment.alive !== false && !dancedSeats.has(assignment.seat))
      .map((assignment) => assignment.seat)
      .sort((left, right) => left - right);
  }

  function roleAtTarget(room, action) {
    const seat = action && action.targetSeats && Number(action.targetSeats[0]);
    return (room && room.assignments || []).find((assignment) => assignment.seat === seat)?.roleId || "";
  }

  function previousMechanicalRole(room, night) {
    const action = (room && room.nightActions || []).find((item) => item.night === night - 1 && item.stepId === "mechanical_mimic" && !item.skipped);
    return roleAtTarget(room, action);
  }

  function currentTreasureCard(room, night = room && room.night) {
    return room?.systemNight?.privateContext?.treasureCardRoleId
      || (room && room.nightActions || []).find((item) => item.night === night && item.stepId === "treasure_pick" && !item.skipped)?.cardRoleId
      || "";
  }

  function shouldStartTreasureMaskedFinalNight(room, assignment) {
    return room.boardId === "treasure_master"
      && assignment?.roleId === "treasure_master"
      && currentTreasureCard(room, room.night) === "masked_man"
      && !(room.assignments || []).some((item) => item.alive !== false && ["wolf", "wolf_king"].includes(item.roleId));
  }

  function mechanicalSkillStep(room, night) {
    const roleId = previousMechanicalRole(room, night);
    const configs = {
      guard: { id: "mechanical_guard", label: "机械狼使用守卫技能", allowSkip: true },
      witch: { id: "mechanical_poison", label: "机械狼使用毒药技能", allowSkip: true },
      spirit_medium: { id: "mechanical_check", label: "机械狼查验具体身份", allowSkip: false }
    };
    if (roleId === "wolf") {
      const wolfPartnerAlive = (room.assignments || []).some((assignment) => assignment.alive !== false && assignment.roleId === "wolf");
      return wolfPartnerAlive ? null : { id: "mechanical_kill", actor: "mechanical_wolf", label: "机械狼发动技能刀", targetCount: 1, allowSkip: true, skillRoleId: roleId };
    }
    return configs[roleId] ? { ...configs[roleId], actor: "mechanical_wolf", targetCount: 1, skillRoleId: roleId } : null;
  }

  function shouldIncludeNightStep(room, step) {
    const assignments = room && room.assignments || [];
    if (!assignments.length || step.actor === "system") return true;
    if (room.mode === "JUDGE" && isDarkDestruction(room) && ["lilith_bind", "lia_fog"].includes(step.id)) return true;
    if (step.actor === "wolf_team") return window.WolfKnifePolicy.hasKnifeActor(room.boardId, assignments);
    if (isDarkDestruction(room)) {
      if (step.id !== "lilith_bind" && step.id !== "lia_raise" && step.id !== "dreamer_dream" && isDarkRoleBound(room, step.actor)) return false;
      if (step.id === "lia_charge" && hasSuccessfulLiaCharge(room)) return false;
      if (step.id === "lia_fog" && (!hasSuccessfulLiaCharge(room) || hasUsedLiaFog(room))) return false;
      if (step.id === "archangel_bless" && hasUsedArchangelBless(room)) return false;
    }
    if (step.id === "poisoner_poison" && hasUsedNightStep(room, "poisoner_poison")) return false;
    return assignments.some((assignment) => assignment.alive !== false && assignment.roleId === step.actor);
  }

  function getFollowNeighborPuppetSeats(room) {
    const wolves = (room.assignments || []).filter((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId));
    const wolfSeats = new Set(wolves.map((assignment) => assignment.seat));
    const candidates = new Set();
    wolves.forEach((assignment) => {
      candidates.add(assignment.seat === 1 ? 12 : assignment.seat - 1);
      candidates.add(assignment.seat === 12 ? 1 : assignment.seat + 1);
    });
    return [...candidates].filter((seat) => !wolfSeats.has(seat) && (room.assignments || []).some((assignment) => assignment.seat === seat && assignment.alive !== false)).sort((left, right) => left - right);
  }

  function createNightSteps(boardId, night, room = null) {
    const firstNight = night === 1;
    const steps = [];
    if (room?.treasureMaskedFinalNight?.status === "PENDING") {
      const dreamerAlive = (room.assignments || []).some((item) => item.roleId === "dreamer" && item.alive !== false);
      if (dreamerAlive) steps.push({ id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false });
      steps.push({ id: "treasure_mask_final_kill", actor: "treasure_mask_final", label: "盗宝蒙面狼进行濒死最终刀", targetCount: 1, allowSkip: false });
      return steps;
    }
    if (boardId === "follow_neighbor") {
      const witchStep = createWitchStep(room);
      steps.push({ id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true });
      if (firstNight) steps.push({ id: "puppet_select", actor: "wolf_team", label: "狼人和狼王选择傀儡目标", targetCount: 1, allowSkip: false, allowedSeats: getFollowNeighborPuppetSeats(room) });
      steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人和狼王选择击杀目标", targetCount: 1, allowSkip: true });
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
    } else if (boardId === "dark_destruction_2") {
      const witchStep = createWitchStep(room);
      const lilithInactive = room?.mode === "JUDGE" && (room.assignments || []).some((item) => item.roleId === "lilith" && item.alive === false);
      steps.push({ id: "lilith_bind", actor: "lilith", label: "莉莉丝选择禁锢目标", targetCount: 1, allowSkip: Boolean(lilithInactive), inactive: Boolean(lilithInactive) });
      if (firstNight) steps.push({ id: "lia_raise", actor: "lia", label: "莉娅举手确认身份", targetCount: 0, allowSkip: false });
      steps.push(
        { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择梦游者", targetCount: 1, allowSkip: false },
        { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
      );
      if (witchStep) steps.push(witchStep);
      steps.push(
        { id: "archangel_bless", actor: "archangel", label: "天使长选择是否祝福", targetCount: 1, allowSkip: true },
        { id: "cain_check", actor: "cain", label: "凯恩鉴定两名玩家的身份关系", targetCount: 2, allowSkip: false }
      );
      if (!hasSuccessfulLiaCharge(room)) {
        steps.push({ id: "lia_charge", actor: "lia", label: "莉娅选择充能目标", targetCount: 1, allowSkip: false });
      }
      if (room?.mode === "JUDGE" || (hasSuccessfulLiaCharge(room) && !hasUsedLiaFog(room))) steps.push({ id: "lia_fog", actor: "lia", label: "莉娅选择是否开启迷雾", targetCount: 0, allowSkip: true });
    } else if (boardId === "wolf_king_guard") {
      const witchStep = createWitchStep(room);
      steps.push(
        { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
        { id: "wolves_kill", actor: "wolf_team", label: "狼人和狼王选择击杀目标", targetCount: 1, allowSkip: true }
      );
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
      if (firstNight) steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
    } else if (boardId === "pre_witch_hunter_idiot_mixed") {
      if (firstNight) steps.push({ id: "mixed_blood_model", actor: "mixed_blood", label: "混血儿选择榜样", targetCount: 1, allowSkip: false });
      const witchStep = createWitchStep(room);
      steps.push(
        { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
      );
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
      if (firstNight) {
        steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
        steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "masquerade") {
      const witchStep = createWitchStep(room);
      steps.push(
        { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
      );
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
      if (!firstNight) {
        const availableDanceSeats = getAvailableDanceSeats(room);
        if (availableDanceSeats.length >= 3) {
          steps.push({ id: "dancer_dance", actor: "dancer", label: "舞者选择三名共舞玩家", targetCount: 3, allowSkip: false, allowedSeats: availableDanceSeats });
        }
        steps.push(
          { id: "mask_check", actor: "mask", label: "假面验证是否在舞池", targetCount: 1, allowSkip: false },
          { id: "mask_give", actor: "mask", label: "假面给予面具", targetCount: 1, allowSkip: false }
        );
      }
      if (firstNight) {
        steps.push({ id: "dancer_confirm", actor: "dancer", label: "舞者确认身份", targetCount: 0, allowSkip: false });
        steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "treasure_master") {
      steps.push(
        { id: "treasure_pick", actor: "treasure_master", label: "盗宝大师选择今晚使用的盗宝牌", targetCount: 0, allowSkip: false, needsCard: true },
        { id: "treasure_skill", actor: "treasure_master", label: "盗宝大师使用盗宝牌技能", targetCount: 1, allowSkip: true },
        { id: "dreamer_dream", actor: "dreamer", label: "摄梦人选择摄梦目标", targetCount: 1, allowSkip: false }
      );
      if (!firstNight) steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
      if (!hasUsedNightStep(room, "poisoner_poison")) steps.push({ id: "poisoner_poison", actor: "poisoner", label: "毒师选择是否毒人", targetCount: 1, allowSkip: true });
      steps.push({ id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false });
      if (firstNight) {
        steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
        steps.push({ id: "masked_man_confirm", actor: "masked_man", label: "蒙面人确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "mechanical_wolf_spirit_medium") {
      const witchStep = createWitchStep(room);
      if (!firstNight && room?.mode === "SYSTEM") steps.push({ id: "mechanical_knife_confirm", actor: "mechanical_wolf", label: "机械狼确认带刀状态", targetCount: 0, allowSkip: false });
      steps.push(
        { id: "guard_guard", actor: "guard", label: "守卫选择守护目标", targetCount: 1, allowSkip: true },
        { id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true }
      );
      if (witchStep) steps.push(witchStep);
      if (!firstNight) {
        const skillStep = mechanicalSkillStep(room, night);
        if (skillStep) steps.push(skillStep);
      }
      steps.push(
        { id: "mechanical_mimic", actor: "mechanical_wolf", label: "机械狼选择模仿目标", targetCount: 1, allowSkip: false },
        { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
      );
      if (firstNight) {
        steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "realm_of_trickery") {
      const tricksterSeats = getAvailableSwapSeats(room, "trickster_swap");
      const magicianSeats = getAvailableSwapSeats(room, "magician_swap");
      const witchStep = createWitchStep(room);
      if (tricksterSeats.length >= 2) {
        steps.push({ id: "trickster_swap", actor: "trickster", label: "诡术师交换两个号码", targetCount: 2, allowSkip: !didSkipPreviousNight(room, "trickster_swap", night), allowedSeats: tricksterSeats });
      }
      if (magicianSeats.length >= 2) {
        steps.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 2, allowSkip: true, allowedSeats: magicianSeats, targetMapping: { id: "magician_swap", kind: "SWAP", appliesTo: ["wolves_kill", "witch_antidote", "witch_poison", "seer_check"], order: 100 } });
      }
      steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
      if (firstNight) {
        steps.push({ id: "order_prince_confirm", actor: "order_prince", label: "定序王子确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "dawn_voyage") {
      const witchStep = createWitchStep(room);
      const sirenAlive = (room && room.assignments || []).some((a) => a.roleId === "siren" && a.alive !== false);
      if (sirenAlive) {
        const lastWind = firstNight ? null : (room && room.lastWindDirection || "calm");
        steps.push({ id: "siren_wind", actor: "siren", label: "海妖选择风向", targetCount: 0, allowSkip: false, lastWindDirection: lastWind });
      }
      if (!firstNight) {
        const captainAlive = (room && room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
        if (captainAlive) {
          const capSeat = (room && room.assignments || []).find((a) => a.roleId === "captain" && a.alive !== false).seat;
          const aliveSeats = getAliveSeats(room).filter((s) => s !== capSeat);
          if (aliveSeats.length) {
            steps.push({ id: "captain_board", actor: "captain", label: "船长选择登船目标", targetCount: 1, allowSkip: false, allowedSeats: aliveSeats });
          }
        }
      }
      steps.push({ id: "wolves_kill", actor: "wolf_team", label: "狼人选择击杀目标", targetCount: 1, allowSkip: true });
      if (witchStep) steps.push(witchStep);
      steps.push({ id: "seer_check", actor: "seer", label: "预言家查验目标", targetCount: 1, allowSkip: false });
      if (firstNight) {
        steps.push({ id: "captain_confirm", actor: "captain", label: "船长确认身份", targetCount: 0, allowSkip: false });
        steps.push({ id: "idiot_confirm", actor: "idiot", label: "白痴确认身份", targetCount: 0, allowSkip: false });
      }
    }
    return steps.filter((step) => shouldIncludeNightStep(room, step)).map((step, index) => ({ ...step, index }));
  }

  function rebuildNightStepsAfterDarkAction(room) {
    const completed = new Set((room.nightActions || [])
      .filter((action) => action.night === room.night)
      .map((action) => action.stepId));
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room)
      .filter((step) => !completed.has(step.id))
      .map((step, index) => ({ ...step, index }));
    room.currentNightStepIndex = 0;
  }

  function rebuildNightStepsAfterUndo(room) {
    const completed = new Set((room.nightActions || [])
      .filter((action) => action.night === room.night)
      .map((action) => action.stepId));
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room)
      .filter((step) => !completed.has(step.id))
      .map((step, index) => ({ ...step, index }));
    room.currentNightStepIndex = 0;
  }

  let state = loadState();
  let lastSystemAnnouncementKey = "";
  let seatSelectionPending = false;
  let systemSkillTimeoutPending = false;
  let systemSkillTimeoutRetryAt = 0;
  let rulebookData = null;
  let rulebookBoardId = "";
  let rulebookReturnView = "home";
  let rulebookError = "";
  let adminArchives = null;
  let adminArchive = null;
  let adminError = "";
  let adminOffset = 0;
  let adminNextOffset = null;
  let fixedNightBusy = false;
  let fixedVoiceError = "";
  let fixedCountdownKey = "";
  let serverClockAnchor = null;
  let heartbeatBusy = false;
  let publicVoiceTail = Promise.resolve();
  const monotonicNow = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  function serverClockNow() { return serverClockAnchor ? serverClockAnchor.server + monotonicNow() - serverClockAnchor.local : Date.now(); }
  async function pauseCurrentClock() {
    const room = state.remoteRoom;
    if (!room?.isController) return;
    if (room.phase === "NIGHT" && room.systemNight?.timing) await remotePost("system-fixed-night", {operation:"pause",stepKey:room.systemNight.timing.key});
    else if (room.phase === "DAY" && room.daySkillVoice) await remotePost("system-day-voice", {operation:"pause",windowKey:room.daySkillVoice.key});
  }
  async function countdownTo(deadlineAt, valid) {
    let last = 0;
    while(serverClockNow() < deadlineAt) {
      if (!valid() || document.hidden || fixedVoiceError) return false;
      const count = Math.ceil((deadlineAt - serverClockNow()) / 1000);
      if(count !== last) { last=count; await fixedSpeak(String(count)); }
      const nextAt=deadlineAt-(count-1)*1000;
      await new Promise(resolve => setTimeout(resolve, Math.max(0,nextAt-serverClockNow())));
    }
    return valid() && !document.hidden && !fixedVoiceError;
  }

  function fixedSpeak(text) {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window) || document.hidden) return reject(new Error("请在控制设备保持页面前台并启用语音，然后点击重试"));
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      const watchdog = setTimeout(() => { window.speechSynthesis.cancel(); reject(new Error("语音没有正常结束，请检查音量和播放权限后重试")); }, 30000);
      utterance.onend = () => { clearTimeout(watchdog); document.hidden ? reject(new Error("页面已进入后台，请回到前台重试")) : resolve(); };
      utterance.onerror = () => { clearTimeout(watchdog); reject(new Error("语音播放失败，流程已暂停，请重试")); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function runFixedNightClock() {
    const room = state.remoteRoom;
    const timing = room?.systemNight?.timing;
    if (!timing || !room.isController || room.phase !== "NIGHT" || fixedNightBusy || fixedVoiceError || document.hidden) return;
    const key = timing.key;
    const sameStep = () => state.remoteRoom?.id === room.id && state.remoteRoom?.isController && state.remoteRoom?.systemNight?.timing?.key === key;
    fixedNightBusy = true;
    try {
      if (["GAP", "ANNOUNCEMENT"].includes(timing.phase) && serverClockNow() >= timing.readyAt) {
        const id = room.systemNight.stepId;
        const text = id.startsWith("mechanical_") && id !== "mechanical_knife_confirm" ? "机械狼请睁眼，请按照手机提示进行操作。" : getJudgeScript({ id, label: room.systemNight.announcement }, room);
        await fixedSpeak(text);
        if (sameStep()) await remotePost("system-fixed-night", { operation: "ack", stepKey: key });
      } else if (timing.phase === "REQUIRED") {
        if (sameStep()) await remotePost("system-fixed-night", { operation: "advance", stepKey: key });
      } else if (["ACTION", "FINAL"].includes(timing.phase)) {
        const countdownId = `${key}:${timing.phase}:${timing.deadlineAt}`;
        if (timing.deadlineAt - serverClockNow() <= 10000 && fixedCountdownKey !== countdownId) {
          if (!await countdownTo(timing.deadlineAt, () => sameStep() && state.remoteRoom.systemNight.timing.deadlineAt === timing.deadlineAt)) return;
          fixedCountdownKey = countdownId;
        }
        if (sameStep() && serverClockNow() >= timing.deadlineAt && fixedCountdownKey === countdownId) await remotePost("system-fixed-night", { operation: "advance", stepKey: key });
      }
      if (state.view === "night") render();
    } catch (error) {
      if (error.status === 409) await refreshRemoteRoom().catch(() => {});
      else { fixedVoiceError = error.message; await pauseCurrentClock().catch(() => {}); }
      if (state.view === "night") render();
    }
    finally { fixedNightBusy = false; }
  }

  async function runDaySkillVoice() {
    const room = state.remoteRoom;
    const gate = room?.daySkillVoice;
    if (!gate || !room.isController || room.phase !== "DAY" || fixedNightBusy || fixedVoiceError || document.hidden) return;
    const sameWindow = () => state.remoteRoom?.id === room.id && state.remoteRoom?.isController && state.remoteRoom?.daySkillVoice?.key === gate.key;
    fixedNightBusy = true;
    try {
      if (gate.phase === "ANNOUNCEMENT") {
        const announcement = room.latestPublicAnnouncement;
        if (announcement && state.heardAnnouncementIds[room.id] !== announcement.id) {
          await fixedSpeak(announcement.text);
          if (!sameWindow()) return;
          state.heardAnnouncementIds[room.id] = announcement.id;
          saveState();
        }
        await fixedSpeak(gate.kind === "ORDER_PRINCE" ? "等待定序王子发动技能" : gate.kind === "ARCHANGEL" ? "等待天使长发动技能" : "等待玩家发动技能");
        if (sameWindow()) await remotePost("system-day-voice", {operation:"ack", windowKey:gate.key});
      } else if (gate.phase === "COUNTING") {
        if (!await countdownTo(gate.deadlineAt, sameWindow)) return;
        if (sameWindow()) await remotePost("system-day-voice", {operation:"finish", windowKey:gate.key});
      } else if (gate.phase === "COMPLETE") {
        if (sameWindow()) await remotePost("system-skill-timeout");
      }
      if (state.view === "room") render();
    } catch(error) {
      if (error.status === 409) await refreshRemoteRoom().catch(() => {});
      else { fixedVoiceError = error.message; await pauseCurrentClock().catch(() => {}); }
      if (state.view === "room") render();
    } finally { fixedNightBusy = false; }
  }

  function speakSystemAnnouncement(text, repetitions = 1) {
    if (state.remoteRoom?.fixedNightFlow === 1) {
      const roomId=state.remoteRoom.id;
      publicVoiceTail=publicVoiceTail.then(async () => {
        while(fixedNightBusy) await new Promise(resolve=>setTimeout(resolve,100));
        if(state.remoteRoom?.id!==roomId || !state.remoteRoom.isController) return;
        fixedNightBusy=true;
        try { for(let i=0;i<Math.max(1,repetitions);i++) await fixedSpeak(text); }
        catch(error) { fixedVoiceError=error.message; await pauseCurrentClock().catch(()=>{}); }
        finally { fixedNightBusy=false; }
      });
      return;
    }
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const speakNext = (remaining) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = 0.9;
      utterance.onend = () => {
        if (remaining > 1) window.setTimeout(() => speakNext(remaining - 1), 250);
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext(Math.max(1, Number(repetitions) || 1));
  }

  function createInitialState() {
    return {
      currentUserId: createClientId(),
      balanceProfileId: createBalanceProfileId(),
      dealHistory: [],
      currentRoomId: "",
      view: "home",
      remoteRoom: null,
      judgeTokens: {},
      deathDraftSeats: [],
      deathDraftReasons: {},
      heardAnnouncementIds: {},
      rooms: {}
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || createInitialState();
      const initial = createInitialState();
      const merged = {
        ...initial,
        ...saved,
        rooms: saved.rooms || {},
        judgeTokens: saved.judgeTokens || {},
        balanceProfileId: saved.balanceProfileId || initial.balanceProfileId,
        dealHistory: Array.isArray(saved.dealHistory) ? saved.dealHistory.slice(-10) : [],
        deathDraftSeats: saved.deathDraftSeats || [],
        heardAnnouncementIds: saved.heardAnnouncementIds || {},
        remoteRoom: null
      };
      const urlRoom = new URLSearchParams(location.search).get("room");
      if (urlRoom) {
        merged.currentRoomId = urlRoom;
        merged.view = "room";
      }
      return merged;
    } catch (error) {
      return createInitialState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function createSeats() {
    return Array.from({ length: 12 }, (_, index) => ({
      seat: index + 1,
      userId: "",
      nickname: "",
      occupied: false
    }));
  }

  function createRoom({ mode, boardId }) {
    const roomId = String(Math.floor(100000 + Math.random() * 900000));
    return {
      id: roomId,
      name: "十二点天黑",
      mode,
      boardId,
      phase: "WAITING",
      day: 0,
      night: 0,
      judgeUserId: state.currentUserId,
      balanceProfileId: state.balanceProfileId,
      seats: createSeats(),
      assignments: [],
      puppetSeat: 0,
      logs: [],
      nightActions: [],
      currentNightSteps: [],
      currentNightStepIndex: 0,
      sheriffCandidates: [],
      sheriffWithdrawn: [],
      sheriffElectionDone: false,
      sheriffVoteRecord: null,
      sheriffBadge: { holderSeat: 0, lost: false },
      dayVoteRecord: null,
      pendingExileResult: null,
      orderPrinceUsed: false,
      orderPrinceRevotePending: false,
      activeDaySkillWindow: null,
      daySkillWindowRecords: [],
      privateEvents: [],
      deathRecords: [],
      pendingNightResolution: null,
      pendingDelayedDeaths: [],
      pendingDeathSkills: [],
      pendingDarkDeathQueue: [],
      pendingArchangelRevival: null,
      archangelReviveUsed: false,
      revivalRecords: [],
      activeDarkBallot: null,
      liaFogDay: 0,
      darkFogAnnouncedDay: 0,
      systemDayOutcomeRecordedDay: 0,
      deathSkillRecords: [],
      exileRecords: [],
      windDirection: "calm",
      lastWindDirection: "calm",
      boardedSeat: 0,
      captainDiedLastDay: false,
      captainAliveAtDawn: true,
      systemAnnouncementNotBefore: 0
    };
  }

  function getCurrentRoom() {
    if (IS_REMOTE) return state.remoteRoom;
    if (!state.currentRoomId) return null;
    return state.rooms[state.currentRoomId] || null;
  }

  function getMySeat(room) {
    if (!room) return null;
    return IS_REMOTE
      ? room.mySeat || null
      : room.seats.find((seat) => seat.userId === state.currentUserId) || null;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "请求失败");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function currentJudgeToken() {
    return state.judgeTokens[state.currentRoomId] || "";
  }

  function adoptRemoteRoom(room) {
    if (!room || room.id !== state.currentRoomId) return state.remoteRoom;
    const currentRevision = Number(state.remoteRoom?.revision || 0);
    const incomingRevision = Number(room.revision || 0);
    if (!state.remoteRoom || incomingRevision >= currentRevision) {
      if (Number.isFinite(room.serverNow)) serverClockAnchor = {server:room.serverNow, local:monotonicNow()};
      state.remoteRoom = room;
      saveState();
    }
    return state.remoteRoom;
  }

  async function refreshRemoteRoom() {
    if (!IS_REMOTE || !state.currentRoomId) return null;
    const requestedRoomId = state.currentRoomId;
    const query = new URLSearchParams({
      clientId: state.currentUserId,
      judgeToken: state.judgeTokens[requestedRoomId] || ""
    });
    const data = await apiRequest(`/api/rooms/${requestedRoomId}?${query.toString()}`);
    if (state.currentRoomId !== requestedRoomId) return state.remoteRoom;
    return adoptRemoteRoom(data.room);
  }

  function hasUnsavedInteraction() {
    if (app.querySelector(".seat.selected, .card-option.selected, [data-action='witch-antidote-choice'].active")) return true;
    return Array.from(app.querySelectorAll("input, textarea, select")).some((control) => {
      if (control.tagName === "SELECT") return control.selectedIndex > 0;
      return control.value !== control.defaultValue;
    });
  }

  async function remotePost(action, payload = {}) {
    const requestedRoomId = state.currentRoomId;
    try {
      const data = await apiRequest(`/api/rooms/${requestedRoomId}/${action}`, {
        method: "POST",
        body: JSON.stringify({
          clientId: state.currentUserId,
          judgeToken: state.judgeTokens[requestedRoomId] || "",
          expectedRevision: state.remoteRoom?.revision,
          ...payload
        })
      });
      if (state.currentRoomId === requestedRoomId) adoptRemoteRoom(data.room);
      return data;
    } catch (error) {
      if (error.status === 409 && state.currentRoomId === requestedRoomId) {
        await refreshRemoteRoom().catch(() => {});
        render();
      }
      throw error;
    }
  }

  function getBoard(boardId) {
    return BOARDS.find((board) => board.id === boardId);
  }

  function getPhaseName(phase) {
    return {
      WAITING: "等待发牌",
      DEALT: "已发牌",
      NIGHT: "夜间流程",
      DAY: "白天阶段",
      GAME_OVER: "游戏结束"
    }[phase] || phase;
  }

  function formatSeatList(seats) {
    return seats && seats.length ? seats.map((seat) => `${seat}号`).join("、") : "无";
  }

  function buildSpeakingOrder(startSeat, direction) {
    return Array.from({ length: 12 }, (_, index) => {
      const offset = direction === "REVERSE" ? -index : index;
      return ((startSeat - 1 + offset + 12) % 12) + 1;
    });
  }

  function createSpeakingDraw() {
    const startSeat = Math.floor(Math.random() * 12) + 1;
    const direction = Math.random() < 0.5 ? "FORWARD" : "REVERSE";
    return {
      startSeat,
      direction,
      directionName: direction === "FORWARD" ? "顺序" : "逆序",
      order: buildSpeakingOrder(startSeat, direction)
    };
  }

  function latestRecord(records) {
    return records && records.length ? records[records.length - 1] : null;
  }

  function isSheriffElectionFinished(room) {
    if (!room) return true;
    if (Number(room.sheriffStageClosedDay || 0) > 0 && Number(room.sheriffStageClosedDay) === Number(room.night)) return true;
    if (room.night === 1 && Number(room.sheriffElectionDeferredDay) === 1) return true;
    if (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1) {
      return Boolean(room.sheriffElectionDone || room.sheriffBadge?.holderSeat || room.sheriffBadge?.lost);
    }
    if (room.night !== 1) return true;
    if (room.sheriffBadge?.holderSeat || room.sheriffBadge?.lost) return true;
    if (room.sheriffElectionDone) return true;
    const record = room.sheriffVoteRecord;
    return Boolean(record && (record.electedSeat || record.badgeLost));
  }

  function getAliveSeats(room) {
    const aliveAssignments = (room.assignments || []).filter((assignment) => assignment.alive !== false);
    if (aliveAssignments.length) return aliveAssignments.map((assignment) => assignment.seat).sort((a, b) => a - b);
    return room.seats.map((seat) => seat.seat);
  }

  function calculateDayVote({ room, round, votes, pkSeats }) {
    const aliveSeats = getAliveSeats(room);
    const previous = room.dayVoteRecord;
    const allowedTargets = round === 1
      ? aliveSeats.filter((seat) => !isDarkDestruction(room) || seat !== darkBindingTarget(room, room.night))
      : previous && previous.day === room.night && previous.round === 1 && previous.pkSeats?.length > 1
        ? previous.pkSeats.filter((seat) => aliveSeats.includes(seat) && (!isDarkDestruction(room) || seat !== darkBindingTarget(room, room.night)))
        : [];
    const isDark = isDarkDestruction(room);
    const boundSeat = isDark ? darkBindingTarget(room, room.night) : 0;
    const allowedVoters = Number(round) === 2
      ? aliveSeats.filter((seat) => !allowedTargets.includes(seat))
      : aliveSeats;
    const blessedSeat = isDark && hasUsedNightStep(room, "archangel_bless")
      ? Number((room.nightActions || []).find((action) => action.night === room.night && action.stepId === "archangel_bless" && !action.skipped)?.targetSeats?.[0] || 0)
      : 0;
    const blessedAssignment = (room.assignments || []).find((assignment) => assignment.seat === blessedSeat);
    const blessedVoterSeat = blessedAssignment?.roleId !== "lilith" ? blessedSeat : 0;
    const seenVoters = new Set();
    const validVotes = (votes || []).flatMap((vote) => {
      const voterSeat = Number(vote.voterSeat);
      const targetSeat = Number(vote.targetSeat);
      const boundVote = isDark && targetSeat === boundSeat;
      const abstention = targetSeat === 0;
      if (!allowedVoters.includes(voterSeat) || !(allowedTargets.includes(targetSeat) || boundVote || abstention) || seenVoters.has(voterSeat)) return [];
      seenVoters.add(voterSeat);
      return [isDark
        ? { voterSeat, targetSeat, weight: voterSeat === blessedVoterSeat ? 3 : 1, counted: targetSeat !== 0 && targetSeat !== boundSeat }
        : vote];
    });
    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    validVotes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      if (isDark) {
        if (vote.counted && allowedTargets.includes(targetSeat)) counts[targetSeat] += vote.weight;
      } else if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
    });
    const maxVotes = Math.max(0, ...Object.values(counts));
    const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
    const exiledSeat = topSeats.length === 1 ? topSeats[0] : 0;
    const noExile = !exiledSeat && (round === 2 || topSeats.length === 0);
    return {
      day: room.night,
      round,
      votes: validVotes,
      counts,
      topSeats,
      pkSeats: round === 1 && topSeats.length > 1 ? topSeats : [],
      exiledSeat,
      noExile,
      createdAt: Date.now()
    };
  }

  function sameSeatPair(left, right) {
    if (!left || !right || left.length !== 2 || right.length !== 2) return false;
    return [...left].map(Number).sort((a, b) => a - b).join(",") === [...right].map(Number).sort((a, b) => a - b).join(",");
  }

  function refreshSwapConflict(room, night) {
    const actions = (room.nightActions || []).filter((action) => action.night === night && ["trickster_swap", "magician_swap"].includes(action.stepId));
    actions.forEach((action) => { action.invalidByConflict = false; });
    const trickster = actions.find((action) => action.stepId === "trickster_swap" && !action.skipped);
    const magician = actions.find((action) => action.stepId === "magician_swap" && !action.skipped);
    if (trickster && magician && sameSeatPair(trickster.targetSeats, magician.targetSeats)) {
      trickster.invalidByConflict = true;
      magician.invalidByConflict = true;
    }
  }

  function getActiveSwapPair(room, stepId, night = room.night) {
    const action = (room.nightActions || []).find((item) => item.night === night && item.stepId === stepId && !item.skipped && !item.invalidByConflict);
    return action && action.targetSeats && action.targetSeats.length === 2 ? action.targetSeats.map(Number) : [];
  }

  function mapSeatWithPair(seat, pair) {
    const value = Number(seat || 0);
    if (!value || !pair || pair.length !== 2) return value;
    if (value === Number(pair[0])) return Number(pair[1]);
    if (value === Number(pair[1])) return Number(pair[0]);
    return value;
  }

  function mapNightSeat(room, seat, night = room.night, scope = "") {
    return window.TargetMapping
      ? window.TargetMapping.resolveNightTarget(room, { night, scope, seat }).effectiveSeat
      : Number(seat || 0);
  }

  function mapExileSeat(room, seat, day = room.night) {
    return room.boardId === "realm_of_trickery" ? mapSeatWithPair(seat, getActiveSwapPair(room, "trickster_swap", day)) : Number(seat || 0);
  }

  function captureDayRecordUndo(room, stage) {
    room.dayRecordUndo = {
      day: room.night,
      stage,
      snapshot: JSON.parse(JSON.stringify({
        assignments: room.assignments,
        deathRecords: room.deathRecords,
        exileRecords: room.exileRecords,
        dayVoteRecord: room.dayVoteRecord,
        pendingExileResult: room.pendingExileResult,
        orderPrinceUsed: room.orderPrinceUsed,
        orderPrinceRevotePending: room.orderPrinceRevotePending,
        pendingNightResolution: room.pendingNightResolution,
        pendingDelayedDeaths: room.pendingDelayedDeaths,
        pendingDeathSkills: room.pendingDeathSkills,
        deathSkillRecords: room.deathSkillRecords,
        treasureMaskedFinalNight: room.treasureMaskedFinalNight
      })),
      createdAt: Date.now()
    };
  }

  function finalizeDayVote(room, record, source = "DAY_VOTE") {
    captureDayRecordUndo(room, "EXILE");
    const rawExiledSeat = Number(record.exiledSeat || 0);
    const actualExiledSeat = rawExiledSeat ? mapExileSeat(room, rawExiledSeat, record.day) : 0;
    record.rawExiledSeat = rawExiledSeat;
    record.actualExiledSeat = actualExiledSeat;
    record.exiledSeat = actualExiledSeat;
    if (actualExiledSeat) {
      const assignment = room.assignments.find((item) => item.seat === actualExiledSeat);
      if (assignment) {
        assignment.alive = false;
        if (assignment.roleId === "idiot") assignment.publiclyRevealed = true;
      }
      trackCaptainDeath(room, actualExiledSeat);
      if (shouldStartTreasureMaskedFinalNight(room, assignment)) {
        room.treasureMaskedFinalNight = { seat: actualExiledSeat, triggerDay: room.night, status: "PENDING", createdAt: Date.now() };
        writeLog(room, "TREASURE_MASK_FINAL_NIGHT_PENDING", room.treasureMaskedFinalNight);
      } else {
        queueDarkDeathResolution(room, [actualExiledSeat], "EXILE");
      }
    }
    const exileRecord = {
      day: room.night,
      seat: actualExiledSeat,
      rawSeat: rawExiledSeat,
      noExile: record.noExile,
      source,
      createdAt: Date.now()
    };
    room.exileRecords = room.exileRecords || [];
    room.exileRecords.push(exileRecord);
    if (room.mode === "SYSTEM") room.systemDayOutcomeRecordedDay = room.night;
    writeLog(room, "EXILE_CONFIRMED", exileRecord);
  }

  function applyWind(seat, wind, boardedSeat) {
    if (!seat || wind === "calm") return seat;
    if (seat === boardedSeat) return seat;
    if (wind === "tailwind") return (seat % 12) + 1;
    if (wind === "headwind") return ((seat + 10) % 12) + 1;
    return seat;
  }

  function trackCaptainDeath(room, seat) {
    if (room.boardId !== "dawn_voyage") return;
    const assignment = room.assignments.find((a) => a.seat === seat);
    if (assignment && assignment.roleId === "captain") {
      room.captainDiedLastDay = true;
    }
  }

  function calculateSuggestedDeaths(room, night = room.night) {
    if (room.pendingNightResolution && night === room.night) {
      return room.pendingNightResolution.deaths || [];
    }
    return window.NightResolution.calculateSuggestedDeaths(room, night);
  }

  function queueDeathSkills(room, seats, phase, reasonsBySeat = {}) {
    room.pendingDeathSkills = room.pendingDeathSkills || [];
    room.deathSkillRecords = room.deathSkillRecords || [];
    seats.forEach((seat) => {
      const resolution = window.NightResolution.getDeathSkillResolution(room, {
        seat,
        phase,
        reasons: reasonsBySeat[String(seat)] || [],
        day: room.night
      });
      if (!resolution) return;
      const record = { ...resolution, phase, resolved: !resolution.eligible, createdAt: Date.now() };
      room.deathSkillRecords.push(record);
      if (resolution.eligible && !room.pendingDeathSkills.some((item) => item.seat === seat && item.day === room.night)) {
        room.pendingDeathSkills.push(record);
      }
      writeLog(room, resolution.eligible ? "DEATH_SKILL_PENDING" : "DEATH_SKILL_BLOCKED", record);
    });
  }

  function canOfferArchangelRevive(room, targetSeat) {
    const archangel = (room.assignments || []).find((assignment) => assignment.roleId === "archangel");
    const wasBound = archangel && (room.nightActions || []).some((action) => action.stepId === "lilith_bind" && Number(action.targetSeats?.[0]) === Number(archangel.seat));
    return Boolean(isDarkDestruction(room) && archangel && archangel.alive !== false && archangel.seat !== Number(targetSeat) && !room.archangelReviveUsed && !wasBound);
  }

  function advanceDarkDeathResolution(room) {
    if (!isDarkDestruction(room) || room.pendingArchangelRevival) return;
    if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return;
    room.pendingDarkDeathQueue = room.pendingDarkDeathQueue || [];
    while (room.pendingDarkDeathQueue.length) {
      const pending = room.pendingDarkDeathQueue.shift();
      const assignment = (room.assignments || []).find((item) => item.seat === pending.seat);
      if (!assignment || assignment.alive !== false) continue;
      if (!room.archangelReviveUsed && (room.assignments || []).some(item => item.roleId === "archangel")) {
        room.pendingArchangelRevival = { ...pending, canRevive: canOfferArchangelRevive(room, pending.seat) };
        room.publicAnnouncements = room.publicAnnouncements || [];
        room.publicAnnouncements.push({ id: `revive-${Date.now()}`, text: `等待天使长决定是否复活 ${pending.seat}号玩家。`, createdAt: Date.now() });
        return;
      }
      queueDeathSkills(room, [pending.seat], pending.phase, { [String(pending.seat)]: pending.reasons || [] });
      if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) return;
    }
  }

  function queueDarkDeathResolution(room, seats, phase, reasonsBySeat = {}) {
    if (!isDarkDestruction(room)) return queueDeathSkills(room, seats, phase, reasonsBySeat);
    room.pendingDarkDeathQueue = room.pendingDarkDeathQueue || [];
    seats.forEach((seat) => {
      if (!room.pendingDarkDeathQueue.some((item) => item.seat === seat && item.day === room.night)) {
        room.pendingDarkDeathQueue.push({ seat, day: room.night, phase, reasons: reasonsBySeat[String(seat)] || [] });
      }
    });
    advanceDarkDeathResolution(room);
  }

  function beginLocalNight(room) {
    room.night = (room.night || 0) + 1;
    if (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1) {
      room.sheriffCandidates = [];
      room.sheriffWithdrawn = [];
      room.sheriffVoteRecord = null;
      room.sheriffElectionDone = false;
    }
    room.phase = "NIGHT";
    room.lastWindDirection = room.windDirection || "calm";
    room.boardedSeat = 0;
    room.captainAliveAtDawn = (room.assignments || []).some((assignment) => assignment.roleId === "captain" && assignment.alive !== false);
    room.captainDiedLastDay = false;
    room.systemAnnouncementNotBefore = 0;
    room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
    if (room.treasureMaskedFinalNight?.status === "PENDING") room.treasureMaskedFinalNight.status = "ACTIVE";
    room.currentNightStepIndex = 0;
    room.nightActions = room.nightActions || [];
    writeLog(room, "NIGHT_STARTED", { night: room.night });
  }

  function continueLocalAfterSheriffSelfDestruct(room) {
    if (!room.pendingJudgeNightAfterSelfDestruct
      || room.pendingNightResolution
      || room.pendingArchangelRevival
      || (room.pendingDarkDeathQueue || []).length
      || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night)
      || (room.pendingDeathSkills || []).some((item) => item.day === room.night)) return false;
    room.pendingJudgeNightAfterSelfDestruct = false;
    room.pendingSheriffSelfDestructSeat = 0;
    beginLocalNight(room);
    return true;
  }

  function resolveLocalArchangelRevival(room, useRevive) {
    const pending = room.pendingArchangelRevival;
    if (!pending) throw new Error("当前没有待处理的天使长复活窗口");
    const assignment = (room.assignments || []).find((item) => item.seat === pending.seat);
    if (useRevive && (!canOfferArchangelRevive(room, pending.seat) || !assignment || assignment.alive !== false)) throw new Error("该玩家当前不能被复活");
    room.pendingArchangelRevival = null;
    if (useRevive) {
      if (!canOfferArchangelRevive(room, pending.seat) || !assignment || assignment.alive !== false) throw new Error("该玩家当前不能被复活");
      assignment.alive = true;
      room.archangelReviveUsed = true;
      room.revivalRecords = room.revivalRecords || [];
      room.revivalRecords.push({ seat: pending.seat, day: pending.day, phase: pending.phase, createdAt: Date.now() });
      const deathRecord = [...(room.deathRecords || [])].reverse().find((item) => item.day === pending.day && item.phase === pending.phase && item.seats?.includes(pending.seat));
      if (deathRecord) deathRecord.revivedSeats = [...new Set([...(deathRecord.revivedSeats || []), pending.seat])];
      writeLog(room, "ARCHANGEL_REVIVED", { seat: pending.seat, day: pending.day, phase: pending.phase });
    } else {
      queueDeathSkills(room, [pending.seat], pending.phase, { [String(pending.seat)]: pending.reasons || [] });
      writeLog(room, "ARCHANGEL_REVIVAL_DECLINED", { seat: pending.seat, day: pending.day, phase: pending.phase });
    }
    advanceDarkDeathResolution(room);
    continueLocalAfterSheriffSelfDestruct(room);
  }

  function getNightActionTarget(room, stepId, night = room.night) {
    const action = (room.nightActions || []).find((item) => item.night === night && item.stepId === stepId && !item.skipped);
    return action && action.targetSeats && action.targetSeats.length ? action.targetSeats[0] : 0;
  }

  function getWitchAntidoteTarget(room) {
    return Number(room?.systemNight?.privateContext?.wolfVictimSeat || 0)
      || getNightActionTarget(room, "wolves_kill", room.night);
  }

  function canChooseWitchAntidote(room, step) {
    if (!step?.antidoteAvailable) return false;
    const targetSeat = getWitchAntidoteTarget(room);
    if (!targetSeat) return false;
    const witchSeat = (room?.assignments || []).find((item) => item.roleId === "witch")?.seat || 0;
    return targetSeat !== witchSeat;
  }

  function formatNightAction(action) {
    if (!action) return "";
    if (action.stepId === "witch_action") {
      const antidote = action.antidoteUsed ? `救 ${action.antidoteTargetSeat}号` : "不救";
      const poison = action.poisonTargetSeat ? `毒 ${action.poisonTargetSeat}号` : "不用毒";
      return `女巫行动：${antidote}；${poison}`;
    }
    if (action.stepId === "witch_antidote") return action.skipped ? "女巫选择不救" : `女巫救 ${formatSeatList(action.targetSeats || [])}`;
    if (action.stepId === "treasure_skill") {
      const role = (getRole(action.cardRoleId) || { name: action.cardRoleId }).name;
      return action.skipped ? `盗宝大师使用${role}牌：不发动` : `盗宝大师使用${role}牌：${formatSeatList(action.targetSeats || [])}`;
    }
    if (action.skipped) return `${action.label || "夜间行动"}：空过`;
    if (action.cardRoleId) return `${action.label || "夜间行动"}：选择 ${(getRole(action.cardRoleId) || { name: action.cardRoleId }).name}`;
    if (action.targetSeats && action.targetSeats.length) {
      const conflict = action.invalidByConflict ? "（与另一换号完全相同，本夜双方均无效，号码仍计为已使用）" : "";
      return `${action.label || "夜间行动"}：${formatSeatList(action.targetSeats)}${conflict}`;
    }
    return action.label || "夜间行动";
  }

  function validateNightAction(room, step, targetSeats, skipped, cardRoleId = "") {
    if (step.id === "lilith_bind" && step.inactive && !skipped) return "莉莉丝已出局，不能发动禁锢";
    if (!IS_REMOTE && step.id === "lia_fog" && !skipped && (!hasSuccessfulLiaCharge(room) || hasUsedLiaFog(room) || isDarkRoleBound(room, "lia") || !(room.assignments || []).some((item) => item.roleId === "lia" && item.alive !== false))) return "莉娅当前不能开启迷雾";
    if (step.id === "treasure_pick") {
      const treasure = (room.assignments || []).find((assignment) => assignment.roleId === "treasure_master");
      const cards = treasure?.abilityState?.treasureCards || [];
      if (!cards.includes(cardRoleId)) return "所选身份不在盗宝牌堆中";
      const previous = (room.nightActions || []).find((action) => action.night === room.night - 1 && action.stepId === "treasure_pick");
      if (previous && previous.cardRoleId === cardRoleId) return "盗宝大师不能连续两晚选择同一张牌";
    }
    if (step.id === "treasure_skill") {
      const activeCard = currentTreasureCard(room);
      if (!activeCard) return "未找到本夜选择的盗宝牌";
      if (["spirit_medium", "dreamer"].includes(activeCard) && skipped) return "当前盗宝牌必须选择一名目标";
      if (["villager", "hunter"].includes(activeCard) && !skipped) return "当前盗宝牌没有主动夜间技能";
      if (activeCard === "poisoner" && !skipped && (room.nightActions || []).some((action) => action.stepId === "treasure_skill" && action.cardRoleId === "poisoner" && !action.skipped)) return "盗宝毒师的毒药已经使用过";
      if (activeCard === "wolf" && !skipped) return "盗宝狼人牌不提供额外技能刀，请在狼人夜使用普通狼刀";
    }
    if (step.id === "dreamer_dream" || (step.id === "treasure_skill" && cardRoleId === "dreamer")) {
      const sourceRole = step.id === "dreamer_dream" ? "dreamer" : "treasure_master";
      const sourceSeat = (room.assignments || []).find((assignment) => assignment.roleId === sourceRole)?.seat;
      if (!skipped && targetSeats.includes(Number(sourceSeat))) return "摄梦目标不能是技能来源本人";
    }
    if (isDarkDestruction(room) && step.id === "cain_check" && !skipped) {
      const cainSeat = darkRoleSeat(room, "cain");
      if (targetSeats.some((seat) => Number(seat) === Number(cainSeat))) return "凯恩不能选择自己作为鉴定对象";
      if (Number(targetSeats[0]) === Number(targetSeats[1])) return "凯恩必须选择两名不同玩家";
    }
    if (isDarkDestruction(room) && step.id === "cain_check" && !skipped) {
      const cainSeat = darkRoleSeat(room, "cain");
      if (targetSeats.some((seat) => Number(seat) === Number(cainSeat))) return "凯恩不能选择自己作为鉴定对象";
      if (Number(targetSeats[0]) === Number(targetSeats[1])) return "凯恩必须选择两名不同玩家";
    }
    if (step.id === "poisoner_poison" && !skipped && hasUsedNightStep(room, "poisoner_poison")) return "毒师的毒药已经使用过";
    if (skipped) return "";
    if (targetSeats.some((seat) => Array.isArray(room.aliveSeats)
      ? !room.aliveSeats.includes(seat)
      : !(room.assignments || []).some((assignment) => assignment.seat === seat && assignment.alive !== false))) {
      return "夜间技能只能选择存活玩家";
    }
    if (["mask_check", "mask_give"].includes(step.id)) {
      const previous = (room.nightActions || []).find((action) => action.night === room.night - 1 && action.stepId === step.id && !action.skipped);
      if (previous?.targetSeats?.[0] === targetSeats[0]) return step.id === "mask_check" ? "假面不能连续两晚验证同一名玩家" : "假面不能连续两晚给予同一名玩家面具";
    }
    if (Array.isArray(step.allowedSeats) && targetSeats.some((seat) => !step.allowedSeats.includes(seat))) {
      return "所选玩家不符合当前技能的可选范围";
    }
    if (["guard_guard", "mechanical_guard"].includes(step.id)) {
      const lastGuard = [...(room.nightActions || [])]
        .reverse()
        .find((action) => action.stepId === step.id && action.night === room.night - 1 && !action.skipped);
      if (lastGuard && lastGuard.targetSeats && lastGuard.targetSeats[0] === targetSeats[0]) {
        return "守卫不能连续两晚守护同一名玩家";
      }
    }
    if (step.id === "witch_antidote" || step.id === "witch_poison") {
      const used = (room.nightActions || []).some((action) => action.stepId === step.id && !action.skipped);
      if (used) return step.id === "witch_antidote" ? "女巫解药已经使用过" : "女巫毒药已经使用过";
    }
    return "";
  }

  function getRole(roleId) {
    return ROLES[roleId];
  }

  function formatPrivateNightResult(result) {
    if (!result) return "";
    if (result.kind === "CAMP") return `${result.seat}号查验结果：${result.value === "WOLF" ? "狼人" : "好人"}`;
    if (result.kind === "ROLE") return `${result.seat}号具体身份：${getRole(result.roleId)?.name || result.roleId}`;
    if (result.kind === "DANCE") return `${result.seat}号${result.value ? "在" : "不在"}今晚舞池中`;
    if (result.kind === "CHARGE") return `${result.seat}号充能${result.success ? "成功" : "失败"}`;
    if (result.kind === "CAIN") return `${formatSeatList(result.seats)}鉴定结果：${{ SAME: "同类", DOWN: "向下", WOLF_CLAW: "狼爪" }[result.result] || "未知"}`;
    return "";
  }

  function writeLog(room, type, payload) {
    room.logs.push({
      id: `${Date.now()}-${room.logs.length}`,
      type,
      payload,
      createdAt: Date.now()
    });
  }

  function formatDeathReasonSummary(record) {
    return (record.seats || []).map((seat) => {
      const reasons = record.reasons && Array.isArray(record.reasons[seat]) ? record.reasons[seat] : [];
      return reasons.length ? `${seat}号：${reasons.join("、")}` : "";
    }).filter(Boolean).join("；");
  }

  function formatLog(log) {
    const payload = log.payload || {};
    const seats = (value) => formatSeatList(Array.isArray(value) ? value : []);
    const roleName = (roleId) => roleId ? (getRole(roleId) || { name: roleId }).name : "";
    const fallback = escapeHtml(JSON.stringify(payload));
    const map = {
      ROOM_CREATED: ["创建房间", "房间已创建"],
      SEAT_SELECTED: ["选择座位", `${payload.seat || ""}号入座`],
      TEST_SEATS_FILLED: ["补齐测试座位", "空位已用测试玩家补齐"],
      DEALT: ["发牌", "身份牌已随机发放"],
      IDENTITY_VIEWED: ["查看身份", `${payload.seat || ""}号已查看身份`],
      NIGHT_STARTED: ["开始夜晚", `第 ${payload.night || ""} 夜开始`],
      NIGHT_FINISHED: ["结束夜晚", `第 ${payload.night || ""} 夜结束，进入白天`],
      NIGHT_ACTION: ["夜间行动", `${payload.label || "记录行动"}${payload.skipped ? "：跳过" : payload.targetSeats && payload.targetSeats.length ? `：${seats(payload.targetSeats)}` : payload.cardRoleId ? `：选择 ${roleName(payload.cardRoleId)}` : ""}`],
      NIGHT_ACTION_UNDONE: ["撤回夜间行动", payload.label || "已撤回上一步"],
      SHERIFF_CANDIDATES_CONFIRMED: ["上警名单", seats(payload.seats)],
      SHERIFF_WITHDRAW_CONFIRMED: ["退水名单", seats(payload.seats)],
      SHERIFF_SELF_WITHDRAWN: ["玩家退水", `${payload.seat || ""}号退水`],
      SHERIFF_VOTE_CONFIRMED: ["警徽投票", payload.electedSeat ? `${payload.electedSeat}号当选警长` : payload.badgeLost ? "警徽流失" : payload.pkSeats && payload.pkSeats.length ? `${seats(payload.pkSeats)} 平票 PK` : "未产生警长"],
      DAYBREAK_DEATHS_CONFIRMED: ["天亮死亡", payload.seats && payload.seats.length ? `${seats(payload.seats)}${formatDeathReasonSummary(payload) ? `（${formatDeathReasonSummary(payload)}）` : ""}` : "平安夜"],
      DAY_VOTE_CONFIRMED: ["放逐投票", payload.exiledSeat ? `${payload.exiledSeat}号出局` : payload.noExile ? "无人出局" : payload.pkSeats && payload.pkSeats.length ? `${seats(payload.pkSeats)} 平票 PK` : "未产生结果"],
      DAY_VOTE_PENDING: ["等待发动技能", payload.exiledSeat ? `${payload.exiledSeat}号为原始出局结果，尚未宣布实际死讯` : payload.pkSeats && payload.pkSeats.length ? `${seats(payload.pkSeats)} 平票，尚未进入 PK` : "等待定序王子"],
      ORDER_PRINCE_ACTIVATED: ["定序王子发动", "首轮投票作废，所有存活玩家重新自由投票"],
      ORDER_PRINCE_DECLINED: ["定序王子未发动", "继续结算原始票型"],
      EXILE_CONFIRMED: ["白天放逐", payload.noExile ? "无人出局" : payload.rawSeat && payload.rawSeat !== payload.seat ? `原始${payload.rawSeat}号，换号后${payload.seat}号实际出局` : `${payload.seat || ""}号出局`],
      DELAYED_DEATH_CONFIRMED: ["延迟死亡", `${payload.seats?.[0] || ""}号发言结束后死亡`],
      DEATH_SKILL_PENDING: ["等待死亡技能", `${payload.seat || ""}号可以发动死亡技能`],
      DEATH_SKILL_BLOCKED: ["死亡技能受限", `${payload.seat || ""}号：${payload.reason || "不能发动"}`],
      DEATH_SKILL_RESOLVED: ["死亡技能结算", payload.skipped ? `${payload.seat || ""}号不开枪` : `${payload.seat || ""}号带走${payload.targetSeat || ""}号`],
      SHERIFF_BADGE_TRANSFERRED: ["警徽移交", `警徽移交给 ${payload.seat || ""}号`],
      SHERIFF_BADGE_DESTROYED: ["撕毁警徽", "警徽已撕毁"],
      GAME_ENDED: ["结束游戏", "游戏已结束"]
    };
    const item = map[log.type] || [log.type, fallback];
    return { title: item[0], detail: item[1] || "" };
  }

  function renderActionPanel(title, actions, extraClass = "") {
    const visibleActions = actions.filter(Boolean);
    if (!visibleActions.length) return "";
    return `
      <section class="panel action-panel ${extraClass}">
        <div class="label">${title}</div>
        <div class="action-row">
          ${visibleActions.join("")}
        </div>
      </section>
    `;
  }

  function getPlayerStatusText({ room, mySeat, sheriffCandidates, sheriffWithdrawn }) {
    if (!mySeat) return "还未选择座位";
    const assignment = (room.assignments || []).find((item) => item.seat === mySeat.seat);
    const parts = [`${mySeat.seat}号`];
    if (assignment) parts.push(assignment.alive === false ? "已出局" : "存活");
    if (sheriffCandidates.includes(mySeat.seat)) {
      parts.push(sheriffWithdrawn.includes(mySeat.seat) ? "已退水" : "仍在警上");
    } else if (room.phase !== "WAITING") {
      parts.push("未上警");
    }
    return parts.join(" · ");
  }

  function getPlayerPhaseText(room, mySeat) {
    if (!room) return "";
    if (!mySeat) return "请选择座位，等待法官发牌。";
    if (room.phase === "WAITING") return "等待玩家入座和法官发牌。";
    if (room.phase === "DEALT") return "请查看自己的身份，然后等待法官开始第一夜。";
    if (room.phase === "NIGHT") return "夜间阶段，请按线下流程闭眼等待。";
    if (room.phase === "GAME_OVER") return "游戏已结束，可以等待法官复盘。";
    if (room.phase === "DAY" && (room.night === 1 || (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1)) && !isSheriffElectionFinished(room)) {
      const candidates = room.sheriffCandidates || [];
      const withdrawn = room.sheriffWithdrawn || [];
      if (candidates.includes(mySeat.seat) && !withdrawn.includes(mySeat.seat)) {
        return "警长竞选中，你仍在警上；如需退水可点击“我要退水”。";
      }
      if (candidates.includes(mySeat.seat) && withdrawn.includes(mySeat.seat)) return "警长竞选中，你已退水。";
      return room.night === 2 ? "延期警长竞选中，等待警徽结果。" : "警长竞选中，等待警徽结果。";
    }
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night);
    if (room.phase === "DAY" && room.night === 1 && !daybreakRecorded) {
      return "警长竞选已结束，等待法官公布第一夜死亡信息。";
    }
    return "白天阶段，等待发言、投票或法官记录结果。";
  }

  function getJudgeNextStep(room) {
    if (!room) return { title: "暂无房间", detail: "请先创建或加入房间。", action: "" };
    const occupiedCount = (room.seats || []).filter((seat) => seat.occupied).length;
    const board = getBoard(room.boardId);
    if (room.phase === "WAITING") {
      return occupiedCount >= board.playerCount
        ? { title: "可以发牌", detail: "12 名玩家已入座，下一步发牌。", action: "发牌" }
        : { title: "等待入座", detail: `当前 ${occupiedCount}/${board.playerCount} 人，满员后再发牌。`, action: "等待玩家" };
    }
    if (room.phase === "DEALT") return { title: "开始第一夜", detail: "玩家看完身份后，进入第一夜流程。", action: "开始第一夜" };
    if (room.phase === "NIGHT") {
      const step = room.currentNightSteps && room.currentNightSteps[room.currentNightStepIndex || 0];
      return step
        ? { title: "继续夜间流程", detail: `当前步骤：${step.label}`, action: "继续夜间流程" }
        : { title: "夜间已完成", detail: room.night === 1 ? "下一步进入警长竞选。" : "下一步确认天亮死亡。", action: "天亮" };
    }
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK");
    if (room.phase === "DAY" && !daybreakRecorded) {
      return { title: "记录天亮死亡", detail: "请先公布昨夜死亡结果；上警、退水和警徽记录均为可选。", action: "记录天亮死亡" };
    }
    if (room.phase === "DAY") {
      if (room.activeDaySkillWindow?.status === "OPEN") {
        return { title: "等待白天技能窗口", detail: "当前技能窗口尚未结算，不能进入后续白天流程。", action: "处理技能窗口" };
      }
      if (room.pendingArchangelRevival || room.systemPendingTasks?.archangelRevival) {
        return { title: "等待天使长复活", detail: "先完成当前复活窗口，再继续处理死亡结算。", action: "处理复活窗口" };
      }
      if ((room.pendingDarkDeathQueue || []).length) {
        return { title: "处理出局结算", detail: "当前仍有玩家等待复活或死亡技能结算。", action: "处理出局结算" };
      }
      if (room.activeDarkBallot?.status === "OPEN") {
        return { title: "完成私密投票", detail: "当前投票仍未结束；所有应投票玩家提交后再结束投票。", action: "处理私密投票" };
      }
      if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) {
        return { title: "处理延迟死亡", detail: "请先处理仍待确认的延迟死亡。", action: "处理延迟死亡" };
      }
      if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) {
        return { title: "处理死亡技能", detail: "请先完成或放弃当前死亡技能。", action: "处理死亡技能" };
      }
      if (room.pendingExileResult) {
        return { title: "等待发动技能", detail: "首轮投票结果已产生，宣布实际死讯前等待定序王子发动回溯。", action: "处理投票结果" };
      }
      if (room.orderPrinceRevotePending) {
        return { title: "回溯重新投票", detail: "所有存活玩家重新自由投票。", action: "记录重新投票" };
      }
      const vote = room.dayVoteRecord;
      if (vote && vote.day === room.night && vote.pkSeats && vote.pkSeats.length && !vote.exiledSeat && !vote.noExile) {
        return { title: "放逐 PK 投票", detail: `PK 玩家：${formatSeatList(vote.pkSeats)}。`, action: "记录放逐投票" };
      }
      if (!(room.exileRecords || []).some((record) => record.day === room.night)) {
        return { title: "记录放逐", detail: "白天发言结束后记录放逐投票。", action: "记录放逐投票" };
      }
      return { title: "进入下一夜", detail: "白天结果已记录，可以进入下一夜。", action: "进入下一夜" };
    }
    return { title: "游戏已结束", detail: "可以查看复盘。", action: "复盘" };
  }

  function getJudgeScript(step, room) {
    if (!step) return "夜间行动已完成，法官确认死亡信息后可以天亮。";
    const night = room && room.night || 1;
    const isFirstNight = night === 1;
    const scripts = {
      mixed_blood_model: "混血儿请睁眼，请选择你的榜样。选择后闭眼。",
      puppet_select: "狼人和狼王请睁眼，确定傀儡目标。傀儡不睁眼，不与狼队相认。选择后闭眼。",
      lilith_bind: "莉莉丝请睁眼，请选择今晚禁锢的玩家。选择后闭眼。",
      lia_raise: "莉娅请举手确认身份。",
      wolves_kill: isFirstNight ? "狼人请睁眼，互认同伴，商量战术，确认击杀目标。" : "狼人请睁眼，商量战术，确认击杀目标。",
      witch_action: "女巫请睁眼，今夜该号玩家倒牌，救人给出手势，使用毒药比出号码。",
      witch_antidote: "女巫请睁眼，今夜该号玩家倒牌，使用解药比出手势。",
      witch_poison: "女巫请睁眼，使用毒药请比出号码。",
      seer_check: "预言家请睁眼，请选择查验，他的身份是。",
      dancer_dance: "舞者请睁眼，请选择三名玩家进入舞池。选择后闭眼。",
      mask_check: "假面请睁眼，请验证一名玩家是否在舞池中。记录后继续。",
      mask_give: "假面请睁眼，请选择一名玩家给予面具。选择后闭眼。",
      treasure_pick: "盗宝大师请睁眼，你拥有的底牌分别为。请选择今晚的身份。",
      dreamer_dream: "摄梦人请睁眼，请选择发动技能的号码。",
      archangel_bless: "天使长请睁眼，请选择祝福目标；若祝福莉莉丝，她将死亡。",
      cain_check: "凯恩请睁眼，请选择两名玩家鉴定身份关系。",
      lia_charge: "莉娅请睁眼，请选择一名玩家尝试充能。",
      lia_fog: "莉娅请睁眼，请选择是否开启迷雾。",
      poisoner_poison: "毒师请睁眼，请选择发动技能的号码。",
      spirit_medium_check: "通灵师请睁眼，请验人，他的身份是。",
      mechanical_mimic: "机械狼请睁眼，请选择今晚模仿的目标。记录后闭眼。",
      mechanical_knife_confirm: "机械狼请睁眼，请确认你的带刀状态。",
      mechanical_guard: "机械狼请睁眼，请选择今晚守护的目标，也可以空守。",
      mechanical_poison: "机械狼请睁眼，请选择今晚毒杀的目标，也可以不发动。",
      mechanical_check: "机械狼请睁眼，请查验一名玩家的具体身份。",
      mechanical_kill: "机械狼请睁眼，其他狼人已经出局，请选择技能刀目标，也可以空刀。",
      treasure_skill: "盗宝大师请根据今晚选择的盗宝牌发动对应技能。",
      guard_guard: "守卫请睁眼，请选择今晚守护目标；也可以空守。选择后闭眼。",
      trickster_swap: "诡术师请睁眼，确认交换的目标。",
      magician_swap: "魔术师请睁眼，确认交换的目标。",
      siren_wind: "海妖请睁眼，请选择今晚的风向。无风、顺风还是逆风？选择后闭眼并与狼人见面。",
      captain_board: "船长请睁眼，请选择今晚登船的玩家。选择后闭眼。",
      hunter_confirm: "猎人请睁眼，请确认你的开枪状态。",
      idiot_confirm: "白痴请睁眼，请确认身份。",
      dancer_confirm: "舞者请睁眼，请确认身份。",
      masked_man_confirm: "蒙面人请睁眼，请确认身份。",
      captain_confirm: "船长请睁眼，请确认身份。",
      order_prince_confirm: "定序王子请睁眼，请确认身份。"
    };
    return scripts[step.id] || `${step.label}。记录完成后进入下一步。`;
  }

  function getNightResultText(room, step, targetSeats) {
    const treasureCheck = step && step.id === "treasure_skill" && currentTreasureCard(room) === "spirit_medium";
    if (step?.id === "cain_check") {
      if (!targetSeats || targetSeats.length !== 2) return "选择两名不同玩家后显示鉴定反馈。";
      const categories = targetSeats.map((seat) => {
        const assignment = (room.assignments || []).find((item) => item.seat === Number(seat));
        if (assignment?.roleId === "lia") return "LIA";
        if ((assignment?.currentCamp || assignment?.camp) === "WOLF") return "WOLF";
        return assignment?.roleId === "villager" ? "CIVILIAN" : "GOD";
      });
      const result = categories.includes("LIA") || categories[0] === categories[1]
        ? "同类"
        : categories.includes("WOLF")
          ? "狼爪"
          : "向下";
      return `${formatSeatList(targetSeats)}鉴定结果：${result}`;
    }
    if (step?.id === "lia_charge") {
      const seat = Number(targetSeats?.[0] || 0);
      if (!seat) return "选择目标后显示充能结果。";
      const assignment = (room.assignments || []).find((item) => item.seat === seat);
      return `${seat}号充能${assignment?.roleId === "villager" ? "成功" : "失败"}`;
    }
    if (!step || (!["seer_check", "spirit_medium_check", "mechanical_mimic", "mechanical_check"].includes(step.id) && !treasureCheck)) return "";
    const selectedSeat = targetSeats && targetSeats.length ? Number(targetSeats[0]) : 0;
    if (!selectedSeat) return "选择目标后，这里会显示需要告知角色的结果。";
    let seat = step.id === "seer_check" ? mapNightSeat(room, selectedSeat, room.night, "seer_check") : selectedSeat;
    if (step.id === "seer_check" && room.boardId === "dawn_voyage") {
      seat = applyWind(seat, room.windDirection || "calm", room.boardedSeat || 0);
    }
    const assignment = (room.assignments || []).find((item) => item.seat === seat);
    if (!assignment) return `${seat}号：未找到身份`;
    const role = getRole(assignment.roleId) || { name: assignment.roleId };
    if (step.id === "seer_check") {
      const puppetSeer = room.boardId === "follow_neighbor" && Number(room.puppetSeat) === Number((room.assignments || []).find((item) => item.roleId === "seer")?.seat);
      const puppetTarget = room.boardId === "follow_neighbor" && Number(room.puppetSeat) === seat;
      const baseResult = assignment.camp === "WOLF" || puppetTarget ? "狼人" : "好人";
      const result = puppetSeer ? (baseResult === "狼人" ? "好人" : "狼人") : baseResult;
      return selectedSeat === seat ? `${seat}号查验结果：${result}` : `选择${selectedSeat}号，实际查验${seat}号：${result}`;
    }
    if (["spirit_medium_check", "mechanical_check"].includes(step.id) || treasureCheck) {
      if (step.id === "spirit_medium_check" && assignment.roleId === "mechanical_wolf") {
        const mimic = (room.nightActions || []).find((item) => item.night === room.night && item.stepId === "mechanical_mimic" && !item.skipped);
        const mimickedRole = getRole(roleAtTarget(room, mimic));
        return `${seat}号具体身份：${mimickedRole ? mimickedRole.name : role.name}`;
      }
      return `${seat}号具体身份：${role.name}`;
    }
    return `${seat}号具体身份：${role.name}，请告知机械狼。`;
  }

  function getNightResultHtml(room, step, targetSeats) {
    const treasureCheck = step && step.id === "treasure_skill" && currentTreasureCard(room) === "spirit_medium";
    if (!step || (!["seer_check", "spirit_medium_check", "mechanical_mimic", "mechanical_check", "cain_check", "lia_charge"].includes(step.id) && !treasureCheck)) return "";
    const text = getNightResultText(room, step, targetSeats);
    return `<section class="panel result-panel"><div class="label">告知结果</div><div class="value" id="nightResult">${escapeHtml(text)}</div></section>`;
  }

  function updateNightResultDisplay(room, step) {
    const result = app.querySelector("#nightResult");
    if (!result) return;
    const targetSeats = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat));
    result.textContent = getNightResultText(room, step, targetSeats);
  }

  function pushTimelineItem(groups, key, title, detail) {
    if (!detail) return;
    if (!groups[key]) groups[key] = { title, items: [] };
    groups[key].items.push(detail);
  }

  function roleNameAtSeat(room, seat) {
    const assignment = (room.assignments || []).find((item) => item.seat === seat);
    const role = assignment ? getRole(assignment.roleId) : null;
    return role ? role.name : "";
  }

  function seerResultAtSeat(room, seat) {
    const assignment = (room.assignments || []).find((item) => item.seat === seat);
    if (!assignment) return "";
    return assignment.camp === "WOLF" ? "狼人" : "好人";
  }

  function formatReviewNightAction(room, action) {
    const seats = action.targetSeats || [];
    const seatText = formatSeatList(seats);
    if (action.stepId === "wolves_kill") return action.skipped ? "狼人空刀" : `狼人刀 ${seatText}`;
    if (action.stepId === "witch_antidote") return action.skipped ? "女巫不救" : `女巫救 ${seatText}`;
    if (action.stepId === "witch_poison") return action.skipped ? "女巫不用毒" : `女巫毒 ${seatText}`;
    if (action.stepId === "witch_action") {
      const antidote = action.antidoteUsed ? `救 ${action.antidoteTargetSeat}号` : "不救";
      const poison = action.poisonTargetSeat ? `毒 ${action.poisonTargetSeat}号` : "不用毒";
      return `女巫：${antidote}；${poison}`;
    }
    if (action.stepId === "seer_check") return `预言家验 ${seatText}${seats[0] ? `（${seerResultAtSeat(room, seats[0])}）` : ""}`;
    if (action.stepId === "spirit_medium_check") return `通灵师验 ${seatText}${seats[0] ? `（${roleNameAtSeat(room, seats[0])}）` : ""}`;
    if (action.stepId === "mechanical_mimic") return `机械狼模仿 ${seatText}${seats[0] ? `（${roleNameAtSeat(room, seats[0])}）` : ""}`;
    if (action.stepId === "treasure_pick") return `盗宝大师选择 ${(getRole(action.cardRoleId) || { name: action.cardRoleId }).name}`;
    if (action.stepId === "treasure_skill") return action.skipped ? `盗宝大师使用 ${(getRole(action.cardRoleId) || { name: action.cardRoleId }).name}：不发动` : `盗宝大师使用 ${(getRole(action.cardRoleId) || { name: action.cardRoleId }).name}：${seatText}`;
    if (action.stepId === "mechanical_guard") return action.skipped ? "机械守卫空守" : `机械守卫守 ${seatText}`;
    if (action.stepId === "mechanical_poison") return action.skipped ? "机械狼不使用毒药" : `机械狼毒 ${seatText}`;
    if (action.stepId === "mechanical_check") return `机械狼查验 ${seatText}${seats[0] ? `（${roleNameAtSeat(room, seats[0])}）` : ""}`;
    if (action.stepId === "mechanical_kill") return action.skipped ? "机械狼空刀" : `机械狼技能刀 ${seatText}`;
    if (action.stepId === "guard_guard") return action.skipped ? "守卫空守" : `守卫守 ${seatText}`;
    if (action.stepId === "poisoner_poison") return action.skipped ? "毒师不用毒" : `毒师毒 ${seatText}`;
    if (action.stepId === "dreamer_dream") return `摄梦人摄 ${seatText}`;
    if (action.stepId === "mixed_blood_model") return `混血儿选择榜样 ${seatText}`;
    if (action.stepId === "dancer_dance") return `舞者选择舞池 ${seatText}`;
    if (action.stepId === "mask_check") return `假面验证 ${seatText}`;
    if (action.stepId === "mask_give") return `假面给面具 ${seatText}`;
    if (action.stepId === "siren_wind") {
      const windName = { calm: "无风", tailwind: "顺风", headwind: "逆风" };
      return `海妖选择：${windName[action.windDirection] || action.windDirection}`;
    }
    if (action.stepId === "captain_board") return `船长登船 ${seatText}`;
    return `${action.label || "夜间行动"}${action.skipped ? "：空过" : action.cardRoleId ? `：选择 ${(getRole(action.cardRoleId) || { name: action.cardRoleId }).name}` : seats.length ? `：${seatText}` : ""}`;
  }

  function buildReviewTimeline(room) {
    const groups = {};
    (room.nightActions || []).forEach((action) => {
      const detail = formatReviewNightAction(room, action);
      pushTimelineItem(groups, `night-${action.night}`, `第 ${action.night} 天夜晚`, detail);
    });
    (room.deathRecords || []).forEach((record) => {
      const reasons = formatDeathReasonSummary(record);
      pushTimelineItem(groups, `day-${record.day}`, `第 ${record.day} 天白天`, `天亮死亡：${record.seats && record.seats.length ? `${formatSeatList(record.seats)}${reasons ? `（${reasons}）` : ""}` : "平安夜"}`);
    });
    if (room.sheriffCandidates && room.sheriffCandidates.length) {
      pushTimelineItem(groups, "day-1", "第 1 天白天", `上警玩家：${formatSeatList(room.sheriffCandidates)}`);
    }
    if (room.sheriffWithdrawn && room.sheriffWithdrawn.length) {
      pushTimelineItem(groups, "day-1", "第 1 天白天", `退水玩家：${formatSeatList(room.sheriffWithdrawn)}`);
    }
    if (room.sheriffVoteRecord) {
      const record = room.sheriffVoteRecord;
      const detail = record.electedSeat ? `警徽投票：${record.electedSeat}号当选` : record.badgeLost ? "警徽投票：警徽流失" : record.pkSeats && record.pkSeats.length ? `警徽投票：${formatSeatList(record.pkSeats)} 平票 PK` : "警徽投票：未产生警长";
      pushTimelineItem(groups, "day-1", "第 1 天白天", detail);
    }
    if (room.dayVoteRecord) {
      const record = room.dayVoteRecord;
      const detail = record.exiledSeat ? `放逐投票：${record.exiledSeat}号出局` : record.noExile ? "放逐投票：无人出局" : record.pkSeats && record.pkSeats.length ? `放逐投票：${formatSeatList(record.pkSeats)} 平票 PK` : "放逐投票：未产生结果";
      pushTimelineItem(groups, `day-${record.day}`, `第 ${record.day} 天白天`, detail);
    }
    (room.exileRecords || []).forEach((record) => {
      if (record.source === "DAY_VOTE") return;
      pushTimelineItem(groups, `day-${record.day}`, `第 ${record.day} 天白天`, `手动放逐：${record.noExile ? "无人出局" : `${record.seat}号出局`}`);
    });
    (room.logs || []).forEach((log) => {
      const payload = log.payload || {};
      if (log.type === "SHERIFF_BADGE_TRANSFERRED") {
        pushTimelineItem(groups, `day-${room.night || 1}`, `第 ${room.night || 1} 天白天`, `警徽移交给 ${payload.seat}号`);
      } else if (log.type === "SHERIFF_BADGE_DESTROYED") {
        pushTimelineItem(groups, `day-${room.night || 1}`, `第 ${room.night || 1} 天白天`, "警徽撕毁");
      } else if (log.type === "GAME_ENDED") {
        pushTimelineItem(groups, "game-over", "游戏结束", "游戏已结束");
      }
    });
    return Object.entries(groups)
      .sort(([left], [right]) => {
        const order = (key) => {
          if (key === "game-over") return 9999;
          const [, day] = key.split("-");
          return Number(day) * 2 + (key.startsWith("day") ? 1 : 0);
        };
        return order(left) - order(right);
      })
      .map(([, group]) => group);
  }

  function flattenEntries(entries) {
    const cards = [];
    entries.forEach((entry) => {
      for (let index = 0; index < entry.count; index += 1) {
        cards.push({ roleId: entry.roleId, camp: entry.camp });
      }
    });
    return cards;
  }

  function shuffle(cards) {
    const result = cards.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = secureRandomInt(index + 1);
      const current = result[index];
      result[index] = result[swapIndex];
      result[swapIndex] = current;
    }
    return result;
  }

  function removeOne(cards, roleId) {
    const index = cards.findIndex((card) => card.roleId === roleId);
    if (index < 0) {
      throw new Error(`牌池中缺少 ${roleId}`);
    }
    return cards.splice(index, 1)[0];
  }

  function pickTreasureGodCard(cards, board) {
    const rules = board.specialRules.treasureMaster;
    const excludes = rules.godCardPoolExcludes || [];
    const candidates = cards.filter((card) => {
      if (card.camp !== "GOOD") return false;
      if (card.roleId === "villager") return false;
      if (excludes.includes(card.roleId)) return false;
      return true;
    });
    const chosen = candidates[secureRandomInt(candidates.length)];
    return removeOne(cards, chosen.roleId);
  }

  function assignCards(seats, cards) {
    const shuffledCards = shuffle(cards);
    return seats.map((seat, index) => ({
      seat,
      roleId: shuffledCards[index].roleId,
      camp: shuffledCards[index].camp,
      alive: true,
      sheriff: false,
      revealed: false,
      publiclyRevealed: false,
      abilityState: {
        treasureCards: shuffledCards[index].treasureCards || undefined
      },
      marks: []
    }));
  }

  function dealTreasureMasterBoard(board, seats) {
    const pool = flattenEntries(board.deckPool);
    const treasureCards = [];
    board.specialRules.treasureMaster.fixedCards.forEach((roleId) => {
      treasureCards.push(removeOne(pool, roleId));
    });
    treasureCards.push(pickTreasureGodCard(pool, board));

    const playerCards = [
      {
        roleId: board.playerSpecialRole.roleId,
        camp: "WOLF",
        treasureCards: treasureCards.map((card) => card.roleId)
      },
      ...pool
    ];

    if (playerCards.length !== board.playerCount) {
      throw new Error(`盗宝大师版型场上牌数应为 ${board.playerCount}，实际为 ${playerCards.length}`);
    }
    return assignCards(seats, playerCards);
  }

  function dealBoard(boardId, seats) {
    const board = getBoard(boardId);
    if (!board) throw new Error("版型不存在");
    if (seats.length !== board.playerCount) throw new Error(`需要 ${board.playerCount} 个座位才能发牌`);
    if (board.id === "treasure_master") return dealTreasureMasterBoard(board, seats);

    const cards = flattenEntries(board.roles);
    if (cards.length !== board.playerCount) {
      throw new Error(`版型牌数应为 ${board.playerCount}，实际为 ${cards.length}`);
    }
    return assignCards(seats, cards);
  }

  async function setView(view) {
    state.view = view;
    saveState();
    if (IS_REMOTE && state.currentRoomId && AUTO_REFRESH_VIEWS.includes(view)) {
      try {
        await refreshRemoteRoom();
      } catch (error) {
        window.alert(error.message);
      }
    }
    render();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function pageHeader(title, subtitle) {
    return `<section><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></section>`;
  }

  function renderRuleMarkdown(markdown) {
    const inline = (text) => escapeHtml(text).replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const lines = String(markdown || "").split("\n");
    const parts = [];
    let inCode = false;
    let codeLines = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.startsWith("```")) {
        if (inCode) { parts.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`); codeLines = []; }
        inCode = !inCode;
      } else if (inCode) codeLines.push(line);
      else if (/^\|/.test(line)) {
        const rows = [];
        while (index < lines.length && /^\|/.test(lines[index])) {
          const cells = lines[index].split("|").slice(1, -1).map((cell) => cell.trim());
          if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells);
          index += 1;
        }
        index -= 1;
        parts.push(`<div class="rules-table-wrap"><table>${rows.map((cells, row) => `<tr>${cells.map((cell) => row ? `<td>${inline(cell)}</td>` : `<th>${inline(cell)}</th>`).join("")}</tr>`).join("")}</table></div>`);
      } else if (/^#{1,4}\s/.test(line)) {
        const heading = line.match(/^(#{1,4})\s+(.*)$/);
        const level = Math.min(4, heading[1].length + 1);
        parts.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      } else if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
        const entries=[];
        const start = ordered ? Number(line.match(/\d+/)[0]) : 1;
        while(index < lines.length && pattern.test(lines[index])) {
          entries.push(`<li>${inline(lines[index].replace(pattern, ""))}</li>`);
          index++;
        }
        index--;
        parts.push(ordered ? `<ol start="${start}">${entries.join("")}</ol>` : `<ul>${entries.join("")}</ul>`);
      }
      else if (/^>/.test(line)) parts.push(`<p class="rules-note">${inline(line.replace(/^>\s?/, ""))}</p>`);
      else if (line.trim() && !/^---+$/.test(line.trim())) parts.push(`<p>${inline(line)}</p>`);
    }
    if (inCode && codeLines.length) parts.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
    return parts.join("");
  }

  function rulebookNightExamples(board, night) {
    const specs = [...(board.roles || board.deckPool || []), ...(board.playerSpecialRole ? [board.playerSpecialRole] : [])];
    const assignments = specs.flatMap((role) => Array.from({ length: role.count }, () => ({ roleId: role.roleId, camp: role.camp, alive: true })));
    assignments.forEach((assignment, index) => { assignment.seat = index + 1; });
    const example = { boardId: board.id, night, assignments, nightActions: [], seats: assignments.map((item) => ({ seat: item.seat, occupied: true })), lastWindDirection: "calm" };
    return createNightSteps(board.id, night, example).map((step) => `<li><strong>${escapeHtml(step.label)}</strong><br>${escapeHtml(getJudgeScript(step, example))}</li>`).join("");
  }

  function renderRulebook() {
    const board = BOARDS.find((item) => item.id === rulebookBoardId);
    const back = `<button class="button" data-action="rulebook-back">${rulebookReturnView === "room" ? "返回房间" : "返回首页"}</button>`;
    const toolbar = `<nav class="rulebook-toolbar" aria-label="规则页导航">${back}<span class="rulebook-location">规则手册</span>${board ? '<button class="button" data-action="rulebook-list">全部版型</button>' : ""}</nav>`;
    if (!board) {
      app.innerHTML = `${toolbar}${pageHeader("版型规则", "选择一个版型查看规则和法官流程")}
        <section class="panel"><div class="list">${BOARDS.map((item) => `<button class="button" data-action="open-rulebook" data-board-id="${item.id}">${escapeHtml(item.name)}</button>`).join("")}</div></section>${back}`;
      return;
    }
    if (!rulebookData) {
      app.innerHTML = `${toolbar}${pageHeader(board.name, "版型规则")}<section class="panel"><div class="notice">${escapeHtml(rulebookError || "正在加载规则文档…")}</div></section>${back}`;
      return;
    }
    const markdown = rulebookData.boards?.[board.id];
    app.innerHTML = `${toolbar}<header class="rulebook-hero">${pageHeader(board.name, "版型规则 · 法官参考")}<div class="rulebook-chapters" aria-label="章节导航"><a href="#rulebook-rules">版型规则</a><a href="#rulebook-night">夜间流程词</a><a href="#rulebook-day">白天流程词</a></div></header>
      <section class="panel"><div class="label">身份配置</div><div class="body-text">${escapeHtml(board.roleSummary || "12 人局")}</div><div class="notice">文档版本 ${escapeHtml(rulebookData.version || "未知")}；对局中请以实际行动步骤和法官裁定为准。</div></section>
      <section id="rulebook-rules" class="panel rulebook-content rulebook-document">${markdown ? renderRuleMarkdown(markdown) : '<div class="notice">该版型规则文档尚未生成。</div>'}</section>
      <section id="rulebook-night" class="panel rulebook-content rulebook-cues"><h2>法官夜间流程词参考</h2><p>以下为全员存活、技能未消耗时的参考步骤；身份出局、技能消耗、盗宝牌或特殊状态可能改变实际流程。</p><h3>首夜</h3><ol>${rulebookNightExamples(board, 1)}</ol>${board.id === "treasure_master" ? '<p>首夜狼队线下互认，不进行狼刀。</p>' : ""}<h3>后续夜晚</h3><ol>${rulebookNightExamples(board, 2)}</ol>${board.id === "dark_destruction_2" ? '<p>莉娅充能成功后，后续可选择开启迷雾；已使用的技能不再重复。</p>' : ""}</section>
      <section id="rulebook-day" class="panel rulebook-content rulebook-cues"><h2>法官白天流程词参考</h2><p>警上：请需要竞选警长的玩家示意；根据桌面实际流程记录上警、退水及警徽结果。记录本身可选。</p><p>警下：宣布昨夜死亡或平安夜；请玩家依次发言。投票结束后宣布票型、放逐或无人出局，并处理相关技能及延迟死亡。</p><p>警上自爆时先公布昨夜死讯并处理相关结算，再进入下一夜；首轮竞选延期，延期竞选再次自爆则警徽流失。</p></section>
      <button class="button" data-action="rulebook-list">查看全部版型</button>${back}`;
  }

  async function openRulebook(boardId) {
    rulebookBoardId = BOARDS.some((item) => item.id === boardId) ? boardId : "";
    if (state.view !== "rulebook") rulebookReturnView = state.view === "room" ? "room" : "home";
    state.view = "rulebook";
    rulebookData = null;
    rulebookError = "";
    render();
    try {
      const response = await fetch("./rulebook-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("规则文档加载失败");
      rulebookData = await response.json();
    } catch (error) { rulebookError = "规则文档加载失败。请确认已运行规则构建并通过本地服务访问。"; }
    if (state.view === "rulebook") render();
  }

  function renderAdmin() {
    const back = '<button class="button" data-action="admin-exit">返回首页</button>';
    if (!adminArchives) {
      app.innerHTML = `${pageHeader("管理员", "查看进行中与已结束的对局档案")}
        <section class="panel stack"><label class="field"><span class="label">管理员密码</span><input class="input" id="adminPassword" type="password" autocomplete="current-password" /></label>
        ${adminError ? `<div class="notice">${escapeHtml(adminError)}</div>` : ""}<button class="button primary" data-action="admin-login">登录</button></section>${back}`;
      return;
    }
    if (adminArchive) {
      const archive = adminArchive;
      const assignments = (archive.assignments || []).map((item) => `<div class="list-item"><span>${Number(item.seat)}号 · ${escapeHtml(getRole(item.roleId)?.name || item.roleId)}</span><span>${item.alive === false ? "已出局" : "存活"}</span></div>`).join("");
      const actions = (archive.nightActions || []).map((item) => `<div class="list-item">第 ${Number(item.night)} 夜 · ${escapeHtml(formatNightAction(item))}</div>`).join("");
      const voteRows = (archive.dayVoteHistory || []).map((vote) => `<div class="list-item"><div><strong>第 ${Number(vote.day)} 天 · 第 ${Number(vote.round)} 轮</strong><div>${(vote.votes || []).map((item) => `${Number(item.voterSeat)}号→${Number(item.targetSeat) ? `${Number(item.targetSeat)}号` : "弃票"}`).join("、")}</div></div></div>`).join("");
      const activeVotes = archive.activeBallot?.votes ? Object.entries(archive.activeBallot.votes).map(([seat, target]) => `${Number(seat)}号→${Number(target) ? `${Number(target)}号` : "弃票"}`).join("、") : "";
      const abortedVotes = (archive.abortedBallots || []).map((ballot) => `第 ${Number(ballot.day)} 天第 ${Number(ballot.round)} 轮（自爆中止）：${Object.entries(ballot.votes || {}).map(([seat, target]) => `${Number(seat)}号→${Number(target) ? `${Number(target)}号` : "弃票"}`).join("、") || "无已提交票"}`).join("；");
      const logs = (archive.logs || []).map((entry) => { const item = formatLog(entry); return `<div class="list-item"><div><strong>${escapeHtml(item.title)}</strong><div>${escapeHtml(item.detail)}</div></div></div>`; }).join("");
      app.innerHTML = `${pageHeader("对局档案", `${escapeHtml(getBoard(archive.boardId)?.name || archive.boardId)} · 房间 ${escapeHtml(archive.roomId)}`)}
        <section class="panel"><div class="label">当前状态</div><div class="value">${escapeHtml(getPhaseName(archive.phase))} · 第 ${Number(archive.night || 0)} 夜</div></section>
        <section class="panel"><div class="label">身份牌</div><div class="list">${assignments || "暂无身份"}</div></section>
        <section class="panel"><div class="label">夜间行动</div><div class="list">${actions || "暂无行动"}</div></section>
        <section class="panel"><div class="label">白天票型</div><div class="list">${voteRows || "暂无已完成投票"}</div>${activeVotes ? `<p>进行中：${escapeHtml(activeVotes)}</p>` : ""}${abortedVotes ? `<p>${escapeHtml(abortedVotes)}</p>` : ""}</section>
        <section class="panel"><div class="label">事件记录</div><div class="list">${logs || "暂无记录"}</div></section>
        <button class="button" data-action="admin-list">返回档案列表</button>${back}`;
      return;
    }
    app.innerHTML = `${pageHeader("管理员档案", "包含进行中与已结束对局，请妥善保管")}
      <section class="panel"><div class="list">${adminArchives.length ? adminArchives.map((item) => `<button class="button" data-action="admin-detail" data-id="${escapeHtml(item.id)}">${escapeHtml(getBoard(item.board_id)?.name || item.board_id)} · 房间 ${escapeHtml(item.room_id)} · ${escapeHtml(getPhaseName(item.phase))}</button>`).join("") : '<div class="notice">暂无档案；只有启用归档后产生或更新的对局会出现在这里。</div>'}</div></section>
      ${adminOffset > 0 ? '<button class="button" data-action="admin-prev">上一页</button>' : ""}${adminNextOffset !== null ? '<button class="button" data-action="admin-next">下一页</button>' : ""}
      <button class="button" data-action="admin-logout">退出管理员</button>${back}`;
  }

  async function loadAdminArchives(offset = 0) {
    const data = await apiRequest(`/api/admin/archives?offset=${offset}`);
    adminArchives = data.archives;
    adminNextOffset = data.nextOffset;
    adminOffset = offset;
    adminArchive = null;
    adminError = "";
  }

  function renderHome() {
    const room = getCurrentRoom();
    app.innerHTML = `
      <section class="landing-scene${room ? " has-resume" : ""}" aria-label="最后一夜 · S2 回归基本功">
        <div class="landing-ambience" aria-hidden="true"></div>
        <img class="landing-art" src="./assets/home-moonlit-council-20261101.png" alt="月夜石厅中，十二张空椅围绕烛光圆桌" fetchpriority="high" />
        <div class="landing-shade" aria-hidden="true"></div>
        <header class="landing-masthead">
          <span class="landing-wordmark"><span aria-hidden="true">☾</span> LAST–NIGHT</span>
          <button class="landing-text-button" data-action="admin-open">管理员入口 <span aria-hidden="true">↗</span></button>
          ${room ? `<button class="landing-resume" data-action="view" data-view="room"><span><small>继续当前房间</small><strong>${escapeHtml(room.id)} · ${escapeHtml(getBoard(room.boardId)?.name || "对局")}</strong></span><span aria-hidden="true">→</span></button>` : ""}
        </header>
        <section class="landing-intro" aria-labelledby="landing-title">
          <p class="landing-season"><span>S2</span><i aria-hidden="true"></i>回归基本功</p>
          <h1 id="landing-title"><img class="landing-title-art" src="./assets/branding/last-night-wordmark-v1.svg?v=20261101-no-moon" alt="最后一夜" width="4480" height="1420" fetchpriority="high" /></h1>
          <p class="landing-english">LAST NIGHT</p>
          <div class="landing-ornament" aria-hidden="true"><span></span>✧<span></span></div>
          <p class="landing-tagline">回到桌前，重新开局。</p>
        </section>
        <section class="landing-entry" aria-label="开始游戏">
          <div class="landing-actions">
            <button class="landing-action is-primary" data-action="view" data-view="create"><span>创建房间</span><span aria-hidden="true">→</span></button>
            <button class="landing-action" data-action="view" data-view="join"><span>加入房间</span><span aria-hidden="true">→</span></button>
          </div>
          <nav class="landing-navigation" aria-label="了解游戏">
            <button class="landing-text-button" data-action="home-boards" aria-haspopup="dialog">版型与规则 <span aria-hidden="true">⌄</span></button>
          </nav>
        </section>
      </section>
      <dialog class="landing-panel" id="home-board-dialog" aria-labelledby="home-board-title">
        <header class="landing-panel-heading"><div><p class="landing-kicker">LAST NIGHT</p><h2 id="home-board-title">版型与规则</h2></div><button class="landing-close" data-action="home-boards-close" aria-label="关闭版型列表">×</button></header>
        <p class="landing-panel-note">${BOARDS.length} 套固定版型，选择一套了解规则与法官流程。</p>
        <div class="landing-board-list">${BOARDS.map((board, index) => `<button class="landing-board" data-action="open-rulebook" data-board-id="${board.id}"><span class="landing-board-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span><strong>${escapeHtml(board.name)}</strong><small>${escapeHtml(board.tagline || board.roleSummary || "12 人局")}</small></span><span aria-hidden="true">›</span></button>`).join("")}</div>
      </dialog>
    `;
    const dialog = app.querySelector?.("#home-board-dialog");
    dialog?.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  }

  function renderCreate() {
    app.innerHTML = `
      ${pageHeader("创建房间", IS_REMOTE ? "选择模式和版型，生成一个可分享房间" : "选择模式和版型，生成一个本地房间")}
      <section class="panel stack">
        <div>
          <div class="label">模式</div>
          <div class="segmented" id="modeSelector">
            <button class="segment active" data-mode="JUDGE">有法官</button>
            <button class="segment" data-mode="SYSTEM" ${!IS_REMOTE ? "disabled" : ""}>无法官</button>
          </div>
        </div>
        <label class="field">
          <span class="label">版型</span>
          <select class="select" id="boardSelect">
            ${BOARDS.map((board) => `<option value="${board.id}">${board.name}</option>`).join("")}
          </select>
        </label>
        ${!IS_REMOTE ? '<div class="notice">双击 HTML 仅供有法官静态演示。无法官计时、权限与播报需要服务端：请运行项目中的 start-web-server.cmd，再打开 http://localhost:5173；不要把 file 页面用于实际无法官对局。原有浏览器数据不会删除。</div>' : ""}
        <label class="field hidden" id="systemTimeoutField">
          <span class="label">夜间行动超时</span>
          <select class="select" id="systemStepTimeout">
            <option value="0">关闭</option>
            <option value="60">60 秒</option>
            <option value="90">90 秒</option>
            <option value="120">120 秒</option>
          </select>
          <span class="notice">超时后仅由控制设备决定继续等待、重播或强制跳过。</span>
        </label>
        <div class="body-text" id="boardTagline">${BOARDS[0].tagline || ""}</div>
      </section>
      <button class="button primary" data-action="create-room">创建</button>
      <button class="button" data-action="view" data-view="home">返回</button>
    `;

    let selectedMode = "JUDGE";
    app.querySelector("#modeSelector").addEventListener("click", (event) => {
      const button = event.target.closest("[data-mode]");
      if (!button) return;
      selectedMode = button.dataset.mode;
      app.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      app.querySelector("#systemTimeoutField").classList.toggle("hidden", selectedMode !== "SYSTEM");
    });

    app.querySelector("#boardSelect").addEventListener("change", (event) => {
      const board = getBoard(event.target.value);
      const summary = app.querySelector("#boardTagline");
      const tagline = app.querySelector("#boardTagline");
      tagline.textContent = board.tagline || "";
      tagline.classList.toggle("hidden", !board.tagline);
    });

    app.querySelector("[data-action='create-room']").addEventListener("click", async () => {
      try {
        if (IS_REMOTE) {
          const data = await apiRequest("/api/rooms", {
            method: "POST",
            body: JSON.stringify({
              clientId: state.currentUserId,
              balanceProfileId: state.balanceProfileId,
              mode: selectedMode,
              boardId: app.querySelector("#boardSelect").value,
              systemStepTimeoutSeconds: Number(app.querySelector("#systemStepTimeout").value || 0),
              fixedNightFlow: 1
            })
          });
          state.currentRoomId = data.room.id;
          state.remoteRoom = data.room;
          state.judgeTokens[data.room.id] = data.judgeToken;
          state.view = "room";
          saveState();
          render();
          return;
        }

        const room = createRoom({
          mode: selectedMode,
          boardId: app.querySelector("#boardSelect").value
        });
        state.rooms[room.id] = room;
        state.currentRoomId = room.id;
        writeLog(room, "ROOM_CREATED", { mode: room.mode, boardId: room.boardId });
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  function renderRandomizer() {
    const backView = getCurrentRoom() ? "room" : "home";
    app.innerHTML = `
      ${pageHeader("发言顺序", "随机 1-12 号，并随机顺序或逆序")}
      <section class="panel randomizer-panel">
        <div class="label">抽取结果</div>
        <div id="randomizerResult" class="randomizer-empty">点击下方按钮开始随机</div>
      </section>
      <button class="button primary" data-action="random-speaking">随机发言顺序</button>
      <button class="button" data-action="view" data-view="${backView}">${backView === "room" ? "返回房间" : "返回首页"}</button>
    `;
  }

  function renderJoin() {
    app.innerHTML = `
      ${pageHeader("加入房间", IS_REMOTE ? "输入房间号加入同一个联机房间" : "当前静态网页版只能加入本机浏览器创建过的房间")}
      <section class="panel">
        <label class="field">
          <span class="label">房间号</span>
          <input class="input" id="joinRoomId" inputmode="numeric" maxlength="6" placeholder="输入 6 位房间号" />
        </label>
      </section>
      <button class="button primary" data-action="join-room">加入</button>
      <button class="button" data-action="view" data-view="home">返回</button>
    `;

    app.querySelector("[data-action='join-room']").addEventListener("click", async () => {
      const roomId = app.querySelector("#joinRoomId").value.trim();
      try {
        if (IS_REMOTE) {
          state.currentRoomId = roomId;
          await remotePost("join");
          state.view = "room";
          saveState();
          render();
          return;
        }
        if (!state.rooms[roomId]) {
          window.alert("房间不存在。静态版暂不支持跨设备房间同步。");
          return;
        }
        state.currentRoomId = roomId;
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
    });
  }

  function renderRoom() {
    const room = getCurrentRoom();
    if (!room) {
      state.view = "home";
      saveState();
      render();
      return;
    }
    const board = getBoard(room.boardId);
    const mySeat = getMySeat(room);
    const myAssignment = mySeat ? (room.assignments || []).find((item) => item.seat === mySeat.seat) : null;
    const occupiedCount = room.seats.filter((seat) => seat.occupied).length;
    const isJudge = !IS_REMOTE || room.isJudge;
    const isController = Boolean(room.isController);
    const canControl = isJudge || (room.mode === "SYSTEM" && isController);
    const gameOver = room.phase === "GAME_OVER";
    const gameOutcomeText = room.gameOutcome?.result === "GOOD_WIN"
      ? "好人阵营获胜"
      : room.gameOutcome?.result === "WOLF_WIN"
        ? "狼人阵营获胜"
        : "游戏已结束";
    const canDeal = canControl && room.phase === "WAITING" && occupiedCount === board.playerCount;
    const shareUrl = IS_REMOTE ? `${location.origin}${location.pathname}?room=${room.id}` : "";
    const latestDeaths = latestRecord(room.deathRecords);
    const latestExile = latestRecord(room.exileRecords);
    const sheriffCandidates = room.sheriffCandidates || [];
    const sheriffWithdrawn = room.sheriffWithdrawn || [];
    const sheriffActive = sheriffCandidates.filter((seat) => !sheriffWithdrawn.includes(seat));
    const sheriffVote = room.sheriffVoteRecord;
    const sheriffBadge = room.sheriffBadge || { holderSeat: 0, lost: false };
    const isJudgeDaySections = isJudge && room.mode === "JUDGE" && room.phase === "DAY";
    const isSheriffElectionDay = room.phase === "DAY"
      && (room.night === 1 || (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1));
    const sheriffElectionStageName = room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1 ? "延期竞选" : "首次竞选";
    const dayVote = room.dayVoteRecord && room.dayVoteRecord.day === room.night ? room.dayVoteRecord : null;
    const sheriffElectionDone = isSheriffElectionFinished(room);
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK");
    const exileRecorded = (room.exileRecords || []).some((record) => record.day === room.night);
    const canRecordDaybreakDeaths = room.phase === "DAY" && isJudge && !daybreakRecorded;
    const canRunDayActions = room.phase === "DAY" && (isJudge || (room.mode === "SYSTEM" && isController));
    const isDarkBoard = isDarkDestruction(room);
    const canRecordDayVotes = room.phase === "DAY" && (isJudge || (room.mode === "SYSTEM" && isController));
    const darkBallot = room.activeDarkBallot || null;
    const darkFogActiveForDay = IS_REMOTE
      ? Number(room.darkFogDay || 0) === Number(room.night)
      : Number(room.liaFogDay || 0) === Number(room.night) && Number(room.darkFogAnnouncedDay || 0) === Number(room.night);
    const darkFogAnnouncementPending = IS_REMOTE
      ? Boolean(room.darkFogAnnouncementPending)
      : isDarkBoard && Number(room.darkFogAnnouncedDay || 0) !== Number(room.night);
    const darkBallotSubmitted = Boolean(room.myDarkBallot || (mySeat && darkBallot?.votes && Object.prototype.hasOwnProperty.call(darkBallot.votes, String(mySeat.seat))));
    const darkBallotCanVote = Boolean(darkBallot?.status === "OPEN" && mySeat && darkBallot.voterSeats?.includes(mySeat.seat) && (room.aliveSeats || []).includes(mySeat.seat));
    const darkBallotCanControl = Boolean(room.mode === "SYSTEM" && isController);
    const darkBallotRound = room.dayVoteRecord?.day === room.night && room.dayVoteRecord.round === 1 && room.dayVoteRecord.pkSeats?.length > 1 ? 2 : 1;
    const pendingRevival = room.pendingArchangelRevival || room.myPendingArchangelRevival || null;
    const pendingExileResult = room.pendingExileResult || null;
    const activeDaySkillWindow = room.activeDaySkillWindow || null;
    const pendingDelayedDeaths = room.myDelayedDeath ? [room.myDelayedDeath] : (room.pendingDelayedDeaths || []).filter((item) => item.day === room.night);
    const pendingDeathSkills = room.myDeathSkill ? [room.myDeathSkill] : (room.pendingDeathSkills || []).filter((item) => item.day === room.night).slice(0, 1);
    const aliveSkillTargets = new Set(Array.isArray(room.aliveSeats) ? room.aliveSeats : (room.assignments || []).filter((item) => item.alive !== false).map((item) => item.seat));
    const canEnterJudgeNextNight = canRunDayActions
      && daybreakRecorded
      && exileRecorded
      && !room.pendingNightResolution
      && !room.activeDarkBallot
      && !pendingRevival
      && !(room.systemPendingTasks?.archangelRevival)
      && !pendingExileResult
      && !activeDaySkillWindow
      && !room.orderPrinceRevotePending
      && !pendingDelayedDeaths.length
      && !pendingDeathSkills.length;
    const publicReveals = IS_REMOTE ? room.publicReveals || [] : (room.assignments || []).filter((assignment) => assignment.roleId === "idiot" && (
      assignment.publiclyRevealed || (assignment.revealed && (room.exileRecords || []).some((record) => Number(record.seat) === Number(assignment.seat)))
    ));
    const suggestedDeaths = canRecordDaybreakDeaths ? calculateSuggestedDeaths(room, room.night) : [];
    const canSelfWithdraw = room.mode === "SYSTEM" && !isJudge && isSheriffElectionDay && mySeat && sheriffCandidates.includes(mySeat.seat) && !sheriffWithdrawn.includes(mySeat.seat);
    const canSelfDestruct = IS_REMOTE && room.mode === "SYSTEM" && !canControl && room.phase === "DAY"
      && myAssignment?.alive !== false && myAssignment?.roleId !== "mixed_blood"
      && myAssignment?.roleId !== "mechanical_wolf" && myAssignment?.roleId !== "lia"
      && (myAssignment?.currentCamp || myAssignment?.camp) === "WOLF";
    const systemTimeout = room.systemNight?.timeout || null;
    const systemTimeoutRemaining = systemTimeout?.deadlineAt
      ? Math.max(0, Math.ceil((systemTimeout.deadlineAt - Date.now()) / 1000))
      : 0;
    const systemSkillRemaining = room.systemSkillDeadlineAt
      ? Math.max(0, Math.ceil((room.systemSkillDeadlineAt - Date.now()) / 1000))
      : 0;
    const controllerTransferActive = Boolean(
      room.controllerTransferCode
      && room.controllerTransferExpiresAt
      && room.controllerTransferExpiresAt > Date.now(),
    );
    const treasureMaskedFinalNightNotice = room.myTreasureMaskedFinalNight
      ? '<section class="panel danger-panel"><div class="label">濒死最终夜</div><div class="body-text">你将在本夜完成一次最终刀；你已不属于存活玩家，无法被摄梦人选择。</div></section>'
      : "";
    const judgeNextStep = getJudgeNextStep(room);
    const judgeSheriffActions = [
      room.pendingSheriffSelfDestructSeat && canRecordDaybreakDeaths ? '<div class="notice phase-detail">警上自爆后，请先在警上宣布昨夜死讯，再处理相关结算。</div><button class="button primary" data-action="view" data-view="death">警上宣布昨夜死讯</button>' : "",
      room.pendingSheriffSelfDestructSeat && canRecordDaybreakDeaths && suggestedDeaths.length ? '<button class="button" data-action="use-suggested-deaths">带入建议死亡</button>' : "",
      isSheriffElectionDay && Number(room.sheriffStageClosedDay || 0) !== Number(room.night) ? '<button class="button" data-action="sheriff-stage-close">结束警上 / 进入警下</button>' : "",
      isSheriffElectionDay && !sheriffElectionDone ? `<div class="notice phase-detail">${sheriffElectionStageName}：可记录上警、退水与警徽结果；这些记录不阻止进入下一夜。</div><button class="button" data-action="view" data-view="sheriff">记录上警</button>` : "",
      isSheriffElectionDay && sheriffCandidates.length ? '<button class="button" data-action="view" data-view="withdraw">记录退水</button>' : "",
      isSheriffElectionDay && sheriffActive.length ? '<button class="button" data-action="view" data-view="sheriffVote">记录警徽投票</button>' : "",
      isSheriffElectionDay && !sheriffBadge.lost ? '<button class="button" data-action="view" data-view="badge">处理 / 记录警徽</button>' : "",
      isSheriffElectionDay && !sheriffElectionDone && (room.assignments || []).some((item) => item.alive !== false && (item.currentCamp || item.camp) === "WOLF" && !["mixed_blood", "mechanical_wolf", "lia"].includes(item.roleId))
        ? `<div class="death-skill-action sheriff-self-destruct"><div class="notice">${sheriffElectionStageName}期间狼人自爆会中断竞选；首次延期到次日，延期竞选再次自爆则警徽流失。</div><select class="input" id="sheriffSelfDestructSeat"><option value="0">选择自爆狼人座位</option>${(room.assignments || []).filter((item) => item.alive !== false && (item.currentCamp || item.camp) === "WOLF" && !["mixed_blood", "mechanical_wolf", "lia"].includes(item.roleId)).map((item) => `<option value="${item.seat}">${item.seat}号</option>`).join("")}</select><button class="button danger" data-action="sheriff-election-self-destruct">记录狼人自爆</button></div>` : ""
    ];
    const judgeDayActions = [
      canRecordDaybreakDeaths && !room.pendingSheriffSelfDestructSeat ? '<button class="button" data-action="view" data-view="death">记录 / 宣布夜间死讯</button>' : "",
      canRecordDaybreakDeaths && !room.pendingSheriffSelfDestructSeat && suggestedDeaths.length ? '<button class="button" data-action="use-suggested-deaths">带入建议死亡</button>' : "",
      room.canCorrectDayRecord || (!IS_REMOTE && room.dayRecordUndo) ? '<button class="button" data-action="day-record-correct">撤销最近当日记录并重填</button>' : "",
      '<button class="button" data-action="view" data-view="badge">处理 / 记录警徽</button>',
      ...pendingDelayedDeaths.map((item) => `<button class="button danger" data-action="confirm-delayed-death" data-seat="${item.seat}">确认 ${item.seat}号发言结束死亡</button>`),
      ...pendingDeathSkills.map((item) => `<div class="death-skill-action"><div class="notice">法官台词：等待 ${item.seat}号玩家决定是否发动技能。</div><select class="input" id="deathSkillTarget-${item.seat}"><option value="0">选择开枪目标</option>${room.seats.filter((seat) => aliveSkillTargets.has(seat.seat) && seat.seat !== item.seat).map((seat) => `<option value="${seat.seat}">${seat.seat}号</option>`).join("")}</select><button class="button danger" data-action="death-skill-submit" data-seat="${item.seat}">确认开枪</button><button class="button" data-action="death-skill-skip" data-seat="${item.seat}">不开枪</button></div>`),
      pendingRevival ? `<div class="death-skill-action"><div class="notice">法官台词：等待天使长决定是否复活 ${pendingRevival.seat}号玩家。</div>${pendingRevival.canRevive === false ? '<div class="notice">当前不能发动复活，保留台词。</div>' : '<button class="button primary" data-action="archangel-revival" data-use="true">复活</button>'}<button class="button" data-action="archangel-revival" data-use="false">不复活，继续结算</button></div>` : "",
      (canRecordDayVotes || activeDaySkillWindow) && (pendingExileResult || activeDaySkillWindow) ? '<button class="button" data-action="view" data-view="orderPrince">处理白天技能窗口</button>' : "",
      isDarkBoard && canRecordDayVotes && daybreakRecorded && sheriffElectionDone && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !room.systemPendingTasks?.archangelRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length && !darkBallot && darkFogAnnouncementPending ? '<button class="button primary" data-action="dark-fog-announce">警下公布禁锢与迷雾状态</button>' : "",
      canRecordDayVotes && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length && (!isDarkBoard || !darkFogAnnouncementPending) ? `<button class="button" data-action="view" data-view="dayVote">${room.orderPrinceRevotePending ? "记录回溯重投" : "记录线下放逐投票"}</button>` : "",
      canRunDayActions && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length ? '<button class="button primary" data-action="view" data-view="exile">直接记录放逐结果</button>' : "",
      `<button class="button primary next-night-button" data-action="start-night">进入下一夜</button>`
    ];
    const mainActions = [
      room.phase === "WAITING" ? `<button class="button primary" data-action="deal" ${canDeal ? "" : "disabled"}>发牌</button>` : "",
      IS_REMOTE && room.mode === "SYSTEM" && isController && !room.fixedNightFlow ? '<button class="button" data-action="system-upgrade-flow">升级旧房间流程（处理完待办后、下一夜前）</button>' : "",
      room.phase === "DEALT" && canControl ? '<button class="button primary" data-action="start-night">开始第一夜</button>' : "",
      !isJudgeDaySections && room.mode === "SYSTEM" && isController && isSheriffElectionDay && Number(room.sheriffStageClosedDay || 0) !== Number(room.night) ? '<button class="button" data-action="sheriff-stage-close">结束警上 / 进入警下</button>' : "",
      !isJudgeDaySections && isSheriffElectionDay && canRunDayActions ? '<button class="button" data-action="view" data-view="sheriff">记录上警</button>' : "",
      !isJudgeDaySections && isSheriffElectionDay && canRunDayActions && sheriffCandidates.length ? '<button class="button" data-action="view" data-view="withdraw">记录退水</button>' : "",
      canSelfWithdraw ? '<button class="button" data-action="self-withdraw">我要退水</button>' : "",
      !isJudgeDaySections && isSheriffElectionDay && canRunDayActions && sheriffActive.length ? '<button class="button" data-action="view" data-view="sheriffVote">记录警徽投票</button>' : "",
      !isJudgeDaySections && !gameOver && isJudge && sheriffBadge.holderSeat ? '<button class="button" data-action="view" data-view="badge">处理警徽</button>' : "",
      !isJudgeDaySections && canRecordDaybreakDeaths ? '<button class="button" data-action="view" data-view="death">记录天亮死亡</button>' : "",
      !isJudgeDaySections && canRecordDaybreakDeaths && suggestedDeaths.length ? '<button class="button" data-action="use-suggested-deaths">带入建议死亡</button>' : "",
      !isJudgeDaySections && (room.canCorrectDayRecord || (!IS_REMOTE && room.dayRecordUndo)) ? '<button class="button" data-action="day-record-correct">撤销最近当日记录并重填</button>' : "",
      room.mode === "SYSTEM" && isController && room.systemDaybreakReady ? '<button class="button primary" data-action="system-publish-daybreak">公布昨夜死讯</button>' : "",
      !isJudgeDaySections && pendingDelayedDeaths.map((item) => `<button class="button danger" data-action="confirm-delayed-death" data-seat="${item.seat}">确认 ${item.seat}号发言结束死亡</button>`),
      !isJudgeDaySections && pendingDeathSkills.map((item) => `<div class="death-skill-action"><div class="notice">${item.seat}号可以发动死亡技能</div><select class="input" id="deathSkillTarget-${item.seat}"><option value="0">选择开枪目标</option>${room.seats.filter((seat) => aliveSkillTargets.has(seat.seat) && seat.seat !== item.seat).map((seat) => `<option value="${seat.seat}">${seat.seat}号</option>`).join("")}</select><button class="button danger" data-action="death-skill-submit" data-seat="${item.seat}">确认开枪</button><button class="button" data-action="death-skill-skip" data-seat="${item.seat}">不开枪</button></div>`),
      !isJudgeDaySections && pendingRevival && (isJudge || room.myPendingArchangelRevival) ? `<div class="death-skill-action"><div class="notice">天使长决定是否复活 ${pendingRevival.seat}号玩家</div><button class="button primary" data-action="archangel-revival" data-use="true">复活</button><button class="button" data-action="archangel-revival" data-use="false">不复活，继续结算</button></div>` : "",
      !isJudgeDaySections && (canRecordDayVotes || activeDaySkillWindow) && (pendingExileResult || activeDaySkillWindow) ? '<button class="button" data-action="view" data-view="orderPrince">处理白天技能窗口</button>' : "",
      !isJudgeDaySections && isDarkBoard && canRecordDayVotes && daybreakRecorded && sheriffElectionDone && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !room.systemPendingTasks?.archangelRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length && !darkBallot && darkFogAnnouncementPending ? '<button class="button primary" data-action="dark-fog-announce">警下公布禁锢与迷雾状态</button>' : "",
      !isJudgeDaySections && isDarkBoard && canRecordDayVotes && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !room.systemPendingTasks?.archangelRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length && !darkBallot && !darkFogAnnouncementPending ? `<button class="button primary" data-action="dark-ballot-open" data-round="${darkBallotRound}">${darkFogActiveForDay ? (darkBallotRound === 2 ? "再次宣布迷雾并开始 PK" : "公投前再次宣布并开始私密投票") : (darkBallotRound === 2 ? "开始 PK 私密投票" : "开始私密投票")}</button>` : "",
      !isJudgeDaySections && !isDarkBoard && room.mode === "SYSTEM" && isController && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !pendingRevival && !pendingDelayedDeaths.length && !pendingDeathSkills.length && !darkBallot ? `<button class="button primary" data-action="dark-ballot-open" data-round="${darkBallotRound}">${room.orderPrinceRevotePending ? "开始回溯重投" : darkBallotRound === 2 ? "开始手机 PK 投票" : "开始手机投票"}</button>` : "",
      !isJudgeDaySections && room.mode === "SYSTEM" && darkBallot?.status === "OPEN" ? `<button class="button" data-action="view" data-view="darkBallot">${darkBallotCanVote && !darkBallotSubmitted ? "进入手机投票" : "查看投票进度"}</button>` : "",
      !isJudgeDaySections && room.mode === "SYSTEM" && darkBallot?.status === "OPEN" && darkBallotCanControl ? `<button class="button primary" data-action="dark-ballot-close" ${Number(darkBallot.submittedCount || Object.keys(darkBallot.votes || {}).length) < Number(darkBallot.totalVoters || darkBallot.voterSeats?.length || 0) ? "disabled" : ""}>结束投票（${Number(darkBallot.submittedCount || Object.keys(darkBallot.votes || {}).length)}/${Number(darkBallot.totalVoters || darkBallot.voterSeats?.length || 0)}）</button>` : "",
      !isJudgeDaySections && canRecordDayVotes && !isDarkBoard && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !darkBallot ? `<button class="button" data-action="view" data-view="dayVote">${room.orderPrinceRevotePending ? "线下记录回溯重投" : "线下录入票型"}</button>` : "",
      !isJudgeDaySections && canRunDayActions && !isDarkBoard && daybreakRecorded && !exileRecorded && !pendingExileResult && !activeDaySkillWindow && !darkBallot ? '<button class="button" data-action="view" data-view="exile">线下记录放逐结果</button>' : "",
      !isJudgeDaySections && room.phase === "DAY" ? '<button class="button primary next-night-button" data-action="start-night">进入下一夜</button>' : "",
      room.phase === "NIGHT" && (canControl || room.systemNight?.canAct) ? `<button class="button ${room.systemNight?.canAct ? "primary" : ""}" data-action="view" data-view="night">${room.systemNight?.canAct ? "轮到我行动" : "进入夜间播报"}</button>` : "",
      room.mode === "SYSTEM" && isController && systemTimeout?.expired && !["puppet_select", "mixed_blood_model", "lia_raise", "lilith_bind", "lia_charge", "dreamer_dream", "cain_check"].includes(room.systemNight?.stepId) ? '<button class="button danger" data-action="system-timeout-skip">超时：强制跳过当前步骤</button>' : "",
      room.mode === "SYSTEM" && isController && systemTimeout?.expired && ["puppet_select", "mixed_blood_model", "lia_raise", "lilith_bind", "lia_charge", "dreamer_dream", "cain_check"].includes(room.systemNight?.stepId) ? '<div class="notice">当前为必选步骤，超时不能跳过。</div>' : "",
      room.phase === "WAITING" && canControl ? '<button class="button" data-action="fill-test-seats">补齐测试座位</button>' : ""
    ];
    const infoActions = [
      `<button class="button" data-action="open-rulebook" data-board-id="${board.id}">查看本局版型规则</button>`,
      room.phase !== "WAITING" && !canControl ? '<button class="button primary" data-action="view" data-view="identity">查看我的身份</button>' : "",
      (room.phase === "DEALT" || room.phase === "DAY" || room.phase === "NIGHT" || gameOver) && isJudge ? '<button class="button" data-action="view" data-view="judge">法官总览</button>' : "",
      (room.phase === "DEALT" || room.phase === "DAY" || room.phase === "NIGHT" || gameOver) && isJudge ? '<button class="button" data-action="view" data-view="review">复盘</button>' : "",
      gameOver && room.mode === "SYSTEM" && isController ? '<button class="button" data-action="view" data-view="review">复盘</button>' : "",
      room.mode === "SYSTEM" && room.dayVoteRecord ? '<button class="button" data-action="view" data-view="darkBallot">查看本日票型</button>' : "",
      '<button class="button" data-action="view" data-view="randomizer">随机发言顺序</button>',
      IS_REMOTE ? '<button class="button" data-action="refresh-room">刷新房间</button>' : ""
    ];
    const dangerActions = [
      canSelfDestruct ? '<button class="button danger" data-action="wolf-self-destruct">狼人自爆</button>' : "",
      !gameOver && room.phase !== "WAITING" && canControl ? '<button class="button danger" data-action="game-end">结束游戏</button>' : "",
      `<button class="button danger" data-action="reset">${IS_REMOTE ? "退出当前房间" : "重置本地数据"}</button>`
    ];

    app.innerHTML = `
      ${pageHeader(`房间 ${room.id}`, `${board.name} · ${room.mode === "JUDGE" ? "有法官" : "无法官"} · ${getPhaseName(room.phase)}`)}
      ${IS_REMOTE ? `
        <section class="panel">
          <div class="label">分享链接</div>
          <div class="body-text">${shareUrl}</div>
          <button class="button" data-action="copy-share">复制链接</button>
        </section>
      ` : ""}
      ${IS_REMOTE && isJudge && room.judgeCode ? `
        <section class="panel">
          <div class="label">法官口令</div>
          <div class="value">${room.judgeCode}</div>
          <div class="notice">其他设备输入这个口令，可以进入法官席。</div>
        </section>
      ` : ""}
      ${IS_REMOTE && room.mode === "JUDGE" && !isJudge ? `
        <section class="panel">
          <div class="label">进入法官席</div>
          <input class="input" id="judgeCodeInput" inputmode="numeric" maxlength="4" placeholder="输入 4 位法官口令" />
          <button class="button" data-action="claim-judge">进入法官席</button>
        </section>
      ` : ""}
      ${IS_REMOTE && room.mode === "SYSTEM" && isController ? `
        <section class="panel">
          <div class="label">转让公共控制权</div>
          <div class="body-text">发牌前转让后，你可以选择空座位；发牌后转让仅更换控制设备。</div>
          ${controllerTransferActive ? `<div class="value">${room.controllerTransferCode}</div><div class="notice">转让码有效至 ${new Date(room.controllerTransferExpiresAt).toLocaleTimeString()}，使用一次即失效。</div>` : room.controllerTransferCode ? '<div class="notice">上一组转让码已过期，请重新生成。</div>' : ""}
          <button class="button" data-action="controller-transfer-start">生成六位转让码</button>
        </section>
      ` : ""}
      ${IS_REMOTE && room.mode === "SYSTEM" && !isController && !mySeat ? `
        <section class="panel">
          <div class="label">接管公共控制设备</div>
          <input class="input" id="controllerTransferCodeInput" inputmode="numeric" maxlength="6" placeholder="输入 6 位转让码" />
          <button class="button" data-action="controller-transfer-claim">接管控制权</button>
        </section>
      ` : ""}
      ${treasureMaskedFinalNightNotice}
      <section class="panel">
        <div class="row">
          <div><div class="label">${canControl && IS_REMOTE ? "当前身份" : "当前座位"}</div><div class="value">${canControl && IS_REMOTE ? room.mode === "SYSTEM" ? "公共控制设备" : "法官席" : mySeat ? `${mySeat.seat}号` : "未选择"}</div></div>
          <div><div class="label">人数</div><div class="value">${occupiedCount} / ${board.playerCount}</div></div>
        </div>
        <div class="notice">${canControl ? `当前阶段：${getPhaseName(room.phase)}${room.night ? ` · 第 ${room.night} 天` : ""}` : `我的状态：${getPlayerStatusText({ room, mySeat, sheriffCandidates, sheriffWithdrawn })}`}</div>
        ${room.mode === "SYSTEM" && isController && systemTimeout?.seconds ? `<div class="notice">行动超时：${systemTimeout.expired ? "已超时" : `${systemTimeoutRemaining} 秒后提醒控制设备`}</div>` : ""}
        ${room.mode === "SYSTEM" && room.phase === "DAY" && systemSkillRemaining ? `<div class="notice skill-window-countdown">技能响应窗口：${systemSkillRemaining} 秒后未响应将自动视为不发动。</div>` : ""}
        ${room.boardId === "dawn_voyage" && room.phase === "DAY" && (isJudge ? room.captainAliveAtDawn && room.windDirection : room.announcedWindDirection) ? (() => {
          const windName = { calm: "无风", tailwind: "顺风", headwind: "逆风" };
          const announcedWind = isJudge ? room.windDirection : room.announcedWindDirection;
          const captainAlive = (room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
          const captainDiedThisNight = room.captainAliveAtDawn && !captainAlive;
          const label = "昨夜" + windName[announcedWind] + (isJudge && captainDiedThisNight ? "（法官宣布）" : "");
          return label ? '<div class="notice" style="color:var(--accent);font-weight:600;">' + label + '</div>' : "";
        })() : ""}
        <div class="notice">${canControl ? `下一步：${judgeNextStep.title}。${judgeNextStep.detail}` : getPlayerPhaseText(room, mySeat)}</div>
        ${room.daySkillVoice && isController ? `<div class="notice">技能播报：${room.daySkillVoice.kind === "ORDER_PRINCE" ? "等待定序王子发动技能" : room.daySkillVoice.kind === "ARCHANGEL" ? "等待天使长发动技能" : "等待玩家发动技能"}。${fixedVoiceError ? escapeHtml(fixedVoiceError) : "播报结束后倒计时五秒"}</div><button class="button" data-action="fixed-voice-retry">启用语音 / 重试</button>` : ""}
      </section>
      ${!isJudgeDaySections || !sheriffElectionDone ? `<section class="panel">
        <div class="label">上警玩家${room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1 ? " · 延期竞选" : ""}</div>
        <div class="body-text">${sheriffCandidates.length ? sheriffCandidates.map((seat) => `${seat}号`).join("、") : "暂未记录"}</div>
        <div class="notice">已退水：${sheriffWithdrawn.length ? sheriffWithdrawn.map((seat) => `${seat}号`).join("、") : "无"}</div>
        <div class="notice">仍在警上：${sheriffActive.length ? sheriffActive.map((seat) => `${seat}号`).join("、") : "无"}</div>
        <div class="notice">警徽结果：${sheriffVote ? sheriffVote.electedSeat ? `${sheriffVote.electedSeat}号当选` : sheriffVote.badgeLost ? "警徽流失" : sheriffVote.pkSeats && sheriffVote.pkSeats.length ? `${formatSeatList(sheriffVote.pkSeats)} 平票 PK` : "未产生警长" : sheriffBadge.holderSeat ? `${sheriffBadge.holderSeat}号当选` : sheriffBadge.lost ? "警徽流失" : sheriffElectionDone ? "警上已结束，未记录结果" : "暂未投票"}</div>
        <div class="notice">当前警长：${sheriffBadge.holderSeat ? `${sheriffBadge.holderSeat}号` : sheriffBadge.lost ? "警徽流失" : "暂无"}</div>
      </section>` : ""}
      <section class="panel">
        <div class="label">公开死亡</div>
        <div class="body-text">${latestDeaths ? `第 ${latestDeaths.day} 天：${formatSeatList(latestDeaths.seats)}` : "暂未记录"}</div>
        ${suggestedDeaths.length ? `<div class="notice">建议天亮死亡：${suggestedDeaths.map((item) => `${item.seat}号（${item.reasons.join("、")}）`).join("、")}</div>` : ""}
        ${isJudge && isDarkBoard && room.phase === "DAY" ? `<div class="notice">法官夜间信息：${darkBindingTarget(room, room.night) ? `${darkBindingTarget(room, room.night)}号被禁锢` : "无人被禁锢"}；迷雾${(room.nightActions || []).some((item) => item.night === room.night && item.stepId === "lia_fog" && !item.skipped) ? "开启" : "未开启"}。这些信息请在警下公布。</div>` : ""}
      </section>
      <section class="panel">
        <div class="label">白天放逐</div>
        <div class="body-text">${latestExile ? `第 ${latestExile.day} 天：${latestExile.noExile ? "无人出局" : `${latestExile.seat}号出局`}` : "暂未记录"}</div>
        ${isJudge && latestExile && latestExile.day === room.night && latestExile.rawSeat && latestExile.rawSeat !== latestExile.seat ? `<div class="notice">法官私密提示：${latestExile.rawSeat}号得票最高，因诡术师换号，实际 ${latestExile.seat}号出局。</div>` : ""}
        <div class="notice">投票状态：${dayVote ? dayVote.exiledSeat ? `${dayVote.exiledSeat}号出局` : dayVote.noExile ? "无人出局" : dayVote.pkSeats && dayVote.pkSeats.length ? `${formatSeatList(dayVote.pkSeats)} 平票 PK` : "未产生结果" : "暂未投票"}</div>
        ${publicReveals.length ? `<div class="notice">公开身份：${publicReveals.map((item) => `${item.seat}号${getRole(item.roleId)?.name || item.roleId}`).join("、")}</div>` : ""}
      </section>
      ${gameOver ? `<section class="panel"><div class="value">${gameOutcomeText}</div><div class="notice">可以进入复盘查看身份和操作记录。</div></section>` : ""}
      <section class="seat-grid">
        ${room.seats.map((seat) => {
          const occupied = IS_REMOTE ? Boolean(seat.occupied) : Boolean(seat.occupied && seat.userId);
          const mine = IS_REMOTE ? room.mySeat?.seat === seat.seat : seat.userId === state.currentUserId;
          const className = mine ? "mine" : occupied ? "taken" : "";
          return `<button class="seat ${className}" data-action="choose-seat" data-seat="${seat.seat}" ${canControl && IS_REMOTE || seatSelectionPending ? "disabled" : ""}>${seat.seat}号</button>`;
        }).join("")}
      </section>
      ${isJudgeDaySections && ((!sheriffElectionDone && isSheriffElectionDay) || room.pendingSheriffSelfDestructSeat) ? renderActionPanel(`警上 · ${sheriffElectionStageName}`, [
        `<div class="notice phase-detail">上警、退水和警徽记录仅作桌况记录；除竞选自爆规则外，不作为切夜条件。</div>`,
        ...(isSheriffElectionDay ? ['<div class="notice">法官台词参考：天亮了，请上警玩家五秒内举手，5、4、3、2、1。上警玩家有……请依次发言。退水、自爆环节，5、4、3、2、1。仍留警上的玩家有……请警下玩家投票。</div>'] : []),
        ...judgeSheriffActions,
        ...judgeDayActions.filter((item) => item.includes('deathSkillTarget-') || item.includes('archangel-revival') || item.includes('confirm-delayed-death')),
        '<button class="button primary next-night-button" data-action="start-night">进入下一夜</button>'
      ], "judge-phase-panel sheriff-phase-panel") : ""}
      ${isJudgeDaySections && sheriffElectionDone && !room.pendingSheriffSelfDestructSeat ? renderActionPanel("警下 · 天亮与白天流程", [
        `<div class="notice phase-detail">必须公布夜间死讯并记录放逐对象；技能窗口、延迟死亡和投票结算完成后进入下一夜。</div>`,
        ...(isDarkBoard && sheriffElectionDone ? [(() => {
          const bound = darkBindingTarget(room, room.night);
          const fog = (room.nightActions || []).some((item) => item.night === room.night && item.stepId === "lia_fog" && !item.skipped);
          return `<div class="notice">法官警下台词：昨夜${bound ? `${bound}号玩家被禁锢` : "无人被禁锢"}；迷雾${fog ? "开启" : "未开启"}。</div>`;
        })()] : []),
        `<div class="notice">法官台词参考：昨夜出局的玩家是……请依次发言。发言结束，请投票；投票结束，公布放逐结果。等待出局玩家发动技能。相关技能与出局结算结束后，天黑请闭眼。</div>`,
        ...judgeDayActions
      ], "judge-phase-panel day-phase-panel") : ""}
      ${!isJudgeDaySections ? renderActionPanel("当前操作", mainActions) : ""}
      ${renderActionPanel("查看信息", infoActions)}
      ${renderActionPanel("系统操作", dangerActions, "danger-zone")}
      <div class="notice">${IS_REMOTE ? "联机版会使用当前网址的后端同步房间。localhost 是本机服务，Cloudflare Pages 是线上服务。" : "静态版数据只保存在当前浏览器。真正跨手机加入房间需要后端同步。"}</div>
    `;
    if (room.mode === "SYSTEM" && isController && !room.daySkillVoice && room.latestPublicAnnouncement && room.latestPublicAnnouncement.id !== state.heardAnnouncementIds[room.id]) {
      state.heardAnnouncementIds[room.id] = room.latestPublicAnnouncement.id;
      saveState();
      setTimeout(() => speakSystemAnnouncement(room.latestPublicAnnouncement.text), 100);
    }
  }

  function renderIdentity() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const mySeat = getMySeat(room);
    const assignment = mySeat ? room.assignments.find((item) => item.seat === mySeat.seat) : null;
    if (!assignment) {
      app.innerHTML = `
        ${pageHeader("还没有身份", "请先选择座位，并等待发牌")}
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }

    if (IS_REMOTE) {
      if (!assignment.revealed) {
        remotePost("reveal").catch((error) => window.alert(error.message));
      }
    } else {
      assignment.revealed = true;
      writeLog(room, "IDENTITY_VIEWED", { seat: assignment.seat });
      saveState();
    }

    const role = getRole(assignment.roleId);
    const treasureCards = (assignment.abilityState.treasureCards || []).map((roleId) => getRole(roleId));
    app.innerHTML = `
      <section class="panel role-card">
        ${role.image ? `<img class="role-image" src="${role.image}" alt="${role.name}" />` : `<div class="role-mark">${ROLE_MARKS[role.id] || "牌"}</div>`}
        <div class="role-name">${role.name}</div>
        <div class="role-camp">${assignment.seat}号 · ${CAMP_NAMES[assignment.camp]}</div>
      </section>
      <section class="panel">
        <div class="label">技能</div>
        <div class="body-text">${role.summary}</div>
      </section>
      ${treasureCards.length ? `
        <section class="panel">
          <div class="label">盗宝牌</div>
          <div class="list">${treasureCards.map((card) => `<span class="tag">${card.name}</span>`).join(" ")}</div>
        </section>
      ` : ""}
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderNight() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    const systemNight = room.mode === "SYSTEM" ? room.systemNight : null;
    if (systemNight?.canControl) {
      const announcementReady = systemNight.announcementReady !== false;
      const announcementText = systemNight.complete
        ? "所有夜间身份均已行动，请等待天亮。"
        : ["mechanical_guard", "mechanical_poison", "mechanical_check", "mechanical_kill"].includes(systemNight.stepId)
          ? "机械狼请睁眼，请按照手机提示进行操作。"
          : getJudgeScript({ id: systemNight.stepId, label: systemNight.announcement }, room);
      const announcementKey = `${room.id}-${room.night}-${systemNight.stepIndex}-${systemNight.complete}`;
      app.innerHTML = `
        ${pageHeader(`第 ${room.night || 1} 夜`, systemNight.complete ? "夜间行动已完成" : announcementReady ? "公共语音播报中" : "等待下一位玩家")}
        <section class="panel">
          <div class="label">公共设备</div>
          <div class="value">${systemNight.complete ? "等待进入天亮" : announcementReady ? "请保持全员闭眼" : "上一位玩家操作完成，10 秒后播报下一流程"}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${systemNight.stepCount ? Math.round((systemNight.stepIndex / systemNight.stepCount) * 100) : 100}%"></div></div>
          <div class="notice">进度 ${Math.min(systemNight.stepIndex + (systemNight.complete ? 0 : 1), systemNight.stepCount)} / ${systemNight.stepCount}</div>
          ${systemNight.timing ? `<div class="notice">固定流程：${systemNight.timing.phase} · ${Math.max(0, Math.ceil(((systemNight.timing.deadlineAt || systemNight.timing.readyAt) - Date.now()) / 1000))} 秒</div>${fixedVoiceError ? `<div class="notice">${escapeHtml(fixedVoiceError)}</div>` : ""}<button class="button" data-action="fixed-voice-retry">启用语音 / 播放失败后重试</button>${systemNight.stepId === "wolves_kill" && systemNight.timing.phase === "ACTION" ? '<button class="button" data-action="fixed-night-extend">加时 20 秒（最多两次）</button>' : ""}` : ""}
        </section>
        ${systemNight.complete ? '<button class="button primary" data-action="night-finish">结算并天亮</button>' : !systemNight.timing && announcementReady ? '<button class="button" data-action="system-speak" data-text="' + escapeHtml(announcementText) + '">重播当前台词</button>' : ""}
        ${systemNight.stepIndex > 0 ? '<button class="button" data-action="night-undo">撤回上一步</button>' : ""}
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      if (!systemNight.timing && announcementReady && announcementKey !== lastSystemAnnouncementKey) {
        lastSystemAnnouncementKey = announcementKey;
        setTimeout(() => speakSystemAnnouncement(announcementText, 3), 100);
      }
      return;
    }
    if (!isJudge && !systemNight?.canAct) {
      app.innerHTML = `
        ${pageHeader("夜间流程", "等待轮到你的身份")}
        <section class="panel"><div class="body-text">请闭眼等待。轮到你的身份时，本页会自动出现私密操作。</div></section>
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }

    const steps = room.currentNightSteps || [];
    const index = room.currentNightStepIndex || 0;
    const step = steps[index];
    const currentNightActions = (room.nightActions || []).filter((action) => action.night === room.night);
    const missingCompletedSteps = isJudge
      ? currentNightActions.filter((action) => !steps.some((item) => item.id === action.stepId))
      : [];
    const visibleSteps = steps.map((item, itemIndex) => ({ ...item, itemIndex }));
    if (room.mode === "JUDGE" && isDarkDestruction(room) && !steps.some((item) => item.id === "archangel_bless") && !missingCompletedSteps.some((item) => item.stepId === "archangel_bless")) {
      const angel = (room.assignments || []).find((item) => item.roleId === "archangel");
      const reason = !angel || angel.alive === false ? "已出局" : isDarkRoleBound(room, "archangel") ? "本夜被禁锢" : hasUsedArchangelBless(room) ? "祝福已使用" : "无法行动";
      const beforeCain = visibleSteps.findIndex((item) => item.id === "cain_check");
      visibleSteps.splice(beforeCain < 0 ? visibleSteps.length : beforeCain, 0, { id: "archangel_bless", label: "天使长选择是否祝福", unavailableReason: reason });
    }
    const displayedStepCount = visibleSteps.length + missingCompletedSteps.length;
    const visibleIndex = visibleSteps.findIndex((item) => item.itemIndex === index);
    const progress = displayedStepCount ? Math.round(((Math.max(0, visibleIndex) + missingCompletedSteps.length) / displayedStepCount) * 100) : 0;
    const treasure = room.assignments.find((item) => item.roleId === "treasure_master");
    const treasureCards = treasure && treasure.abilityState && treasure.abilityState.treasureCards
      ? treasure.abilityState.treasureCards.map((roleId) => getRole(roleId))
      : [];
    const activeTreasureRoleId = currentTreasureCard(room);
    const activeTreasureRole = activeTreasureRoleId ? getRole(activeTreasureRoleId) : null;
    const treasurePoisonUsed = systemNight?.privateContext?.treasurePoisonUsed ?? (room.nightActions || []).some((action) => action.stepId === "treasure_skill" && action.cardRoleId === "poisoner" && !action.skipped);
    const treasureWolfEligible = systemNight?.privateContext?.treasureWolfEligible ?? !(room.assignments || []).some((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId));
    const treasureSkillCanTarget = !activeTreasureRoleId || ["spirit_medium", "dreamer"].includes(activeTreasureRoleId) || (activeTreasureRoleId === "poisoner" && !treasurePoisonUsed);
    const treasureSkillRequired = ["spirit_medium", "dreamer"].includes(activeTreasureRoleId);
    const suggestedDeaths = isJudge ? calculateSuggestedDeaths(room, room.night) : [];
    const witchAntidoteTarget = step && ["witch_action", "witch_antidote"].includes(step.id) ? getWitchAntidoteTarget(room) : 0;
    const witchCanChooseAntidote = step && step.id === "witch_action" && canChooseWitchAntidote(room, step);
    const canEnableLiaFog = room.mode === "SYSTEM" && !isJudge ? true : hasSuccessfulLiaCharge(room) && !hasUsedLiaFog(room) && !isDarkRoleBound(room, "lia") && (room.assignments || []).some((item) => item.roleId === "lia" && item.alive !== false);
    const nightSubmitLabel = step && step.id === "witch_antidote" ? "救" : step && step.id === "witch_poison" ? "使用毒药" : "确认记录";
    const nightSkipLabel = step && step.id === "witch_antidote" ? "不救" : step && step.id === "witch_poison" ? "不使用毒药" : "空过";

    if (!step) {
      app.innerHTML = `
        ${pageHeader(`第 ${room.night || 1} 夜`, "夜间行动已记录完成")}
        <section class="panel">
          <div class="value">可以进入天亮阶段</div>
          <div class="notice">${suggestedDeaths.length ? `建议天亮死亡：${suggestedDeaths.map((item) => `${item.seat}号（${item.reasons.join("、")}）`).join("、")}` : "建议天亮死亡：无"}</div>
          ${isJudge && room.mode === "JUDGE" && isDarkDestruction(room) ? `<div class="notice">法官夜间信息：${darkBindingTarget(room, room.night) ? `${darkBindingTarget(room, room.night)}号被禁锢` : "无人被禁锢"}；迷雾${(room.nightActions || []).some((item) => item.night === room.night && item.stepId === "lia_fog" && !item.skipped) ? "开启" : "未开启"}。这些信息请在警下公布。</div>` : ""}
          <div class="notice">建议结果不会自动公布，请法官天亮后确认。</div>
        </section>
        <button class="button primary" data-action="night-finish">天亮</button>
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }

    app.innerHTML = `
      ${pageHeader(`第 ${room.night || 1} 夜`, `${visibleIndex + missingCompletedSteps.length + 1} / ${displayedStepCount} · ${step.label}`)}
      <section class="panel">
        <div class="label">进度</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="night-step-list">
          ${missingCompletedSteps.map((item, itemIndex) => `<div class="night-step done"><span>${itemIndex + 1}. ${escapeHtml(item.label || "夜间行动")}</span><span>已记录</span></div>`).join("")}
          ${visibleSteps.map((item, visiblePosition) => `<div class="night-step ${item.itemIndex === index ? "active" : item.itemIndex < index ? "done" : ""}"><span>${visiblePosition + missingCompletedSteps.length + 1}. ${item.label}</span><span>${item.unavailableReason ? `不能行动：${item.unavailableReason}` : item.itemIndex < index ? "已记录" : item.itemIndex === index ? "当前" : ""}</span></div>`).join("")}
        </div>
      </section>

      <section class="panel script-panel">
        <div class="label">法官台词</div>
        <div class="body-text">${getJudgeScript(step, room)}</div>
        ${step.id === "mechanical_knife_confirm" && systemNight?.canAct ? `<div class="notice">你的普通带刀状态：${systemNight.privateContext?.mechanicalKnifeState === "YES" ? "可以带刀" : "暂不能带刀"}。</div>` : ""}
        ${isJudge && isDarkDestruction(room) && darkBindingTarget(room, room.night) ? (() => {
          const boundSeat = darkBindingTarget(room, room.night);
          const boundRoleId = (room.assignments || []).find((item) => item.seat === boundSeat)?.roleId;
          const boundRole = getRole(boundRoleId)?.name || "未知身份";
          const effect = boundRoleId === "witch" ? "女巫今晚不知刀口，不能使用解药或毒药。" : boundRoleId === "archangel" ? "天使长永久失去复活能力；本夜及次日不能发动技能。" : ["wolf", "wolf_king", "lia"].includes(boundRoleId) ? "狼刀仍正常进行；个人技能当夜及次日不能发动。" : "当夜及次日白天不能发动技能。";
          return `<div class="notice">法官私密提示：${boundSeat}号（${escapeHtml(boundRole)}）被禁锢。${effect}该玩家当夜免疫夜间伤害，次日不可被放逐；请按桌面流程私下告知。</div>`;
        })() : ""}
      </section>

      ${step.inactive ? '<section class="panel"><div class="notice">莉莉丝已出局，本夜不能禁锢；请照常宣读台词后继续。</div></section>' : step.id === "lia_fog" ? `<section class="panel"><div class="label">是否开启迷雾</div>${canEnableLiaFog ? "" : '<div class="notice">当前不能开启迷雾，请记录不开启。</div>'}</section>` : step.id === "witch_action" ? `
        ${witchCanChooseAntidote ? `
          <section class="panel">
            <div class="label">解药</div>
            <div class="value">今晚被击杀：${witchAntidoteTarget ? `${witchAntidoteTarget}号` : "无人"}</div>
            <div class="segmented witch-choice-row">
              <button class="segment" data-action="witch-antidote-choice" data-use="true">救</button>
              <button class="segment" data-action="witch-antidote-choice" data-use="false">不救</button>
            </div>
          </section>
        ` : ""}
        ${step.poisonAvailable ? `
          <section class="panel">
            <div class="label">毒药号码</div>
            <section class="seat-grid">
              ${room.seats.map((seat) => `<button class="seat" data-action="witch-poison-seat" data-seat="${seat.seat}" ${Array.isArray(room.aliveSeats) ? room.aliveSeats.includes(seat.seat) ? "" : "disabled" : room.assignments.some((item) => item.seat === seat.seat && item.alive !== false) ? "" : "disabled"}>${seat.seat}号</button>`).join("")}
            </section>
          </section>
        ` : ""}
      ` : step.id === "witch_antidote" ? `
        <section class="panel">
          <div class="label">今晚死亡信息</div>
          <div class="value">${witchAntidoteTarget ? `${witchAntidoteTarget}号` : "无人"}</div>
          <div class="notice">解药只记录"救"或"不救"。使用后，后续夜晚将跳过解药环节。</div>
        </section>
      ` : step.id === "siren_wind" ? `
        <section class="panel">
          <div class="label">选择风向</div>
          <div class="notice">海妖选择今晚的风向${step.lastWindDirection ? `，不可与昨晚相同（昨晚：${step.lastWindDirection === "tailwind" ? "顺风" : step.lastWindDirection === "headwind" ? "逆风" : "无风"}）` : ""}</div>
          <div class="action-row" style="flex-wrap:wrap;gap:8px;">
            <button class="button" data-action="night-wind" data-wind="calm" ${step.lastWindDirection === "calm" ? "disabled" : ""} style="flex:1;min-width:80px;">无风</button>
            <button class="button" data-action="night-wind" data-wind="tailwind" ${step.lastWindDirection === "tailwind" ? "disabled" : ""} style="flex:1;min-width:80px;">顺风</button>
            <button class="button" data-action="night-wind" data-wind="headwind" ${step.lastWindDirection === "headwind" ? "disabled" : ""} style="flex:1;min-width:80px;">逆风</button>
          </div>
        </section>
      ` : step.needsCard ? `
        <section class="panel">
          <div class="label">选择盗宝牌</div>
          ${room && room.boardId === "treasure_master" ? `<div class="notice">普通带刀状态：${treasureWolfEligible ? "可在狼人夜使用普通狼刀" : "尚未获得"}；狼人牌不产生额外技能刀。</div>` : ""}
          <div class="card-options">
            ${treasureCards.map((card) => `<button class="card-option" data-action="night-card" data-role="${card.id}">${card.name}</button>`).join("")}
          </div>
        </section>
      ` : step.targetCount === 0 ? "" : `
        <section class="panel">
          <div class="label">${step.targetCount === 1 ? "选择目标" : `选择 ${step.targetCount} 个目标`}</div>
          <section class="seat-grid">
            ${room.seats.map((seat) => {
              const alive = Array.isArray(room.aliveSeats) ? room.aliveSeats.includes(seat.seat) : (room.assignments || []).some((assignment) => assignment.seat === seat.seat && assignment.alive !== false);
              const allowed = alive && (!Array.isArray(step.allowedSeats) || step.allowedSeats.includes(seat.seat)) && (step.id !== "treasure_skill" || treasureSkillCanTarget);
              return `<button class="seat ${allowed ? "" : "unavailable"}" data-action="night-seat" data-seat="${seat.seat}" ${allowed ? "" : "disabled"}>${seat.seat}号</button>`;
            }).join("")}
          </section>
          ${step.id === "dancer_dance" ? `<div class="notice">每名玩家只能进入一次舞池；当前可选：${formatSeatList(step.allowedSeats || [])}</div>` : ""}
          ${["trickster_swap", "magician_swap"].includes(step.id) ? `<div class="notice">每个号码整局只能被该角色交换一次；当前可选：${formatSeatList(step.allowedSeats || [])}</div>` : ""}
          ${step.id === "treasure_skill" ? `<div class="notice">当前盗宝牌：${activeTreasureRole ? activeTreasureRole.name : "未选择"}${treasureSkillCanTarget ? "" : "，本夜没有可发动的主动技能，请选择不发动"}</div>` : ""}
        </section>
        ${isJudge ? getNightResultHtml(room, step, []) : ""}
      `}

      <section class="panel">
        <div class="label">已记录</div>
        <div class="list">
          ${currentNightActions.length ? currentNightActions.map((action) => `<div class="list-item"><div><div class="night-record-main">${escapeHtml(formatNightAction(action).replace(`${action.label || "夜间行动"}：`, ""))}</div><div class="night-record-sub">${escapeHtml(action.label || "夜间行动")}</div></div></div>`).join("") : '<div class="empty">暂无记录</div>'}
        </div>
        ${room.boardId === "dawn_voyage" ? `<div class="notice">当夜风向：${room.windDirection === "tailwind" ? "顺风" : room.windDirection === "headwind" ? "逆风" : "无风"}${room.boardedSeat ? ` · 登船：${room.boardedSeat}号` : ""}</div>` : ""}
        <div class="notice">${suggestedDeaths.length ? `当前建议死亡：${suggestedDeaths.map((item) => `${item.seat}号（${item.reasons.join("、")}）`).join("、")}` : "当前建议死亡：无"}</div>
      </section>

      <section class="panel action-panel">
        <div class="label">本步操作</div>
        <div class="action-row">
          ${step.inactive ? '<button class="button primary" data-action="night-skip">已宣读，继续</button>' : step.id === "lia_fog" ? `<button class="button primary" data-action="night-submit" ${canEnableLiaFog ? "" : "disabled"}>开启迷雾</button><button class="button" data-action="night-skip">不开启迷雾</button>` : step.id === "witch_action" ? `
            ${step.poisonAvailable ? `
              <button class="button primary" data-action="night-witch-submit" data-use-poison="true">使用毒药</button>
              <button class="button" data-action="night-witch-submit" data-use-poison="false">不使用毒药</button>
            ` : '<button class="button primary" data-action="night-witch-submit" data-use-poison="false">确认女巫操作</button>'}
          ` : step.id === "siren_wind" ? "" : `
            <button class="button primary" data-action="night-submit">${nightSubmitLabel}</button>
            ${step.allowSkip && !(step.id === "treasure_skill" && treasureSkillRequired) ? `<button class="button" data-action="night-skip">${nightSkipLabel}</button>` : ""}
          `}
          ${currentNightActions.length ? '<button class="button" data-action="night-undo">撤回上一步</button>' : ""}
          <button class="button" data-action="view" data-view="room">返回房间</button>
        </div>
      </section>
      <div class="notice">这一步只记录法官操作，暂不自动公布结果。</div>
    `;
  }

  function renderSheriff() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const canManage = !IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canManage) {
      app.innerHTML = `
        ${pageHeader("上警", "等待法官记录")}
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }
    const candidates = room.sheriffCandidates || [];
    app.innerHTML = `
      ${pageHeader("记录上警", "点击上警玩家号码，再确认公开")}
      <section class="panel">
        <div class="label">已选择</div>
        <div class="body-text">${candidates.length ? candidates.map((seat) => `${seat}号`).join("、") : "暂未选择"}</div>
      </section>
      <section class="seat-grid">
        ${room.seats.map((seat) => `<button class="seat ${candidates.includes(seat.seat) ? "selected" : ""}" data-action="sheriff-seat" data-seat="${seat.seat}">${seat.seat}号</button>`).join("")}
      </section>
      <button class="button primary" data-action="sheriff-submit">确认上警名单</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderWithdraw() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const canManage = !IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canManage) return setView("room");
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    app.innerHTML = `
      ${pageHeader("记录退水", "只可从已上警玩家中选择退水号码")}
      <section class="panel">
        <div class="label">已退水</div>
        <div class="body-text">${withdrawn.length ? withdrawn.map((seat) => `${seat}号`).join("、") : "暂无"}</div>
        <div class="notice">退水玩家不可参与第一轮警徽投票。</div>
      </section>
      <section class="seat-grid">
        ${candidates.map((seat) => `<button class="seat ${withdrawn.includes(seat) ? "selected" : ""}" data-action="withdraw-seat" data-seat="${seat}">${seat}号</button>`).join("")}
      </section>
      <button class="button primary" data-action="withdraw-submit">确认退水名单</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderSheriffVote() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const canManage = !IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canManage) return setView("room");
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
    const previous = room.sheriffVoteRecord;
    const secondRound = previous && previous.pkSeats && previous.pkSeats.length > 1 && !previous.electedSeat;
    const targets = secondRound ? previous.pkSeats : activeCandidates;
    const voters = getAliveSeats(room)
      .filter((seat) => secondRound ? !targets.includes(seat) : !candidates.includes(seat));

    app.innerHTML = `
      ${pageHeader(secondRound ? "警徽 PK 投票" : "警徽投票", secondRound ? `PK 玩家：${formatSeatList(targets)}。当前不在警上的玩家投票，退水玩家可投。` : "只有一开始就在警下的玩家投第一轮票。")}
      <section class="panel">
        <div class="label">候选目标</div>
        <div class="body-text">${formatSeatList(targets)}</div>
        <div class="notice">投票人：${formatSeatList(voters)}</div>
      </section>
      <section class="panel">
        <div class="label">逐个记录投票</div>
        <div class="list">
          ${voters.map((seat) => `
            <label class="list-item">
              <span class="value">${seat}号</span>
              <select class="select vote-select" data-voter="${seat}">
                <option value="0">弃票/未投</option>
                ${targets.map((targetSeat) => `<option value="${targetSeat}">${targetSeat}号</option>`).join("")}
              </select>
            </label>
          `).join("")}
        </div>
      </section>
      <button class="button primary" data-action="sheriff-vote-submit" data-round="${secondRound ? 2 : 1}">确认警徽投票</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderDeathRecord() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) return setView("room");
    const draftSeats = state.deathDraftSeats || [];
    const draftReasons = state.deathDraftReasons || {};
    const reasonsHtml = draftSeats.length ? `
      <section class="panel">
        <div class="label">系统建议死亡</div>
        <div class="notice">以下为系统根据夜间行动自动计算的建议。可点击座位取消选择。</div>
        <div class="list">
          ${draftSeats.map((seat) => `
            <div class="list-item" style="justify-content:space-between;">
              <div><span class="value">${seat}号</span> <span class="body-text">${(draftReasons[seat] || ["未知"]).join("、")}</span></div>
            </div>
          `).join("")}
        </div>
      </section>
    ` : "";
    app.innerHTML = `
      ${pageHeader("记录天亮死亡", "选择昨夜死亡玩家，确认后所有人可见")}
      ${reasonsHtml}
      <section class="seat-grid">
        ${room.seats.map((seat) => `<button class="seat ${draftSeats.includes(seat.seat) ? "selected" : ""}" data-action="death-seat" data-seat="${seat.seat}">${seat.seat}号</button>`).join("")}
      </section>
      <button class="button primary" data-action="death-submit">确认死亡名单</button>
      <button class="button" data-action="death-none">无人死亡</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderExileRecord() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    const canControl = isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canControl) return setView("room");
    if (!(room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")
      || (room.exileRecords || []).some((record) => record.day === room.night)) return setView("room");
    app.innerHTML = `
      ${pageHeader("记录白天出局", room.boardId === "realm_of_trickery" ? "请选择投票最高的号码，系统将在回溯窗口后按诡术换号结算。" : "线下投票完成后，只记录最终出局结果")}
      ${isJudge && room.mode === "JUDGE" && room.boardId === "realm_of_trickery" ? `<section class="panel"><div class="notice">法官私密提示：昨夜诡术师交换 ${formatSeatList(getActiveSwapPair(room, "trickster_swap", room.night))}。请选择原始得票最高号码，而非换号后的出局号码。</div></section>` : ""}
      <section class="seat-grid">
        ${room.seats.map((seat) => {
          const alive = Array.isArray(room.aliveSeats) ? room.aliveSeats.includes(seat.seat) : (room.assignments || []).some((item) => item.seat === seat.seat && item.alive !== false);
          const bound = isDarkDestruction(room) && darkBindingTarget(room, room.night) === seat.seat;
          return `<button class="seat" data-action="exile-seat" data-seat="${seat.seat}" ${!alive || bound ? "disabled" : ""}>${seat.seat}号${bound ? "（禁锢）" : ""}</button>`;
        }).join("")}
      </section>
      <button class="button primary" data-action="exile-submit">确认放逐</button>
      <button class="button" data-action="exile-none">无人出局</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderDayVote() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const canRecordVotes = !IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canRecordVotes) return setView("room");
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK");
    if (!daybreakRecorded) return setView("room");
    const previous = room.dayVoteRecord;
    const princeRevote = Boolean(room.orderPrinceRevotePending);
    const secondRound = !princeRevote && previous && previous.day === room.night && previous.pkSeats && previous.pkSeats.length > 1 && !previous.exiledSeat && !previous.noExile;
    const aliveSeats = getAliveSeats(room);
    const targets = secondRound ? previous.pkSeats : aliveSeats;
    const voters = secondRound ? aliveSeats.filter((seat) => !targets.includes(seat)) : aliveSeats;

    app.innerHTML = `
      ${pageHeader(princeRevote ? "回溯重新投票" : secondRound ? "放逐 PK 投票" : "放逐投票", princeRevote ? "定序王子已发动，所有存活玩家重新自由投票。" : secondRound ? `PK 玩家：${formatSeatList(targets)}。除 PK 玩家外投第二轮。` : "记录白天投票，平票进入 PK，二轮再平票无人出局。")}
      <section class="panel">
        <div class="label">可投目标</div>
        <div class="body-text">${formatSeatList(targets)}</div>
        ${isDarkDestruction(room) && Number(room.darkFogDay || room.liaFogDay || 0) === Number(room.night) ? '<div class="notice">公投前再次宣布迷雾开启；法官在线下私下告知莉娅完整票型。</div>' : ""}
      </section>
      <section class="panel">
        <div class="label">逐个记录投票</div>
        <div class="list">
          ${voters.map((seat) => `
            <label class="list-item">
              <span class="value">${seat}号</span>
              <select class="select day-vote-select" data-voter="${seat}">
                <option value="0">弃票/未投</option>
                ${targets.map((targetSeat) => `<option value="${targetSeat}">${targetSeat}号</option>`).join("")}
              </select>
            </label>
          `).join("")}
        </div>
      </section>
      <button class="button primary" data-action="day-vote-submit" data-round="${secondRound ? 2 : 1}" data-prince-revote="${princeRevote}">确认放逐投票</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderDarkBallot() {
    const room = getCurrentRoom();
    if (!room || room.mode !== "SYSTEM") return setView("room");
    const ballot = room.activeDarkBallot;
    const mySeat = getMySeat(room);
    const mySeatNumber = IS_REMOTE ? Number(room.mySeat?.seat || 0) : Number(mySeat?.seat || 0);
    const canVote = Boolean(ballot?.status === "OPEN" && mySeatNumber && ballot.voterSeats?.includes(mySeatNumber) && (room.aliveSeats || []).includes(mySeatNumber));
    const submitted = Boolean(room.myDarkBallot || (mySeatNumber && ballot?.votes && Object.prototype.hasOwnProperty.call(ballot.votes, String(mySeatNumber))));
    const activeVotes = ballot?.votes ? Object.entries(ballot.votes).map(([voter, choice]) => ({ voterSeat: Number(voter), targetSeat: Number(choice), weight: 1 })) : null;
    const completedVotes = room.dayVoteRecord?.votes || null;
    const renderVoteRows = (votes) => votes ? votes.map((vote) => {
      const targetSeat = Number(vote.targetSeat || 0);
      const detail = vote.counted === false && targetSeat ? "（不计入票数）" : vote.weight > 1 ? `（${vote.weight}票）` : "";
      return `<div class="list-item"><span class="value">${vote.voterSeat}号</span><span class="body-text">${targetSeat ? `${targetSeat}号${detail}` : "弃票"}</span></div>`;
    }).join("") : "";
    const activeVoteRows = renderVoteRows(activeVotes);
    const completedVoteRows = renderVoteRows(completedVotes);
    const counts = room.dayVoteRecord?.counts || {};
    const topSummary = room.dayVoteRecord?.topSeats?.length
      ? room.dayVoteRecord.topSeats.map((seat) => `${seat}号 ${Number(counts[seat] || 0)}票`).join("、")
      : room.dayVoteRecord?.noExile ? "本轮无人得票" : "等待投票结果";
    app.innerHTML = `
      ${pageHeader(isDarkDestruction(room) ? "暗黑私密投票" : "白天手机投票", ballot?.status === "OPEN" ? `第 ${ballot.day} 天 · ${ballot.round === 2 ? "PK 第二轮" : "第一轮"}` : "本日投票记录")}
      ${ballot?.status === "OPEN" ? `
        <section class="panel">
          <div class="label">投票进度</div>
          <div class="value">${Number(ballot.submittedCount ?? Object.keys(ballot.votes || {}).length)} / ${Number(ballot.totalVoters || ballot.voterSeats?.length || 0)} 人已提交</div>
          <div class="body-text">每人仅接受首次成功提交；选择“弃票”也算已提交。投票结束前，玩家不能查看彼此选择。</div>
        </section>
        ${canVote && !submitted ? `
          <section class="panel">
            <label class="field"><span class="label">我的投票</span>
              <select class="select" id="darkBallotTarget"><option value="">请选择</option><option value="0">弃票</option>${(ballot.allowedTargets || []).map((seat) => `<option value="${seat}">${seat}号</option>`).join("")}</select>
            </label>
            <button class="button primary" data-action="dark-ballot-submit">私密提交</button>
          </section>
        ` : canVote && submitted ? '<section class="panel"><div class="notice">你的投票已提交，不能修改。</div></section>' : !IS_REMOTE && !mySeatNumber ? '<section class="panel"><div class="notice">本地单设备模式请先切换到对应玩家座位。</div></section>' : ""}
        ${activeVotes ? `<section class="panel"><div class="label">当前票型</div><div class="list">${activeVoteRows}</div></section>` : ""}
      ` : ""}
      ${room.dayVoteRecord ? `<section class="panel"><div class="label">本轮结果</div><div class="value">${topSummary}</div>${room.dayVoteRecord.pkSeats?.length ? `<div class="notice">${formatSeatList(room.dayVoteRecord.pkSeats)}平票，等待第二轮 PK。</div>` : room.dayVoteRecord.exiledSeat ? `<div class="notice">${room.dayVoteRecord.exiledSeat}号出局。</div>` : room.dayVoteRecord.noExile ? '<div class="notice">本轮无人出局。</div>' : ""}${completedVotes ? `<div class="list">${completedVoteRows}</div>` : ""}</section>` : ""}
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderOrderPrince() {
    const room = getCurrentRoom();
    if (!room || !room.pendingExileResult || !room.activeDaySkillWindow) return setView("room");
    const pending = room.pendingExileResult;
    const record = pending.record || pending;
    const rawSeat = Number(record.exiledSeat || 0);
    const voteCount = rawSeat && record.counts ? Number(record.counts[rawSeat] || 0) : 0;
    const tied = !rawSeat && record.topSeats && record.topSeats.length > 1;
    const resultText = tied
      ? `${formatSeatList(record.topSeats)}平票，等待玩家发动技能`
      : rawSeat
        ? `${rawSeat}号玩家${voteCount ? `${voteCount}票` : "得票最高"}，等待定序王子发动技能`
        : "本轮无人得票，等待玩家发动技能";
    const isController = Boolean(room.isController);
    const isPrince = (room.assignments || []).some((assignment) => assignment.roleId === "order_prince" && assignment.alive !== false);
    const canActivate = !room.orderPrinceUsed && isPrince && (!IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && !isController));
    const canDecline = !IS_REMOTE || room.isJudge || (room.mode === "SYSTEM" && isController);
    app.innerHTML = `
      ${pageHeader("等待发动技能", "实际死讯尚未宣布")}
      <section class="panel script-panel">
        <div class="label">法官台词</div>
        <div class="value">${resultText}</div>
      </section>
      <section class="panel">
        <div class="body-text">法官台词：等待定序王子发动技能。若无人发动，单一出局结果再按诡术师换号结算；平票则进入正常 PK。</div>
        ${rawSeat && (!IS_REMOTE || room.isJudge) ? `<div class="notice">法官私密提示：昨夜交换 ${formatSeatList(getActiveSwapPair(room, "trickster_swap", room.night))}；若不回溯，实际 ${mapExileSeat(room, rawSeat)}号出局。</div>` : ""}
      </section>
      ${canActivate ? '<button class="button primary" data-action="order-prince-activate">定序王子发动回溯</button>' : ""}
      ${canDecline ? '<button class="button" data-action="order-prince-decline">无人发动，继续结算</button>' : '<div class="notice">请由公共控制设备确认无人发动，或由定序王子本人发动回溯。</div>'}
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderBadge() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) return setView("room");
    const holder = room.sheriffBadge && room.sheriffBadge.holderSeat ? room.sheriffBadge.holderSeat : 0;
    app.innerHTML = `
      ${pageHeader("处理警徽", holder ? `当前警长：${holder}号` : "当前没有警长")}
      <section class="panel">
        <div class="label">移交警徽</div>
        <section class="seat-grid">
          ${room.seats.map((seat) => `<button class="seat" data-action="badge-seat" data-seat="${seat.seat}">${seat.seat}号</button>`).join("")}
        </section>
      </section>
      <button class="button primary" data-action="badge-transfer">确认移交</button>
      <button class="button danger" data-action="badge-destroy">撕毁警徽</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderJudge() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const board = getBoard(room.boardId);
    const currentStep = room.currentNightSteps && room.currentNightSteps[room.currentNightStepIndex || 0];
    const currentNightActions = (room.nightActions || []).filter((action) => action.night === room.night);
    const sheriffBadge = room.sheriffBadge || { holderSeat: 0, lost: false };
    const nextStep = getJudgeNextStep(room);
    app.innerHTML = `
      ${pageHeader("法官总览", `${board.name} · 房间 ${room.id}`)}
      <section class="panel next-step-panel">
        <div class="label">下一步建议</div>
        <div class="value">${nextStep.title}</div>
        <div class="body-text">${nextStep.detail}</div>
        ${nextStep.action ? `<div class="tag next-step-tag">${nextStep.action}</div>` : ""}
      </section>
      <section class="panel">
        <div class="label">当前状态</div>
        <div class="list">
          <div class="list-item"><div><div class="value">阶段</div><div class="label">${getPhaseName(room.phase)}${room.night ? ` · 第 ${room.night} 夜/天` : ""}</div></div></div>
          <div class="list-item"><div><div class="value">警长</div><div class="label">${sheriffBadge.holderSeat ? `${sheriffBadge.holderSeat}号` : sheriffBadge.lost ? "警徽流失" : "暂无"}</div></div></div>
          <div class="list-item"><div><div class="value">夜间进度</div><div class="label">${room.phase === "NIGHT" ? currentStep ? `${(room.currentNightStepIndex || 0) + 1}/${(room.currentNightSteps || []).length} · ${currentStep.label}` : "夜间行动已完成" : "不在夜间"}</div></div></div>
          <div class="list-item"><div><div class="value">本夜已记录</div><div class="label">${currentNightActions.length ? currentNightActions.map((action) => action.label).join("、") : "暂无"}</div></div></div>
        </div>
      </section>
      <section class="panel">
        <div class="list">
          ${room.assignments.map((assignment) => {
            const role = getRole(assignment.roleId);
            const treasureCards = (assignment.abilityState.treasureCards || []).map((roleId) => getRole(roleId));
            return `
              <div class="list-item">
                <div class="avatar-row">
                  ${role.image ? `<img class="mini-avatar" src="${role.image}" alt="${role.name}" />` : ""}
                  <div>
                    <div class="value">${assignment.seat}号 · ${role.name}</div>
                    <div class="label">${CAMP_NAMES[assignment.camp]} · ${assignment.alive ? "存活" : "出局"}</div>
                    ${treasureCards.length ? `<div class="treasure-line">${treasureCards.map((card) => `<span class="tag">${card.name}</span>`).join("")}</div>` : ""}
                  </div>
                </div>
                <span class="tag">${assignment.revealed ? "已看牌" : "未看牌"}</span>
              </div>
            `;
          }).join("")}
        </div>
      </section>
      <button class="button" data-action="view" data-view="review">复盘</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderGameEnd() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    const canControl = isJudge || (room.mode === "SYSTEM" && room.isController);
    if (!canControl) {
      app.innerHTML = `
        ${pageHeader("游戏结束", "等待法官确认结果")}
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }
    app.innerHTML = `
      ${pageHeader("游戏结束", "请确认本局获胜方")}
      <section class="panel">
        <div class="label">选择获胜阵营</div>
        <div class="notice">此记录将永久保存，用于统计和复盘。</div>
      </section>
      <div class="action-row" style="grid-template-columns:1fr 1fr 1fr;">
        <button class="button primary" data-action="game-result" data-result="GOOD_WIN" style="background:#4a90d9;">好人获胜</button>
        <button class="button primary" data-action="game-result" data-result="WOLF_WIN" style="background:#d94a4a;">狼人获胜</button>
        <button class="button" data-action="game-result-skip">跳过</button>
      </div>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderReview() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const board = getBoard(room.boardId);
    const timeline = buildReviewTimeline(room);
    app.innerHTML = `
      ${pageHeader("复盘", board.name)}
      <section class="panel">
        <div class="label">身份表</div>
        <div class="list">
          ${room.assignments.map((assignment) => {
            const role = getRole(assignment.roleId);
            const treasureCards = (assignment.abilityState.treasureCards || []).map((roleId) => getRole(roleId));
            return `
              <div class="list-item">
                <div class="avatar-row">
                  ${role.image ? `<img class="mini-avatar" src="${role.image}" alt="${role.name}" />` : ""}
                  <div>
                    <div class="value">${assignment.seat}号 · ${role.name}</div>
                    ${treasureCards.length ? `<div class="treasure-line">${treasureCards.map((card) => `<span class="tag">${card.name}</span>`).join("")}</div>` : ""}
                  </div>
                </div>
                <span class="tag">${CAMP_NAMES[assignment.camp]}</span>
              </div>
            `;
          }).join("")}
        </div>
      </section>
      <section class="panel">
        <div class="label">流程摘要</div>
        <div class="list">
          ${timeline.length ? timeline.map((group) => `
            <div class="list-item">
              <div>
                <div class="value">${group.title}</div>
                <div class="label">${group.items.map(escapeHtml).join("；")}</div>
              </div>
            </div>
          `).join("") : '<div class="empty">暂无流程记录</div>'}
        </div>
      </section>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function render() {
    const homeView = !state.view || state.view === "home";
    const homeRelatedView = ["create", "join"].includes(state.view) || (state.view === "rulebook" && rulebookReturnView === "home");
    app.className = `app${homeView ? " home-root" : homeRelatedView ? " home-related" : ""}`;
    document.body?.classList.toggle("home-theme", homeView || homeRelatedView);
    if (state.view === "create") return renderCreate();
    if (state.view === "randomizer") return renderRandomizer();
    if (state.view === "join") return renderJoin();
    if (state.view === "room") return renderRoom();
    if (state.view === "identity") return renderIdentity();
    if (state.view === "night") return renderNight();
    if (state.view === "sheriff") return renderSheriff();
    if (state.view === "withdraw") return renderWithdraw();
    if (state.view === "sheriffVote") return renderSheriffVote();
    if (state.view === "death") return renderDeathRecord();
    if (state.view === "dayVote") return renderDayVote();
    if (state.view === "darkBallot") return renderDarkBallot();
    if (state.view === "orderPrince") return renderOrderPrince();
    if (state.view === "exile") return renderExileRecord();
    if (state.view === "badge") return renderBadge();
    if (state.view === "judge") return renderJudge();
    if (state.view === "review") return renderReview();
    if (state.view === "gameEnd") return renderGameEnd();
    if (state.view === "rulebook") return renderRulebook();
    if (state.view === "admin") return renderAdmin();
    return renderHome();
  }

  app.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const room = getCurrentRoom();

    if (action === "home-boards") { app.querySelector("#home-board-dialog")?.showModal(); return; }
    if (action === "home-boards-close") { app.querySelector("#home-board-dialog")?.close(); return; }
    if (action === "open-rulebook") { await openRulebook(target.dataset.boardId || ""); return; }
    if (action === "rulebook-list") { rulebookBoardId = ""; render(); return; }
    if (action === "rulebook-back") { await setView(rulebookReturnView); return; }

    if (action === "admin-open") {
      state.view = "admin"; adminArchives = null; adminArchive = null; adminError = "";
      try { await loadAdminArchives(); } catch (error) { if (error.status !== 401) adminError = error.message; }
      render(); return;
    }
    if (action === "admin-login") {
      const input = app.querySelector("#adminPassword");
      const password = input?.value || "";
      if (input) input.value = "";
      try { await apiRequest("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }); await loadAdminArchives(); }
      catch (error) { adminArchives = null; adminError = error.message; }
      render(); return;
    }
    if (action === "admin-detail") {
      try { adminArchive = (await apiRequest(`/api/admin/archives/${encodeURIComponent(target.dataset.id || "")}`)).archive; }
      catch (error) { adminArchives = null; adminError = error.message; }
      render(); return;
    }
    if (action === "admin-list") { adminArchive = null; render(); return; }
    if (action === "admin-next" || action === "admin-prev") {
      try { await loadAdminArchives(action === "admin-next" ? adminNextOffset : Math.max(0, adminOffset - 50)); }
      catch (error) { adminArchives = null; adminError = error.message; }
      render(); return;
    }
    if (action === "admin-logout") {
      try { await apiRequest("/api/admin/logout", { method: "POST" }); } catch {}
      adminArchives = null; adminArchive = null; adminError = ""; render(); return;
    }
    if (action === "admin-exit") {
      adminArchives = null; adminArchive = null; adminError = ""; await setView("home"); return;
    }

    if (action === "sheriff-stage-close" && room) {
      try {
        if (IS_REMOTE) await remotePost("sheriff-stage-close");
        else { room.sheriffStageClosedDay = room.night; writeLog(room, "SHERIFF_STAGE_CLOSED", { day: room.night }); saveState(); }
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "view") {
      await setView(target.dataset.view);
      return;
    }

    if (action === "dark-fog-announce" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("dark-fog-announce");
        } else {
          if (!isDarkDestruction(room) || room.phase !== "DAY") throw new Error("当前不能公布暗黑迷雾状态");
          if (!(room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")) throw new Error("请先完成天亮死讯");
          if (!isSheriffElectionFinished(room)) throw new Error("请先结束警上进入警下");
          if (Number(room.darkFogAnnouncedDay || 0) === Number(room.night)) throw new Error("本日迷雾状态已经公布");
          if (room.activeDarkBallot?.status === "OPEN" || (room.exileRecords || []).some((record) => record.day === room.night)
            || room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length
            || (room.pendingDeathSkills || []).some((item) => item.day === room.night)
            || (room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) {
            throw new Error("请先完成当日死亡或投票结算");
          }
          room.darkFogAnnouncedDay = room.night;
          room.publicAnnouncements = room.publicAnnouncements || [];
          room.publicAnnouncements.push({
            id: `dark-fog-${Date.now()}`,
            text: `警下宣布：迷雾${Number(room.liaFogDay || 0) === Number(room.night) ? "开启" : "未开启"}，昨夜${darkBindingTarget(room, room.night) ? `${darkBindingTarget(room, room.night)}号玩家被禁锢` : "无人被禁锢"}。${Number(room.liaFogDay || 0) === Number(room.night) ? "全体戴盔投票。" : ""}`,
            createdAt: Date.now()
          });
          writeLog(room, "DARK_FOG_ANNOUNCED", { day: room.night });
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "dark-ballot-open" && room) {
      const round = Number(target.dataset.round || 1);
      try {
        if (IS_REMOTE) {
          await remotePost("dark-ballot-open", { round });
        } else {
          if (!isDarkDestruction(room) || room.phase !== "DAY") throw new Error("当前不能开始暗黑投票");
          if (!(room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")) throw new Error("请先完成天亮死讯");
          if ((room.exileRecords || []).some((record) => record.day === room.night) || room.activeDarkBallot) throw new Error("本日投票已完成或正在进行");
          if (round === 2 && !(room.dayVoteRecord?.day === room.night && room.dayVoteRecord.round === 1 && room.dayVoteRecord.pkSeats?.length > 1)) throw new Error("当前没有待进行的 PK 投票");
          const fog = Number(room.liaFogDay || 0) === Number(room.night);
          if (Number(room.darkFogAnnouncedDay || 0) !== Number(room.night)) throw new Error("请先公布本日禁锢与迷雾状态，再开始私密投票");
          const pkSeats = round === 2 ? room.dayVoteRecord.pkSeats.map(Number) : [];
          room.activeDarkBallot = {
            day: room.night, round, status: "OPEN",
            voterSeats: getAliveSeats(room).filter((seat) => round !== 2 || !pkSeats.includes(seat)),
            allowedTargets: round === 2 ? pkSeats : getAliveSeats(room),
            votes: {}, openedAt: Date.now()
          };
          if (room.mode === "SYSTEM" && room.night === 1) room.sheriffElectionDone = true;
          room.publicAnnouncements = room.publicAnnouncements || [];
          room.publicAnnouncements.push({ id: `dark-ballot-${Date.now()}`, text: fog ? `${round === 2 ? "PK 投票前再次提醒：" : "公投前再次提醒："}迷雾开启，全体戴盔投票。` : `${round === 2 ? "开始 PK 投票。" : "开始放逐投票。"}`, createdAt: Date.now() });
          writeLog(room, "DARK_BALLOT_OPENED", { day: room.night, round, fog });
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "dark-ballot-submit" && room) {
      const choice = app.querySelector("#darkBallotTarget")?.value;
      const targetSeat = choice === "" || choice === undefined ? NaN : Number(choice);
      if (!Number.isInteger(targetSeat)) { window.alert("请选择投票目标或弃票"); return; }
      try {
        if (IS_REMOTE) {
          await remotePost("dark-ballot-vote", { targetSeat, ballotId: room.activeDarkBallot?.id || "" });
        } else {
          const ownSeat = getMySeat(room)?.seat;
          const ballot = room.activeDarkBallot;
          if (!ballot || ballot.status !== "OPEN" || !ownSeat || !ballot.voterSeats.includes(ownSeat)) throw new Error("当前座位没有投票资格");
          if (targetSeat !== 0 && !ballot.allowedTargets.includes(targetSeat)) throw new Error("投票目标不合法");
          if (Object.prototype.hasOwnProperty.call(ballot.votes, String(ownSeat)) && Number(ballot.votes[String(ownSeat)]) !== targetSeat) throw new Error("投票已提交，以首次成功提交的选择为准");
          ballot.votes[String(ownSeat)] = targetSeat;
          writeLog(room, "DARK_BALLOT_SUBMITTED", { day: ballot.day, round: ballot.round, voterSeat: ownSeat });
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "dark-ballot-close" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("dark-ballot-close");
        } else {
          const ballot = room.activeDarkBallot;
          if (!ballot || ballot.status !== "OPEN") throw new Error("当前没有进行中的投票");
          const missing = ballot.voterSeats.filter((seat) => !Object.prototype.hasOwnProperty.call(ballot.votes, String(seat)));
          if (missing.length) throw new Error(`还有 ${missing.length} 名玩家未提交投票或弃票`);
          const votes = Object.entries(ballot.votes).map(([voterSeat, targetSeat]) => ({ voterSeat: Number(voterSeat), targetSeat: Number(targetSeat) }));
          const record = calculateDayVote({ room, round: ballot.round, votes, pkSeats: room.dayVoteRecord?.pkSeats || [] });
          room.dayVoteRecord = record;
          room.activeDarkBallot = null;
          room.darkBallotRound = 0;
          writeLog(room, "DARK_BALLOT_CLOSED", { day: record.day, round: record.round, counts: record.counts, topSeats: record.topSeats });
          if (record.exiledSeat || record.noExile) finalizeDayVote(room, record, "DARK_PRIVATE_BALLOT");
          else if (record.pkSeats.length) {
            const count = Number(record.counts[record.pkSeats[0]] || 0);
            room.publicAnnouncements.push({ id: `dark-pk-${Date.now()}`, text: `${formatSeatList(record.pkSeats)}平票，各 ${count} 票，进入 PK。`, createdAt: Date.now() });
          }
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "archangel-revival" && room) {
      const useRevive = target.dataset.use === "true";
      try {
        if (IS_REMOTE) await remotePost("archangel-revival", { use: useRevive });
        else resolveLocalArchangelRevival(room, useRevive);
        state.view = "room";
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if (action === "copy-share" && room) {
      const shareUrl = `${location.origin}${location.pathname}?room=${room.id}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        window.alert("链接已复制");
      } catch (error) {
        window.prompt("复制这个链接发给玩家", shareUrl);
      }
      return;
    }

    if (action === "random-speaking") {
      const result = createSpeakingDraw();
      const container = app.querySelector("#randomizerResult");
      if (!container) return;
      container.className = "randomizer-result";
      container.innerHTML = `
        <div class="randomizer-main">
          <span>${result.startSeat}号</span>
          <span>${result.directionName}</span>
        </div>
        <div class="randomizer-order">
          ${result.order.map((seat) => `<span class="order-seat ${seat === result.startSeat ? "start" : ""}">${seat}</span>`).join("")}
        </div>
      `;
      return;
    }

    if (action === "claim-judge" && room) {
      const input = app.querySelector("#judgeCodeInput");
      const judgeCode = input ? input.value.trim() : "";
      if (!judgeCode) {
        window.alert("请输入法官口令");
        return;
      }
      try {
        const data = await remotePost("judge-claim", { judgeCode });
        state.judgeTokens[room.id] = data && data.judgeToken ? data.judgeToken : currentJudgeToken();
        state.remoteRoom = data.room;
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "controller-transfer-start" && room) {
      try {
        const data = await remotePost("controller-transfer-start");
        window.alert(`请将转让码交给新控制设备：${data.controllerTransferCode}`);
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "controller-transfer-claim" && room) {
      const input = app.querySelector("#controllerTransferCodeInput");
      const controllerTransferCode = input ? input.value.trim() : "";
      if (!/^\d{6}$/.test(controllerTransferCode)) {
        window.alert("请输入 6 位转让码");
        return;
      }
      try {
        const data = await remotePost("controller-transfer-claim", { controllerTransferCode });
        state.judgeTokens[room.id] = data && data.judgeToken ? data.judgeToken : currentJudgeToken();
        state.remoteRoom = data.room;
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "system-timeout-skip" && room) {
      if (!window.confirm("确认强制跳过当前夜间步骤？狼人将空刀，神职将不发动技能。")) return;
      try {
        await remotePost("system-timeout-skip");
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "day-record-correct" && room) {
      if (!window.confirm("撤销最近一次死亡或放逐记录，并回到可重新填写的状态？已有后续结算时系统会拒绝撤销。")) return;
      try {
        if (IS_REMOTE) {
          await remotePost("day-record-correct");
        } else {
          const undo = room.dayRecordUndo;
          if (!undo || undo.day !== room.night) throw new Error("当前没有可撤销的当日记录");
          const hasPending = (items) => (items || []).some((item) => item.day === room.night);
          const hasExile = (room.exileRecords || []).some((record) => record.day === room.night);
          if (hasPending(room.pendingDelayedDeaths) || hasPending(room.pendingDeathSkills) || (room.deathSkillRecords || []).some((item) => item.day === room.night)
            || (undo.stage === "DAYBREAK" && (hasExile || room.dayVoteRecord || room.pendingExileResult || room.orderPrinceRevotePending))
            || (undo.stage === "EXILE" && !hasExile)) throw new Error("当前记录已有后续结算，不能安全撤销");
          Object.assign(room, JSON.parse(JSON.stringify(undo.snapshot)));
          room.dayRecordUndo = null;
          writeLog(room, "DAY_RECORD_CORRECTED", { day: room.night, stage: undo.stage, correctedAt: Date.now() });
          saveState();
        }
        state.view = "room";
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "refresh-room") {
      try {
        await refreshRemoteRoom();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "system-upgrade-flow") {
      try { await remotePost("system-upgrade-flow"); render(); }
      catch(error) { window.alert(error.message); }
      return;
    }
    if (action === "fixed-voice-retry") {
      if(fixedNightBusy) return;
      fixedVoiceError = "";
      try {
        await refreshRemoteRoom();
        const latest = state.remoteRoom;
        const clock = latest?.systemNight?.timing || latest?.daySkillVoice;
        if (clock?.phase === "PAUSED") {
          await fixedSpeak("请准备，继续剩余流程。");
          if(latest.phase === "NIGHT") await remotePost("system-fixed-night",{operation:"resume",stepKey:clock.key});
          else await remotePost("system-day-voice",{operation:"resume",windowKey:clock.key});
        }
        runFixedNightClock(); runDaySkillVoice();
      } catch(error) { fixedVoiceError=error.message; }
      render();
      return;
    }
    if (action === "fixed-night-extend" && room) {
      try { await remotePost("system-fixed-night", { operation: "extend", stepKey: room.systemNight.timing.key }); render(); }
      catch(error) { window.alert(error.message); }
      return;
    }
    if (action === "system-speak") {
      speakSystemAnnouncement(target.dataset.text || "");
      return;
    }

    if (action === "self-withdraw" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("sheriff-self-withdraw");
          render();
          return;
        }
        const mySeat = getMySeat(room);
        if (!mySeat || !(room.sheriffCandidates || []).includes(mySeat.seat)) {
          window.alert("只有上警玩家可以退水");
          return;
        }
        const withdrawn = new Set(room.sheriffWithdrawn || []);
        withdrawn.add(mySeat.seat);
        room.sheriffWithdrawn = [...withdrawn].filter((seat) => (room.sheriffCandidates || []).includes(seat)).sort((a, b) => a - b);
        const activeCandidates = (room.sheriffCandidates || []).filter((seat) => !room.sheriffWithdrawn.includes(seat));
        if ((room.sheriffCandidates || []).length && !activeCandidates.length) {
          room.sheriffElectionDone = true;
          room.sheriffBadge = { holderSeat: 0, lost: true };
        }
        writeLog(room, "SHERIFF_SELF_WITHDRAWN", { seat: mySeat.seat });
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "sheriff-election-self-destruct" && room) {
      const seat = Number(app.querySelector("#sheriffSelfDestructSeat")?.value || 0);
      try {
        if (!seat) throw new Error("请选择自爆狼人座位");
        if (!IS_REMOTE && isDarkDestruction(room) && darkBindingTarget(room, room.night) === seat) throw new Error("被禁锢的狼人不能自爆");
        if (IS_REMOTE) {
          await remotePost("sheriff-election-self-destruct", { seat });
        } else {
          const electionDay = room.phase === "DAY"
            && (room.night === 1 || (room.night === 2 && Number(room.sheriffElectionDeferredDay) === 1));
          if (!electionDay || room.sheriffElectionDone || Number(room.sheriffStageClosedDay || 0) === Number(room.night)) throw new Error("当前没有进行中的警长竞选");
          const assignment = (room.assignments || []).find((item) => Number(item.seat) === seat);
          if (!assignment || assignment.alive === false || (assignment.currentCamp || assignment.camp) !== "WOLF"
            || ["mixed_blood", "mechanical_wolf", "lia"].includes(assignment.roleId)) throw new Error("自爆座位必须是可自爆的存活狼人");
          assignment.alive = false;
          trackCaptainDeath(room, seat);
          const firstContest = room.night === 1;
          const record = { day: room.night, phase: "SELF_DESTRUCT", seats: [seat], reasons: { [seat]: ["狼人自爆"] }, sourceAction: { kind: "SELF_DESTRUCT", seat }, resolutionOrder: 1, createdAt: Date.now() };
          room.deathRecords = room.deathRecords || [];
          room.deathRecords.push(record);
          if (firstContest) {
            room.sheriffElectionDeferredDay = 1;
            room.sheriffElectionDone = true;
            room.sheriffCandidates = [];
            room.sheriffWithdrawn = [];
            room.sheriffVoteRecord = null;
          } else {
            room.sheriffElectionDone = true;
            room.sheriffBadge = { holderSeat: 0, lost: true };
            (room.assignments || []).forEach((item) => { item.sheriff = false; });
          }
          room.pendingSheriffSelfDestructSeat = seat;
          if (!room.pendingNightResolution) queueDarkDeathResolution(room, [seat], "SELF_DESTRUCT", record.reasons);
          room.pendingJudgeNightAfterSelfDestruct = true;
          room.publicAnnouncements = room.publicAnnouncements || [];
          room.publicAnnouncements.push({ id: `sheriff-boom-${Date.now()}`, text: `${seat}号玩家自爆。`, createdAt: Date.now() });
          writeLog(room, "WOLF_SELF_DESTRUCTED", { seat, roleId: assignment.roleId, sheriffElectionDeferred: firstContest, badgeLost: !firstContest });
          continueLocalAfterSheriffSelfDestruct(room);
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "wolf-self-destruct" && room) {
      if (!window.confirm("确认自爆并立即结束白天吗？")) return;
      try {
        await remotePost("wolf-self-destruct");
        state.view = "room";
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "use-suggested-deaths" && room) {
      const suggested = calculateSuggestedDeaths(room, room.night);
      state.deathDraftSeats = suggested.map((item) => item.seat);
      state.deathDraftReasons = {};
      suggested.forEach((item) => { state.deathDraftReasons[item.seat] = item.reasons; });
      state.view = "death";
      saveState();
      render();
      return;
    }

    if (action === "system-publish-daybreak" && room) {
      try {
        const data = await remotePost("system-publish-daybreak");
        const latest = data.room.latestPublicAnnouncement;
        if (latest?.id) state.heardAnnouncementIds[room.id] = latest.id;
        const deathAnnouncement = data.announcement || "天亮了。";
        const speech = latest?.text && latest.text !== deathAnnouncement
          ? `${deathAnnouncement}${latest.text}`
          : deathAnnouncement;
        speakSystemAnnouncement(speech);
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "start-night" && room) {
      try {
        if (!IS_REMOTE && room.mode === "SYSTEM") throw new Error("旧的静态无法官房间不能可靠运行新流程；请启动本地服务后创建联网房间，原有数据仍保留。");
        if (IS_REMOTE) {
          await remotePost("night-start");
          state.deathDraftSeats = [];
          state.deathDraftReasons = {};
          state.view = "night";
          saveState();
          render();
          return;
        }
        if (room.mode === "SYSTEM") {
          if (room.pendingNightResolution) throw new Error("请先确认天亮死亡名单");
          if (room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) throw new Error("请先完成天使长复活与出局结算");
          if (room.activeDarkBallot?.status === "OPEN") throw new Error("请先结束暗黑私密投票");
          if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) throw new Error("请先处理蒙面人的延迟死亡");
          if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) throw new Error("请先处理死亡技能");
          if (room.phase === "DAY" && room.systemDayOutcomeRecordedDay !== room.night) throw new Error("请先记录本日最终出局结果或确认无人出局");
        }
        if (room.mode === "JUDGE" && room.phase === "DAY") {
          if (!(room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")) throw new Error("请先宣布夜间死亡信息");
          if (room.activeDaySkillWindow?.status === "OPEN") throw new Error("请先处理当前白天技能窗口");
          if (room.pendingExileResult) throw new Error("请先处理放逐结果与定序王子回溯窗口");
          if (room.orderPrinceRevotePending) throw new Error("请先完成回溯后的重新投票");
          if (room.pendingArchangelRevival || (room.pendingDarkDeathQueue || []).length) throw new Error("请先完成天使长复活与出局结算");
          if (room.activeDarkBallot?.status === "OPEN") throw new Error("请先结束暗黑私密投票");
          if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) throw new Error("请先处理蒙面人的延迟死亡");
          if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) throw new Error("请先处理死亡技能");
          if (!(room.exileRecords || []).some((record) => record.day === room.night)) throw new Error("请先记录本日放逐对象或确认无人出局");
        }
        beginLocalNight(room);
        state.deathDraftSeats = [];
        state.deathDraftReasons = {};
        state.view = "night";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "night-seat") {
      const step = room && room.currentNightSteps ? room.currentNightSteps[room.currentNightStepIndex || 0] : null;
      if (!step) return;
      const selected = app.querySelectorAll(".seat.selected").length;
      const alreadySelected = target.classList.contains("selected");
      if (!alreadySelected && selected >= step.targetCount) {
        if (step.targetCount === 1) {
          app.querySelectorAll(".seat.selected").forEach((item) => item.classList.remove("selected"));
        } else {
          window.alert(`最多选择 ${step.targetCount} 个目标`);
          return;
        }
      }
      target.classList.toggle("selected");
      updateNightResultDisplay(room, step);
      return;
    }

    if (action === "night-card") {
      app.querySelectorAll(".card-option.selected").forEach((item) => item.classList.remove("selected"));
      target.classList.add("selected");
      return;
    }

    if (action === "witch-antidote-choice") {
      app.querySelectorAll("[data-action='witch-antidote-choice']").forEach((item) => item.classList.remove("active"));
      target.classList.add("active");
      return;
    }

    if (action === "witch-poison-seat") {
      app.querySelectorAll("[data-action='witch-poison-seat'].selected").forEach((item) => item.classList.remove("selected"));
      target.classList.add("selected");
      return;
    }

    if (action === "night-witch-submit" && room) {
      const step = room.currentNightSteps[room.currentNightStepIndex || 0];
      if (!step || step.id !== "witch_action") return;
      const antidoteChoice = app.querySelector("[data-action='witch-antidote-choice'].active");
      const canChooseAntidote = canChooseWitchAntidote(room, step);
      if (canChooseAntidote && !antidoteChoice) {
        window.alert("请选择救或不救");
        return;
      }
      const antidoteUsed = canChooseAntidote && antidoteChoice && antidoteChoice.dataset.use === "true";
      const antidoteTargetSeat = antidoteUsed ? getWitchAntidoteTarget(room) : 0;
      if (antidoteUsed && !antidoteTargetSeat) {
        window.alert("今晚无人被击杀，不能使用解药");
        return;
      }
      const usePoison = target.dataset.usePoison === "true";
      const poisonSeatButton = app.querySelector("[data-action='witch-poison-seat'].selected");
      const poisonTargetSeat = usePoison && poisonSeatButton ? Number(poisonSeatButton.dataset.seat) : 0;
      if (usePoison && !poisonTargetSeat) {
        window.alert("请先选择毒药号码");
        return;
      }
      const poisonTargetAlive = Array.isArray(room.aliveSeats)
        ? room.aliveSeats.includes(poisonTargetSeat)
        : (room.assignments || []).some((item) => item.seat === poisonTargetSeat && item.alive !== false);
      if (poisonTargetSeat && !poisonTargetAlive) {
        window.alert("毒药只能选择存活玩家");
        return;
      }
      if (step.singlePotionPerNight && antidoteUsed && poisonTargetSeat) {
        window.alert("女巫同一晚不能同时使用解药和毒药");
        return;
      }

      try {
        if (IS_REMOTE) {
          await remotePost("night-action", { antidoteUsed, antidoteTargetSeat, poisonTargetSeat });
          render();
          return;
        }
        const actionRecord = {
          night: room.night,
          stepId: step.id,
          label: step.label,
          targetSeats: [],
          skipped: !antidoteUsed && !poisonTargetSeat,
          cardRoleId: "",
          antidoteUsed,
          antidoteTargetSeat,
          poisonTargetSeat,
          createdAt: Date.now()
        };
        if (isDarkDestruction(room) && step.id === "lia_charge") {
          actionRecord.success = !skipped && (room.assignments || []).some((assignment) => assignment.seat === targetSeats[0] && assignment.roleId === "villager");
        }
        room.nightActions = room.nightActions || [];
        room.nightActions.push(actionRecord);
        if (isDarkDestruction(room) && step.id === "lia_fog" && !skipped) room.liaFogDay = room.night;
        if (window.TargetMapping) window.TargetMapping.syncNightTargetResolutions(room, room.night);
        writeLog(room, "NIGHT_ACTION", actionRecord);
        if (isDarkDestruction(room) && ["lilith_bind", "lia_charge"].includes(step.id)) {
          rebuildNightStepsAfterDarkAction(room);
        } else {
          room.currentNightStepIndex = (room.currentNightStepIndex || 0) + 1;
        }
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "night-undo" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("night-undo");
          render();
          return;
        }
        const index = [...(room.nightActions || [])].map((nightAction, actionIndex) => ({ nightAction, actionIndex }))
          .reverse()
          .find((item) => item.nightAction.night === room.night);
        if (!index) return;
        const [removed] = room.nightActions.splice(index.actionIndex, 1);
        if (removed.stepId === "siren_wind") {
          const previousWind = [...(room.nightActions || [])].reverse().find((a) => a.stepId === "siren_wind" && a.night < room.night)?.windDirection || "calm";
          room.windDirection = previousWind;
          room.lastWindDirection = previousWind;
        }
        if (removed.stepId === "captain_board") {
          room.boardedSeat = 0;
        }
        if (removed.stepId === "puppet_select") {
          room.puppetSeat = [...(room.nightActions || [])].reverse()
            .find((nightAction) => nightAction.stepId === "puppet_select")?.targetSeats?.[0] || 0;
        }
        if (removed.stepId === "lia_fog") {
          room.liaFogDay = [...(room.nightActions || [])].reverse()
            .find((nightAction) => nightAction.stepId === "lia_fog" && !nightAction.skipped)?.night || 0;
        }
        refreshSwapConflict(room, room.night);
        if (window.TargetMapping) window.TargetMapping.syncNightTargetResolutions(room, room.night);
        rebuildNightStepsAfterUndo(room);
        writeLog(room, "NIGHT_ACTION_UNDONE", { stepId: removed.stepId, label: removed.label, night: removed.night });
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "night-wind" && room) {
      const step = room.currentNightSteps[room.currentNightStepIndex || 0];
      if (!step || step.id !== "siren_wind") return;
      const wind = target.dataset.wind;
      if (!wind) return;
      if (room.night > 1 && wind === room.windDirection) { window.alert("不可连续两晚选择相同风向"); return; }
      try {
        if (IS_REMOTE) {
          await remotePost("night-action", { skipped: false, targetSeats: [], cardRoleId: "", windDirection: wind });
          render();
          return;
        }
        room.lastWindDirection = room.windDirection || "calm";
        room.windDirection = wind;
        const actionRecord = {
          night: room.night, stepId: step.id, label: step.label,
          targetSeats: [], skipped: false, cardRoleId: "", windDirection: wind, createdAt: Date.now()
        };
        room.nightActions = room.nightActions || [];
        room.nightActions.push(actionRecord);
        if (window.TargetMapping) window.TargetMapping.syncNightTargetResolutions(room, room.night);
        writeLog(room, "NIGHT_ACTION", actionRecord);
        room.currentNightStepIndex = (room.currentNightStepIndex || 0) + 1;
        saveState();
        render();
      } catch (error) { window.alert(error.message); }
      return;
    }

    if ((action === "night-submit" || action === "night-skip") && room) {
      const step = room.currentNightSteps[room.currentNightStepIndex || 0];
      if (!step) return;
      const skipped = action === "night-skip";
      let targetSeats = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat));
      const selectedCard = app.querySelector(".card-option.selected");
      let cardRoleId = selectedCard ? selectedCard.dataset.role : "";
      if (step.id === "treasure_skill") cardRoleId = currentTreasureCard(room);
      if (step.id === "witch_antidote" && !skipped) {
        const savedSeat = getWitchAntidoteTarget(room);
        if (!savedSeat) {
          window.alert("今晚无人死亡，不能使用解药");
          return;
        }
        targetSeats = [savedSeat];
      }

      if (!skipped && !step.needsCard && targetSeats.length !== step.targetCount) {
        window.alert(`需要选择 ${step.targetCount} 个目标`);
        return;
      }
      if (!skipped && step.needsCard && !cardRoleId) {
        window.alert("需要选择一张盗宝牌");
        return;
      }
      const ruleError = validateNightAction(room, step, targetSeats, skipped, cardRoleId);
      if (ruleError) {
        window.alert(ruleError);
        return;
      }

      try {
        if (IS_REMOTE) {
          const data = await remotePost("night-action", {
            skipped,
            targetSeats,
            cardRoleId
          });
          const resultText = formatPrivateNightResult(data.privateResult);
          if (resultText) window.alert(resultText);
          render();
          return;
        }
        const actionRecord = {
          night: room.night,
          stepId: step.id,
          label: step.label,
          targetSeats,
          skipped,
          cardRoleId,
          targetMapping: step.targetMapping ? { ...step.targetMapping, targetSeats: [...targetSeats] } : undefined,
          createdAt: Date.now()
        };
        if (isDarkDestruction(room) && step.id === "lia_charge") {
          actionRecord.success = !skipped && (room.assignments || []).some((assignment) => assignment.seat === targetSeats[0] && assignment.roleId === "villager");
        }
        room.nightActions = room.nightActions || [];
        room.nightActions.push(actionRecord);
        if (isDarkDestruction(room) && step.id === "lia_fog" && !skipped) room.liaFogDay = room.night;
        if (step.id === "puppet_select" && targetSeats.length) room.puppetSeat = targetSeats[0];
        if (step.id === "captain_board" && targetSeats.length) {
          room.boardedSeat = targetSeats[0];
        }
        refreshSwapConflict(room, room.night);
        if (window.TargetMapping) window.TargetMapping.syncNightTargetResolutions(room, room.night);
        writeLog(room, "NIGHT_ACTION", actionRecord);
        if (isDarkDestruction(room) && ["lilith_bind", "lia_charge"].includes(step.id)) {
          rebuildNightStepsAfterDarkAction(room);
        } else {
          room.currentNightStepIndex = (room.currentNightStepIndex || 0) + 1;
        }
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "night-finish" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("night-finish");
          const remSug = calculateSuggestedDeaths(state.remoteRoom, state.remoteRoom.night);
          state.deathDraftSeats = remSug.map((item) => item.seat);
          state.deathDraftReasons = {};
          remSug.forEach((item) => { state.deathDraftReasons[item.seat] = item.reasons; });
          state.view = "room";
          saveState();
          render();
          return;
        }
        if (window.TargetMapping) window.TargetMapping.syncNightTargetResolutions(room, room.night);
        room.phase = "DAY";
        room.pendingNightResolution = window.NightResolution.calculateNightResolution(room, room.night);
        if (room.treasureMaskedFinalNight?.status === "ACTIVE") {
          room.treasureMaskedFinalNight.status = "RESOLVED";
          room.treasureMaskedFinalNight.resolvedAt = Date.now();
          writeLog(room, "TREASURE_MASK_FINAL_NIGHT_RESOLVED", room.treasureMaskedFinalNight);
        }
        writeLog(room, "NIGHT_FINISHED", { night: room.night });
        const locSug = calculateSuggestedDeaths(room, room.night);
        state.deathDraftSeats = locSug.map((item) => item.seat);
        state.deathDraftReasons = {};
        locSug.forEach((item) => { state.deathDraftReasons[item.seat] = item.reasons; });
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "sheriff-seat") {
      target.classList.toggle("selected");
      const selected = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat)).sort((a, b) => a - b);
      const label = app.querySelector(".panel .body-text");
      if (label) label.textContent = selected.length ? selected.map((seat) => `${seat}号`).join("、") : "暂未选择";
      return;
    }

    if (action === "sheriff-submit" && room) {
      const seats = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat)).sort((a, b) => a - b);
      try {
        if (IS_REMOTE) {
          await remotePost("sheriff-candidates", { seats });
          state.view = "room";
          saveState();
          render();
          return;
        }
        room.sheriffCandidates = seats;
        room.sheriffWithdrawn = (room.sheriffWithdrawn || []).filter((seat) => seats.includes(seat));
        room.sheriffElectionDone = seats.length === 0;
        room.sheriffVoteRecord = null;
        if (!seats.length) room.sheriffBadge = { holderSeat: 0, lost: true };
        writeLog(room, "SHERIFF_CANDIDATES_CONFIRMED", { seats });
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "withdraw-seat") {
      target.classList.toggle("selected");
      const selected = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat)).sort((a, b) => a - b);
      const label = app.querySelector(".panel .body-text");
      if (label) label.textContent = selected.length ? selected.map((seat) => `${seat}号`).join("、") : "暂无";
      return;
    }

    if (action === "withdraw-submit" && room) {
      const seats = Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat)).sort((a, b) => a - b);
      try {
        if (IS_REMOTE) {
          await remotePost("sheriff-withdraw", { seats });
          state.view = "room";
          saveState();
          render();
          return;
        }
        room.sheriffWithdrawn = seats.filter((seat) => (room.sheriffCandidates || []).includes(seat));
        const activeCandidates = (room.sheriffCandidates || []).filter((seat) => !room.sheriffWithdrawn.includes(seat));
        if ((room.sheriffCandidates || []).length && !activeCandidates.length) {
          room.sheriffElectionDone = true;
          room.sheriffBadge = { holderSeat: 0, lost: true };
        }
        writeLog(room, "SHERIFF_WITHDRAW_CONFIRMED", { seats: room.sheriffWithdrawn });
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "sheriff-vote-submit" && room) {
      const round = Number(target.dataset.round || 1);
      const previous = room.sheriffVoteRecord;
      const votes = Array.from(app.querySelectorAll(".vote-select")).map((select) => ({
        voterSeat: Number(select.dataset.voter),
        targetSeat: Number(select.value)
      }));
      const pkSeats = previous && previous.pkSeats ? previous.pkSeats : [];
      try {
        if (IS_REMOTE) {
          await remotePost("sheriff-vote", { round, votes, pkSeats });
          state.view = "room";
          saveState();
          render();
          return;
        }

        const candidates = room.sheriffCandidates || [];
        const withdrawn = room.sheriffWithdrawn || [];
        const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
        const tiedPkSeats = previous && previous.round === 1 && previous.pkSeats?.length > 1
          ? previous.pkSeats.filter((seat) => activeCandidates.includes(Number(seat))).map(Number)
          : [];
        const allowedTargets = round === 1 ? activeCandidates : round === 2 ? tiedPkSeats : [];
        const pkVoters = new Set(allowedTargets);
        const aliveSeats = new Set(getAliveSeats(room));
        const allowedVoters = room.seats
          .map((seat) => seat.seat)
          .filter((seat) => aliveSeats.has(seat) && (round === 1 ? !candidates.includes(seat) : !pkVoters.has(seat)));
        const counts = {};
        allowedTargets.forEach((seat) => { counts[seat] = 0; });
        const seenVoters = new Set();
        const validVotes = votes.filter((vote) => {
          if (!allowedVoters.includes(vote.voterSeat) || !allowedTargets.includes(vote.targetSeat) || seenVoters.has(vote.voterSeat)) return false;
          seenVoters.add(vote.voterSeat);
          return true;
        });
        validVotes.forEach((vote) => {
          counts[vote.targetSeat] += 1;
        });
        const maxVotes = Math.max(0, ...Object.values(counts));
        const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
        const electedSeat = topSeats.length === 1 ? topSeats[0] : 0;
        const badgeLost = round === 2 && !electedSeat;
        const record = {
          round,
          votes: validVotes,
          counts,
          topSeats,
          electedSeat,
          badgeLost,
          pkSeats: round === 1 && topSeats.length > 1 ? topSeats : [],
          createdAt: Date.now()
        };
        room.sheriffVoteRecord = record;
        room.sheriffElectionDone = Boolean(electedSeat || badgeLost);
        if (electedSeat) {
          room.sheriffBadge = { holderSeat: electedSeat, lost: false };
          room.assignments.forEach((assignment) => {
            assignment.sheriff = assignment.seat === electedSeat;
          });
        } else if (badgeLost) {
          room.sheriffBadge = { holderSeat: 0, lost: true };
        }
        writeLog(room, "SHERIFF_VOTE_CONFIRMED", record);
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "death-seat") {
      target.classList.toggle("selected");
      return;
    }

    if ((action === "death-submit" || action === "death-none") && room) {
      const seats = action === "death-none"
        ? []
        : Array.from(app.querySelectorAll(".seat.selected")).map((item) => Number(item.dataset.seat)).sort((a, b) => a - b);
      try {
        const draftReasons = state.deathDraftReasons || {};
        if ((room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")) throw new Error("本日天亮死亡已经记录");
        const boomSeat = Number(room.pendingSheriffSelfDestructSeat || 0);
        if (boomSeat && (room.pendingNightResolution?.deaths || []).some((item) => Number(item.seat) === boomSeat) && !seats.includes(boomSeat)) throw new Error("自爆玩家也是昨夜死亡玩家，请在警上宣布该死讯");
        const invalidSeat = seats.find((seat) => seat !== boomSeat && !room.assignments.some((assignment) => assignment.seat === seat && assignment.alive !== false));
        if (invalidSeat) throw new Error(`${invalidSeat}号不是存活玩家，不能记录为天亮死亡`);
        const reasonsBySeat = {};
        seats.forEach((seat) => {
          reasonsBySeat[seat] = Array.isArray(draftReasons[seat]) && draftReasons[seat].length ? draftReasons[seat] : ["法官手动确认"];
        });
        if (IS_REMOTE) {
          await remotePost("death-record", { seats, reasons: reasonsBySeat });
          state.deathDraftSeats = [];
          state.deathDraftReasons = {};
          state.view = "room";
          saveState();
          render();
          return;
        }
        const delayedDeaths = (room.pendingNightResolution && room.pendingNightResolution.delayedDeaths || []).map((item) => ({
          ...item,
          day: room.night
        }));
        captureDayRecordUndo(room, "DAYBREAK");
        room.pendingDelayedDeaths = [
          ...(room.pendingDelayedDeaths || []).filter((item) => item.day !== room.night),
          ...delayedDeaths
        ];
        room.pendingNightResolution = null;
        seats.forEach((seat) => {
          const assignment = room.assignments.find((item) => item.seat === seat);
          if (assignment) assignment.alive = false;
          trackCaptainDeath(room, seat);
        });
        const record = { day: room.night, phase: "DAYBREAK", seats, reasons: reasonsBySeat, createdAt: Date.now() };
        room.deathRecords = room.deathRecords || [];
        room.deathRecords.push(record);
        queueDarkDeathResolution(room, seats.filter((seat) => seat !== boomSeat), "DAYBREAK", reasonsBySeat);
        if (boomSeat) queueDarkDeathResolution(room, [boomSeat], "SELF_DESTRUCT", { [boomSeat]: ["狼人自爆"] });
        writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
        continueLocalAfterSheriffSelfDestruct(room);
        state.deathDraftSeats = [];
        state.deathDraftReasons = {};
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "confirm-delayed-death" && room) {
      const seat = Number(target.dataset.seat || 0);
      try {
        if (IS_REMOTE) {
          await remotePost("delayed-death", { seat });
          saveState();
          render();
          return;
        }
        const pending = (room.pendingDelayedDeaths || []).find((item) => item.day === room.night && item.seat === seat);
        if (!pending) throw new Error("没有该玩家的待处理延迟死亡");
        const assignment = room.assignments.find((item) => item.seat === seat);
        if (assignment) assignment.alive = false;
        trackCaptainDeath(room, seat);
        room.pendingDelayedDeaths = (room.pendingDelayedDeaths || []).filter((item) => !(item.day === room.night && item.seat === seat));
        const record = { day: room.night, phase: "DELAYED", seats: [seat], reasons: { [seat]: ["蒙面延迟死亡"] }, createdAt: Date.now() };
        room.deathRecords = room.deathRecords || [];
        room.deathRecords.push(record);
        writeLog(room, "DELAYED_DEATH_CONFIRMED", record);
        queueDarkDeathResolution(room, [seat], "DELAYED", record.reasons);
        continueLocalAfterSheriffSelfDestruct(room);
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if ((action === "death-skill-submit" || action === "death-skill-skip") && room) {
      const seat = Number(target.dataset.seat || 0);
      const targetSeat = action === "death-skill-skip" ? 0 : Number(app.querySelector(`#deathSkillTarget-${seat}`)?.value || 0);
      if (action === "death-skill-submit" && !targetSeat) {
        window.alert("请选择开枪目标");
        return;
      }
      try {
        if (IS_REMOTE) {
          await remotePost("death-skill", { seat, targetSeat });
          saveState();
          render();
          return;
        }
        const pending = (room.pendingDeathSkills || []).find((item) => item.day === room.night && item.seat === seat);
        if (!pending) throw new Error("没有该玩家待处理的死亡技能");
        const suppressed = Boolean(pending.suppressed);
        if (targetSeat && !suppressed) {
          const targetAssignment = room.assignments.find((item) => item.seat === targetSeat);
          if (!targetAssignment || targetAssignment.alive === false) throw new Error("开枪目标必须是存活玩家");
          if (isDarkDestruction(room) && targetAssignment.roleId === "dreamer" && darkBindingTarget(room) === targetSeat) throw new Error("被禁锢的摄梦人次日白天不能出局");
          targetAssignment.alive = false;
          trackCaptainDeath(room, targetSeat);
          const shotRecord = { day: room.night, phase: "SHOT", seats: [targetSeat], reasons: { [targetSeat]: [`${seat}号死亡技能`] }, createdAt: Date.now() };
          room.deathRecords.push(shotRecord);
          queueDarkDeathResolution(room, [targetSeat], "SHOT", shotRecord.reasons);
        }
        room.pendingDeathSkills = (room.pendingDeathSkills || []).filter((item) => !(item.day === room.night && item.seat === seat));
        const record = [...(room.deathSkillRecords || [])].reverse().find((item) => item.day === room.night && item.seat === seat && !item.resolved);
        if (record) Object.assign(record, { resolved: true, targetSeat, skipped: !targetSeat, suppressed, resolvedAt: Date.now() });
        writeLog(room, "DEATH_SKILL_RESOLVED", { seat, targetSeat, skipped: !targetSeat, suppressed });
        advanceDarkDeathResolution(room);
        continueLocalAfterSheriffSelfDestruct(room);
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "day-vote-submit" && room) {
      const round = Number(target.dataset.round || 1);
      const princeRevote = target.dataset.princeRevote === "true";
      const previous = room.dayVoteRecord;
      const votes = Array.from(app.querySelectorAll(".day-vote-select")).map((select) => ({
        voterSeat: Number(select.dataset.voter),
        targetSeat: Number(select.value)
      }));
      const pkSeats = previous && previous.day === room.night && previous.pkSeats ? previous.pkSeats : [];
      try {
        if (IS_REMOTE) {
          await remotePost("day-vote", { round, votes, pkSeats, orderPrinceRevote: princeRevote });
          state.view = state.remoteRoom.pendingExileResult ? "orderPrince" : "room";
          saveState();
          render();
          return;
        }

        const record = calculateDayVote({ room, round, votes, pkSeats });
        room.dayVoteRecord = record;
        if (room.boardId === "realm_of_trickery" && round === 1 && !room.orderPrinceUsed && !princeRevote) {
          room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
          const princeSeat = (room.assignments || []).find((assignment) => assignment.roleId === "order_prince" && assignment.alive !== false)?.seat || 0;
          window.RoomRecords?.openDaySkillWindow(room, {
            id: `order-prince-rewind-${room.night}`,
            day: room.night,
            trigger: "AFTER_FIRST_DAY_VOTE",
            kind: "ORDER_PRINCE_REWIND",
            eligibleSeats: princeSeat ? [princeSeat] : [],
            action: "ACTIVATE_OR_DECLINE",
            resume: "DAY_VOTE_OR_EXILE",
            metadata: { rawExiledSeat: Number(record.exiledSeat || 0), tied: record.topSeats?.length > 1 }
          });
          writeLog(room, "DAY_VOTE_PENDING", record);
          state.view = "orderPrince";
          saveState();
          render();
          return;
        }
        if (princeRevote) room.orderPrinceRevotePending = false;
        if (record.exiledSeat || record.noExile) {
          finalizeDayVote(room, record, princeRevote ? "ORDER_PRINCE_REVOTE" : "DAY_VOTE");
        }
        writeLog(room, "DAY_VOTE_CONFIRMED", record);
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if ((action === "order-prince-activate" || action === "order-prince-decline") && room) {
      try {
        if (IS_REMOTE) {
          await remotePost(action === "order-prince-activate" ? "order-prince-activate" : "order-prince-decline");
          state.view = action === "order-prince-activate" && state.remoteRoom.isController ? "dayVote" : "room";
          saveState();
          render();
          return;
        }
        const pending = room.pendingExileResult;
        if (!pending) return;
        if (action === "order-prince-activate") {
          if (!(room.assignments || []).some((item) => item.roleId === "order_prince" && item.alive !== false)) throw new Error("定序王子已出局，不能发动回溯");
          room.orderPrinceUsed = true;
          room.orderPrinceRevotePending = true;
          room.pendingExileResult = null;
          room.dayVoteRecord = null;
          window.RoomRecords?.resolveDaySkillWindow(room, { actorSeat: getMySeat(room)?.seat || 0, outcome: "ACTIVATED", detail: { effect: "ORDER_PRINCE_REVOTE" } });
          writeLog(room, "ORDER_PRINCE_ACTIVATED", { day: room.night });
          state.view = "dayVote";
        } else {
          const record = pending.record || pending;
          room.pendingExileResult = null;
          room.dayVoteRecord = record;
          window.RoomRecords?.resolveDaySkillWindow(room, { actorSeat: 0, outcome: "DECLINED", detail: { effect: "CONTINUE_EXILE" } });
          if (record.exiledSeat || record.noExile) finalizeDayVote(room, record);
          writeLog(room, "ORDER_PRINCE_DECLINED", { day: room.night });
          state.view = "room";
        }
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "exile-seat") {
      app.querySelectorAll(".seat.selected").forEach((item) => item.classList.remove("selected"));
      target.classList.add("selected");
      return;
    }

    if ((action === "exile-submit" || action === "exile-none") && room) {
      const selected = app.querySelector(".seat.selected");
      const noExile = action === "exile-none";
      if (!noExile && !selected) {
        window.alert("请选择被放逐玩家");
        return;
      }
      const seat = noExile ? 0 : Number(selected.dataset.seat);
      try {
        if (!(room.deathRecords || []).some((record) => record.day === room.night && record.phase === "DAYBREAK")) throw new Error("请先记录本日天亮死亡");
        if ((room.exileRecords || []).some((record) => record.day === room.night)) throw new Error("本日放逐结果已经记录");
        if (IS_REMOTE) {
          await remotePost("exile-record", { seat, noExile });
          state.view = state.remoteRoom.pendingExileResult ? "orderPrince" : "room";
          saveState();
          render();
          return;
        }
        if (room.mode === "JUDGE" && room.boardId === "realm_of_trickery") {
          if (room.pendingExileResult || room.activeDaySkillWindow || room.orderPrinceRevotePending) throw new Error("请先处理白天技能窗口或重新投票");
          const actualSeat = noExile ? 0 : mapExileSeat(room, seat);
          if (!noExile && (!(room.assignments || []).some((item) => item.seat === seat && item.alive !== false) || !(room.assignments || []).some((item) => item.seat === actualSeat && item.alive !== false))) throw new Error("投票号码及换号后的目标必须存活");
          const record = { day: room.night, round: 1, exiledSeat: seat, noExile, counts: {}, topSeats: seat ? [seat] : [], source: "DIRECT_EXILE", createdAt: Date.now() };
          const firstRoundPending = !room.orderPrinceUsed && !(room.dayVoteRecord?.day === room.night && room.dayVoteRecord.round === 1 && room.dayVoteRecord.pkSeats?.length > 1);
          if (firstRoundPending) {
            room.pendingExileResult = { day: room.night, record, createdAt: Date.now() };
            const princeSeat = (room.assignments || []).find((item) => item.roleId === "order_prince" && item.alive !== false)?.seat || 0;
            window.RoomRecords?.openDaySkillWindow(room, { id: `order-prince-rewind-${room.night}`, day: room.night, trigger: "AFTER_FIRST_DAY_VOTE", kind: "ORDER_PRINCE_REWIND", eligibleSeats: princeSeat ? [princeSeat] : [], action: "ACTIVATE_OR_DECLINE", resume: "DAY_VOTE_OR_EXILE", metadata: { rawExiledSeat: seat, tied: false } });
            writeLog(room, "DAY_VOTE_PENDING", record);
            state.view = "orderPrince";
          } else {
            room.dayVoteRecord = record;
            finalizeDayVote(room, record, "DIRECT_EXILE");
            state.view = "room";
          }
          saveState();
          render();
          return;
        }
        if (!noExile) {
          const assignment = room.assignments.find((item) => item.seat === seat);
          if (!assignment || assignment.alive === false) throw new Error("放逐目标必须是存活玩家");
          if (isDarkDestruction(room) && darkBindingTarget(room, room.night) === seat) throw new Error("被禁锢玩家本日不能被放逐");
          assignment.alive = false;
          if (assignment.roleId === "idiot") assignment.publiclyRevealed = true;
          trackCaptainDeath(room, seat);
          if (shouldStartTreasureMaskedFinalNight(room, assignment)) {
            room.treasureMaskedFinalNight = { seat, triggerDay: room.night, status: "PENDING", createdAt: Date.now() };
            writeLog(room, "TREASURE_MASK_FINAL_NIGHT_PENDING", room.treasureMaskedFinalNight);
          } else {
            queueDarkDeathResolution(room, [seat], "EXILE");
          }
        }
        const record = { day: room.night, seat, noExile, createdAt: Date.now() };
        room.exileRecords = room.exileRecords || [];
        room.exileRecords.push(record);
        writeLog(room, "EXILE_CONFIRMED", record);
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "badge-seat") {
      app.querySelectorAll(".seat.selected").forEach((item) => item.classList.remove("selected"));
      target.classList.add("selected");
      return;
    }

    if ((action === "badge-transfer" || action === "badge-destroy") && room) {
      const selected = app.querySelector(".seat.selected");
      const mode = action === "badge-destroy" ? "destroy" : "transfer";
      if (mode === "transfer" && !selected) {
        window.alert("请选择移交目标");
        return;
      }
      const seat = selected ? Number(selected.dataset.seat) : 0;
      try {
        if (IS_REMOTE) {
          await remotePost("sheriff-badge", { mode, seat });
          state.view = "room";
          saveState();
          render();
          return;
        }
        if (mode === "destroy") {
          room.sheriffBadge = { holderSeat: 0, lost: true };
          room.assignments.forEach((assignment) => { assignment.sheriff = false; });
          writeLog(room, "SHERIFF_BADGE_DESTROYED", {});
        } else {
          room.sheriffBadge = { holderSeat: seat, lost: false };
          room.assignments.forEach((assignment) => {
            assignment.sheriff = assignment.seat === seat;
          });
          writeLog(room, "SHERIFF_BADGE_TRANSFERRED", { seat });
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if ((action === "game-result" || action === "game-result-skip") && room) {
      try {
        const result = action === "game-result-skip" ? "SKIP" : target.dataset.result;
        const historyEntry = {
          boardId: room.boardId,
          roomId: room.id,
          result,
          assignments: (room.assignments || []).map((a) => ({ seat: a.seat, roleId: a.roleId, camp: a.camp, alive: a.alive })),
          createdAt: Date.now()
        };
        if (IS_REMOTE) {
          await remotePost("game-result", { result, assignments: historyEntry.assignments });
        } else {
          const historyKey = "twelve_midnight_game_history_v1";
          let history = [];
          try { history = JSON.parse(localStorage.getItem(historyKey) || "[]"); } catch (e) {}
          history.push(historyEntry);
          localStorage.setItem(historyKey, JSON.stringify(history));
        }
        state.view = "room";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "game-end" && room) {
      if (!window.confirm("确定结束游戏？")) return;
      try {
        if (IS_REMOTE) {
          await remotePost("game-end");
          state.view = "gameEnd";
          saveState();
          render();
          return;
        }
        room.phase = "GAME_OVER";
        writeLog(room, "GAME_ENDED", {});
        state.view = "gameEnd";
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "choose-seat" && room) {
      if (IS_REMOTE && (room.isJudge || room.isController)) {
        window.alert(room.mode === "SYSTEM" ? "公共控制设备不占玩家座位" : "法官不占 1-12 号座位");
        return;
      }
      if (room.phase !== "WAITING") {
        window.alert("发牌后不能换座");
        return;
      }
      const seatNumber = Number(target.dataset.seat);
      const selected = room.seats.find((seat) => seat.seat === seatNumber);
      const isMine = IS_REMOTE ? room.mySeat?.seat === seatNumber : selected.userId === state.currentUserId;
      if (selected.occupied && !isMine) {
        window.alert("座位已被占用");
        return;
      }
      if (IS_REMOTE) {
        if (seatSelectionPending) return;
        seatSelectionPending = true;
        app.querySelectorAll("[data-action='choose-seat']").forEach((button) => { button.disabled = true; });
        try {
          await remotePost("seat", {
            seat: seatNumber,
            nickname: "我"
          });
        } catch (error) {
          window.alert(error.message);
        } finally {
          seatSelectionPending = false;
          if (state.view === "room") render();
        }
        return;
      }
      room.seats.forEach((seat) => {
        if (seat.userId === state.currentUserId) {
          seat.userId = "";
          seat.nickname = "";
          seat.occupied = false;
        }
      });
      selected.userId = state.currentUserId;
      selected.nickname = "我";
      selected.occupied = true;
      writeLog(room, "SEAT_SELECTED", { seat: seatNumber });
      saveState();
      render();
      return;
    }

    if (action === "fill-test-seats" && room) {
      if (IS_REMOTE) {
        try {
          await remotePost("fill-test");
          render();
        } catch (error) {
          window.alert(error.message);
        }
        return;
      }
      room.seats.forEach((seat) => {
        if (!seat.occupied) {
          seat.userId = `test-${seat.seat}`;
          seat.nickname = `${seat.seat}号`;
          seat.occupied = true;
        }
      });
      writeLog(room, "TEST_SEATS_FILLED", {});
      saveState();
      render();
      return;
    }

    if (action === "deal" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("deal");
          render();
          return;
        }
        const seats = room.seats.map((seat) => seat.seat);
        const balanced = window.BalancedDeal.createBalancedDeal({
          boardId: room.boardId,
          history: state.dealHistory,
          randomInt: secureRandomInt,
          createCandidate: () => dealBoard(room.boardId, seats)
        });
        room.assignments = balanced.assignments;
        room.dealBalanceMeta = balanced.meta;
        state.dealHistory = balanced.history;
        room.phase = "DEALT";
        writeLog(room, "DEALT", { boardId: room.boardId });
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "reset") {
      if (!window.confirm(IS_REMOTE ? "确定退出当前房间？" : "确定重置本地数据？")) return;
      if (IS_REMOTE) {
        state.currentRoomId = "";
        state.remoteRoom = null;
        state.view = "home";
        saveState();
        render();
        return;
      }
      state = createInitialState();
      saveState();
      render();
    }
  });

  preloadRoleImages();

  if (IS_REMOTE && state.currentRoomId) {
    refreshRemoteRoom()
      .catch(() => {
        state.currentRoomId = "";
        state.remoteRoom = null;
        state.view = "home";
        saveState();
      })
      .finally(render);
  } else {
    render();
  }

  if (IS_REMOTE) {
    document.addEventListener("visibilitychange", () => {
      if(document.hidden) { fixedVoiceError="页面已进入后台，流程暂停；回到前台后请重试。"; window.speechSynthesis?.cancel(); pauseCurrentClock().catch(() => {}); }
    });
    setInterval(async () => {
      const room=state.remoteRoom;
      const clock=room?.systemNight?.timing || room?.daySkillVoice;
      if(heartbeatBusy || !clock || !room.isController || fixedVoiceError || document.hidden || clock.phase==='PAUSED') return;
      heartbeatBusy=true;
      try {
        if(room.phase==='NIGHT') await remotePost('system-fixed-night',{operation:'heartbeat',stepKey:clock.key});
        else if(room.phase==='DAY') await remotePost('system-day-voice',{operation:'heartbeat',windowKey:clock.key});
      } catch(error) { if(error.status===409) await refreshRemoteRoom().catch(()=>{}); else fixedVoiceError="连接中断，流程将暂停；恢复后请重试。"; }
      finally { heartbeatBusy=false; }
    }, 2000);
    setInterval(() => { runFixedNightClock(); runDaySkillVoice(); }, 500);
    setInterval(() => {
      if (!state.currentRoomId || !AUTO_REFRESH_VIEWS.includes(state.view)) return;
      refreshRemoteRoom()
        .then(() => {
          if (!hasUnsavedInteraction()) render();
        })
        .catch(() => {});
    }, 2500);

    setInterval(() => {
      const room = state.remoteRoom;
      const mayProcessTimeout = Boolean(room?.mySeat || room?.isController);
      if (systemSkillTimeoutPending || !state.currentRoomId || room?.mode !== "SYSTEM" || room.phase !== "DAY"
        || !mayProcessTimeout || !room.systemSkillDeadlineAt || Date.now() < room.systemSkillDeadlineAt
        || Date.now() < systemSkillTimeoutRetryAt) return;
      systemSkillTimeoutPending = true;
      remotePost("system-skill-timeout")
        .then(() => { systemSkillTimeoutRetryAt = 0; render(); })
        .catch((error) => {
          systemSkillTimeoutRetryAt = Date.now() + 2500;
          if (error.status !== 409) console.warn("自动处理白天技能窗口失败", error);
        })
        .finally(() => { systemSkillTimeoutPending = false; });
    }, 500);
  }
})();
