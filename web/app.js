(function () {
  document.title = "最后一夜 Last-Night";
  const STORAGE_KEY = "twelve_midnight_web_state_v1";
  const app = document.querySelector("#app");
  const IS_REMOTE = location.protocol === "http:" || location.protocol === "https:";
  const AUTO_REFRESH_VIEWS = ["room", "identity", "judge", "review", "night"];
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

  const DEFAULT_RULES = {
    winCondition: "KILL_SIDE",
    sheriffEnabled: true,
    lastWordsEnabled: true,
    nightDeathLastWords: false,
    witchCanSelfSaveFirstNight: false,
    witchAntidoteCount: 1,
    witchPoisonCount: 1,
    guardCanRepeatTarget: false,
    wolvesCanNoKill: true,
    seerCanSkipCheck: false,
    spiritMediumCanSkipCheck: false,
    tieRule: "PK_THEN_NO_OUT_ON_SECOND_TIE"
  };

  const ROLES = {
    seer: { id: "seer", name: "预言家", camp: "GOOD", image: "assets/roles/seer.png", summary: "每晚必须查验一名玩家，获得好人或狼人结果。" },
    witch: { id: "witch", name: "女巫", camp: "GOOD", image: "assets/roles/witch.png", summary: "拥有一瓶解药和一瓶毒药。首夜不可自救。" },
    hunter: { id: "hunter", name: "猎人", camp: "GOOD", image: "assets/roles/hunter.png", summary: "被狼刀或放逐时可开枪；被毒或作为最后一神时不能开枪。" },
    idiot: { id: "idiot", name: "白痴", camp: "GOOD", image: "assets/roles/idiot.png", summary: "被放逐后出局并公布身份。" },
    villager: { id: "villager", name: "平民", camp: "GOOD", image: "assets/roles/villager.png", summary: "无夜间技能，依靠发言和投票帮助好人阵营获胜。" },
    wolf: { id: "wolf", name: "狼人", camp: "WOLF", image: "assets/roles/wolf.png", summary: "夜间与狼人同伴选择击杀目标，允许空刀。" },
    wolf_king: { id: "wolf_king", name: "狼王", camp: "WOLF", image: "assets/roles/wolf_king.png", summary: "出局时可带走一名玩家；被毒或作为最后一狼时不能发动。" },
    mixed_blood: { id: "mixed_blood", name: "混血儿", camp: "FOLLOW", image: "assets/roles/mixed_blood.png", summary: "首夜选择榜样，胜利条件跟随榜样阵营；预言家查验永远为好人。" },
    dancer: { id: "dancer", name: "舞者", camp: "GOOD", image: "assets/roles/dancer.png", summary: "自第二夜起选择三名玩家共舞，根据舞池阵营结算死亡。" },
    mask: { id: "mask", name: "假面", camp: "WOLF", image: "assets/roles/mask.png", summary: "不与狼人见面；验证舞池并给予面具，面具只影响舞池结算。" },
    spirit_medium: { id: "spirit_medium", name: "通灵师", camp: "GOOD", image: "assets/roles/spirit_medium.png", summary: "每晚必须查验一名存活玩家的具体身份。" },
    poisoner: { id: "poisoner", name: "毒师", camp: "GOOD", image: "assets/roles/poisoner.png", summary: "拥有一瓶毒药，可夜间毒杀一名玩家。" },
    dreamer: { id: "dreamer", name: "摄梦人", camp: "GOOD", image: "assets/roles/dreamer.png", summary: "每晚必须摄一名玩家；被摄免刀免毒，连续被摄死亡。" },
    masked_man: { id: "masked_man", name: "蒙面人", camp: "GOOD", image: "assets/roles/masked_man.png", summary: "夜间被毒、被摄、被刀时当晚不死，次日自己发言后死亡。" },
    mechanical_wolf: { id: "mechanical_wolf", name: "机械狼", camp: "WOLF", image: "assets/roles/mechanical_wolf.png", summary: "夜间模仿一名玩家，不与其他狼人见面，其他狼人出局后方可带刀。" },
    treasure_master: { id: "treasure_master", name: "盗宝大师", camp: "WOLF", image: "assets/roles/treasure_master.png", summary: "首夜获得三张盗宝牌；当前固定为狼人阵营。每晚切换一张牌使用技能。" },
    guard: { id: "guard", name: "守卫", camp: "GOOD", image: "assets/roles/guard.png", summary: "每晚守护一名玩家，不能连续两晚守同一人。" },
    magician: { id: "magician", name: "魔术师", camp: "GOOD", image: "assets/roles/magician.png", summary: "每晚可交换两个号码，换号影响当晚狼刀、毒药和预言家查验。" },
    order_prince: { id: "order_prince", name: "定序王子", camp: "GOOD", image: "assets/roles/order_prince.png", summary: "整局一次，在白天首轮投票结算前发动回溯，额外发言并重新投票。" },
    trickster: { id: "trickster", name: "诡术师", camp: "WOLF", image: "assets/roles/trickster.png", summary: "每晚可交换两个号码，换号影响次日放逐，且不能连续两晚空换。" },
    siren: { id: "siren", name: "海妖", camp: "WOLF", image: "assets/roles/siren.png", summary: "每晚选择风向（无风/顺风/逆风），不可连续两晚相同。与狼人见面。死后风向固定。" },
    captain: { id: "captain", name: "船长", camp: "GOOD", image: "assets/roles/captain.png", summary: "第二晚起必须选择一名其他玩家登船。有风时上风向玩家溺亡；无风时登船者免疫狼刀。免疫溺亡。" }
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
      tagline: "经典开局，混血未定。十二人长夜由此展开。",
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
      tagline: "假面轻覆，舞池暗涌。三步入局，一步出局。",
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
      tagline: "三牌在手，一夜一变。盗宝之人，今日为谁？",
      globalRules: DEFAULT_RULES,
      specialRules: {
        treasureMaster: {
          fixedCards: ["wolf", "villager"],
          godCardPoolExcludes: ["masked_man"],
          allowMaskedManInTreasureCards: false,
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
      tagline: "机械模仿，通灵辨真。真假之间，谁在演戏？",
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
      tagline: "换号颠倒，回溯归零。十二人局，眼见为虚。",
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
      tagline: "海妖控风，船长掌船。十二人迷雾中航向黎明。",
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
    captain: "船"
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
      singlePotionPerNight: room && ["realm_of_trickery", "dawn_voyage"].includes(room.boardId)
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
    if (step.actor === "wolf_team") {
      const extraMembers = room.boardId === "realm_of_trickery" ? ["trickster"] : room.boardId === "dawn_voyage" ? ["siren"] : [];
      return assignments.some((assignment) => assignment.alive !== false && ["wolf", "wolf_king", ...extraMembers].includes(assignment.roleId));
    }
    return assignments.some((assignment) => assignment.alive !== false && assignment.roleId === step.actor);
  }

  function createNightSteps(boardId, night, room = null) {
    const firstNight = night === 1;
    const steps = [];
    if (boardId === "pre_witch_hunter_idiot_mixed") {
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
      steps.push(
        { id: "poisoner_poison", actor: "poisoner", label: "毒师选择是否毒人", targetCount: 1, allowSkip: true },
        { id: "spirit_medium_check", actor: "spirit_medium", label: "通灵师查验具体身份", targetCount: 1, allowSkip: false }
      );
      if (firstNight) {
        steps.push({ id: "hunter_confirm", actor: "hunter", label: "猎人确认身份", targetCount: 0, allowSkip: false });
        steps.push({ id: "masked_man_confirm", actor: "masked_man", label: "蒙面人确认身份", targetCount: 0, allowSkip: false });
      }
    } else if (boardId === "mechanical_wolf_spirit_medium") {
      const witchStep = createWitchStep(room);
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
        steps.push({ id: "magician_swap", actor: "magician", label: "魔术师交换两个号码", targetCount: 2, allowSkip: true, allowedSeats: magicianSeats });
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

  let state = loadState();
  let lastSystemAnnouncementKey = "";

  function speakSystemAnnouncement(text) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  function createInitialState() {
    return {
      currentUserId: `user-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
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
      deathRecords: [],
      pendingNightResolution: null,
      pendingDelayedDeaths: [],
      pendingDeathSkills: [],
      deathSkillRecords: [],
      exileRecords: [],
      windDirection: "calm",
      lastWindDirection: "calm",
      boardedSeat: 0,
      captainDiedLastDay: false,
      captainAliveAtDawn: true
    };
  }

  function getCurrentRoom() {
    if (IS_REMOTE) return state.remoteRoom;
    if (!state.currentRoomId) return null;
    return state.rooms[state.currentRoomId] || null;
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
      throw new Error(data.error || "请求失败");
    }
    return data;
  }

  function currentJudgeToken() {
    return state.judgeTokens[state.currentRoomId] || "";
  }

  async function refreshRemoteRoom() {
    if (!IS_REMOTE || !state.currentRoomId) return null;
    const query = new URLSearchParams({
      clientId: state.currentUserId,
      judgeToken: currentJudgeToken()
    });
    const data = await apiRequest(`/api/rooms/${state.currentRoomId}?${query.toString()}`);
    state.remoteRoom = data.room;
    saveState();
    return data.room;
  }

  async function remotePost(action, payload = {}) {
    const data = await apiRequest(`/api/rooms/${state.currentRoomId}/${action}`, {
      method: "POST",
      body: JSON.stringify({
        clientId: state.currentUserId,
        judgeToken: currentJudgeToken(),
        ...payload
      })
    });
    state.remoteRoom = data.room;
    saveState();
    return data;
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
    if (!room || room.night !== 1) return true;
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
    const allowedTargets = round === 1 ? aliveSeats : pkSeats.filter((seat) => aliveSeats.includes(seat));
    const counts = {};
    allowedTargets.forEach((seat) => { counts[seat] = 0; });
    votes.forEach((vote) => {
      const targetSeat = Number(vote.targetSeat);
      if (allowedTargets.includes(targetSeat)) counts[targetSeat] += 1;
    });
    const maxVotes = Math.max(0, ...Object.values(counts));
    const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
    const exiledSeat = topSeats.length === 1 ? topSeats[0] : 0;
    const noExile = !exiledSeat && (round === 2 || topSeats.length === 0);
    return {
      day: room.night,
      round,
      votes,
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

  function mapNightSeat(room, seat, night = room.night) {
    return room.boardId === "realm_of_trickery" ? mapSeatWithPair(seat, getActiveSwapPair(room, "magician_swap", night)) : Number(seat || 0);
  }

  function mapExileSeat(room, seat, day = room.night) {
    return room.boardId === "realm_of_trickery" ? mapSeatWithPair(seat, getActiveSwapPair(room, "trickster_swap", day)) : Number(seat || 0);
  }

  function finalizeDayVote(room, record, source = "DAY_VOTE") {
    const rawExiledSeat = Number(record.exiledSeat || 0);
    const actualExiledSeat = rawExiledSeat ? mapExileSeat(room, rawExiledSeat, record.day) : 0;
    record.rawExiledSeat = rawExiledSeat;
    record.actualExiledSeat = actualExiledSeat;
    record.exiledSeat = actualExiledSeat;
    if (actualExiledSeat) {
      const assignment = room.assignments.find((item) => item.seat === actualExiledSeat);
      if (assignment) {
        assignment.alive = false;
        if (assignment.roleId === "idiot") assignment.revealed = true;
      }
      trackCaptainDeath(room, actualExiledSeat);
      queueDeathSkills(room, [actualExiledSeat], "EXILE");
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

  function getNightActionTarget(room, stepId, night = room.night) {
    const action = (room.nightActions || []).find((item) => item.night === night && item.stepId === stepId && !item.skipped);
    return action && action.targetSeats && action.targetSeats.length ? action.targetSeats[0] : 0;
  }

  function getWitchAntidoteTarget(room) {
    return Number(room?.systemNight?.privateContext?.wolfVictimSeat || 0)
      || getNightActionTarget(room, "wolves_kill", room.night);
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
      if (activeCard === "wolf" && !skipped && (room.assignments || []).some((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId))) return "仍有狼人同伴存活，盗宝狼人不能发动击杀";
    }
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
    if (room.phase === "DAY" && room.night === 1 && !isSheriffElectionFinished(room)) {
      const candidates = room.sheriffCandidates || [];
      const withdrawn = room.sheriffWithdrawn || [];
      if (candidates.includes(mySeat.seat) && !withdrawn.includes(mySeat.seat)) {
        return "警长竞选中，你仍在警上；如需退水可点击“我要退水”。";
      }
      if (candidates.includes(mySeat.seat) && withdrawn.includes(mySeat.seat)) return "警长竞选中，你已退水。";
      return "警长竞选中，等待警徽结果。";
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
    if (room.phase === "DAY" && room.night === 1 && !(room.sheriffCandidates || []).length && !room.sheriffElectionDone) {
      return { title: "白天阶段", detail: "可记录上警、天亮死亡或直接进入下一夜。", action: "记录上警" };
    }
    if (room.phase === "DAY" && room.night === 1 && !isSheriffElectionFinished(room)) {
      const activeCandidates = (room.sheriffCandidates || []).filter((seat) => !(room.sheriffWithdrawn || []).includes(seat));
      if (!activeCandidates.length) return { title: "白天阶段", detail: "警上玩家均已退水。可记录天亮死亡或直接进入下一夜。", action: "记录天亮死亡" };
      const vote = room.sheriffVoteRecord;
      return vote && vote.pkSeats && vote.pkSeats.length
        ? { title: "警徽 PK 投票", detail: `PK 玩家：${formatSeatList(vote.pkSeats)}。`, action: "记录警徽投票" }
        : { title: "白天阶段", detail: `警上：${formatSeatList(activeCandidates)}。可记录警徽投票、天亮死亡或进入下一夜。`, action: "记录警徽投票" };
    }
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night);
    if (room.phase === "DAY" && !daybreakRecorded) {
      return { title: "白天阶段", detail: "可选择记录天亮死亡、放逐投票或进入下一夜。", action: "记录天亮死亡" };
    }
    if (room.phase === "DAY") {
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
      poisoner_poison: "毒师请睁眼，请选择发动技能的号码。",
      spirit_medium_check: "通灵师请睁眼，请验人，他的身份是。",
      mechanical_mimic: "机械狼请睁眼，请选择今晚模仿的目标。记录后闭眼。",
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
    if (!step || (!["seer_check", "spirit_medium_check", "mechanical_mimic", "mechanical_check"].includes(step.id) && !treasureCheck)) return "";
    const selectedSeat = targetSeats && targetSeats.length ? Number(targetSeats[0]) : 0;
    if (!selectedSeat) return "选择目标后，这里会显示需要告知角色的结果。";
    let seat = step.id === "seer_check" ? mapNightSeat(room, selectedSeat, room.night) : selectedSeat;
    if (step.id === "seer_check" && room.boardId === "dawn_voyage") {
      seat = applyWind(seat, room.windDirection || "calm", room.boardedSeat || 0);
    }
    const assignment = (room.assignments || []).find((item) => item.seat === seat);
    if (!assignment) return `${seat}号：未找到身份`;
    const role = getRole(assignment.roleId) || { name: assignment.roleId };
    if (step.id === "seer_check") {
      const result = assignment.camp === "WOLF" ? "狼人" : "好人";
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
    if (!step || (!["seer_check", "spirit_medium_check", "mechanical_mimic", "mechanical_check"].includes(step.id) && !treasureCheck)) return "";
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

  function renderHome() {
    const hasRoom = Boolean(getCurrentRoom());
    const room = getCurrentRoom();
    app.innerHTML = `
      <section class="home-hero">
        <div class="hero-art">
          <img class="app-icon" src="assets/app-icon.png" alt="最后一夜 Last-Night" />
          <div class="clock-ring" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
        <div class="hero-copy">
          <div class="eyebrow brand-name">最后一夜 <span class="brand-en">Last-Night</span></div>
          <div class="brand-subtitle">狼人杀还有一万个夏天</div>
        </div>
      </section>

      <section class="home-actions">
        <button class="action-card primary-action" data-action="view" data-view="create">
          <span class="action-title">创建房间</span>
          <span class="action-note">选择版型并生成房间号</span>
        </button>
        <button class="action-card" data-action="view" data-view="join">
          <span class="action-title">加入房间</span>
          <span class="action-note">输入房间号进入座位</span>
        </button>
      </section>

      ${hasRoom ? `
        <section class="resume-panel">
          <div>
            <div class="label">当前房间</div>
            <div class="value">${room.id} · ${getBoard(room.boardId).name}</div>
          </div>
          <button class="small-button" data-action="view" data-view="room">继续</button>
        </section>
      ` : ""}

      <section class="panel board-panel">
        <div class="section-heading">
          <div>
            <div class="label">固定版型</div>
            <div class="value">${BOARDS.length}套 12 人局</div>
          </div>
          <span class="tag">MVP</span>
        </div>
        <div class="list">
          ${BOARDS.map((board) => `<div class="list-item board-item"><div><div class="board-name">${board.name}</div><div class="board-meta">${board.roleSummary || "12 人 · 屠边 · 可上警"}</div></div><span class="tag">可发牌</span></div>`).join("")}
        </div>
      </section>
    `;
  }

  function renderCreate() {
    app.innerHTML = `
      ${pageHeader("创建房间", IS_REMOTE ? "选择模式和版型，生成一个可分享房间" : "选择模式和版型，生成一个本地房间")}
      <section class="panel stack">
        <div>
          <div class="label">模式</div>
          <div class="segmented" id="modeSelector">
            <button class="segment active" data-mode="JUDGE">有法官</button>
            <button class="segment" data-mode="SYSTEM">无法官</button>
          </div>
        </div>
        <label class="field">
          <span class="label">版型</span>
          <select class="select" id="boardSelect">
            ${BOARDS.map((board) => `<option value="${board.id}">${board.name}</option>`).join("")}
          </select>
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
              boardId: app.querySelector("#boardSelect").value
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
    const mySeat = room.seats.find((seat) => seat.userId === state.currentUserId);
    const occupiedCount = room.seats.filter((seat) => seat.occupied).length;
    const isJudge = !IS_REMOTE || room.isJudge;
    const isController = Boolean(room.isController);
    const canControl = isJudge || (room.mode === "SYSTEM" && isController);
    const gameOver = room.phase === "GAME_OVER";
    const canDeal = canControl && room.phase === "WAITING" && occupiedCount === board.playerCount;
    const shareUrl = IS_REMOTE ? `${location.origin}${location.pathname}?room=${room.id}` : "";
    const latestDeaths = latestRecord(room.deathRecords);
    const latestExile = latestRecord(room.exileRecords);
    const sheriffCandidates = room.sheriffCandidates || [];
    const sheriffWithdrawn = room.sheriffWithdrawn || [];
    const sheriffActive = sheriffCandidates.filter((seat) => !sheriffWithdrawn.includes(seat));
    const sheriffVote = room.sheriffVoteRecord;
    const sheriffBadge = room.sheriffBadge || { holderSeat: 0, lost: false };
    const dayVote = room.dayVoteRecord && room.dayVoteRecord.day === room.night ? room.dayVoteRecord : null;
    const sheriffElectionDone = isSheriffElectionFinished(room);
    const daybreakRecorded = (room.deathRecords || []).some((record) => record.day === room.night);
    const canRecordDaybreakDeaths = room.phase === "DAY" && isJudge && !daybreakRecorded;
    const canRunDayActions = room.phase === "DAY" && isJudge;
    const pendingExileResult = room.pendingExileResult || null;
    const pendingDelayedDeaths = room.myDelayedDeath ? [room.myDelayedDeath] : (room.pendingDelayedDeaths || []).filter((item) => item.day === room.night);
    const pendingDeathSkills = room.myDeathSkill ? [room.myDeathSkill] : (room.pendingDeathSkills || []).filter((item) => item.day === room.night);
    const publicReveals = IS_REMOTE ? room.publicReveals || [] : (room.assignments || []).filter((assignment) => assignment.revealed && assignment.roleId === "idiot");
    const suggestedDeaths = canRecordDaybreakDeaths ? calculateSuggestedDeaths(room, room.night) : [];
    const canSelfWithdraw = !isJudge && room.phase === "DAY" && room.night === 1 && mySeat && sheriffCandidates.includes(mySeat.seat) && !sheriffWithdrawn.includes(mySeat.seat);
    const judgeNextStep = getJudgeNextStep(room);
    const mainActions = [
      room.phase === "WAITING" ? `<button class="button primary" data-action="deal" ${canDeal ? "" : "disabled"}>发牌</button>` : "",
      room.phase === "DEALT" && canControl ? '<button class="button primary" data-action="start-night">开始第一夜</button>' : "",
      room.phase === "DAY" && room.night === 1 && isJudge ? '<button class="button" data-action="view" data-view="sheriff">记录上警</button>' : "",
      room.phase === "DAY" && room.night === 1 && isJudge && sheriffCandidates.length ? '<button class="button" data-action="view" data-view="withdraw">记录退水</button>' : "",
      canSelfWithdraw ? '<button class="button" data-action="self-withdraw">我要退水</button>' : "",
      room.phase === "DAY" && room.night === 1 && isJudge && sheriffActive.length ? '<button class="button" data-action="view" data-view="sheriffVote">记录警徽投票</button>' : "",
      !gameOver && isJudge && sheriffBadge.holderSeat ? '<button class="button" data-action="view" data-view="badge">处理警徽</button>' : "",
      canRecordDaybreakDeaths ? '<button class="button" data-action="view" data-view="death">记录天亮死亡</button>' : "",
      canRecordDaybreakDeaths && suggestedDeaths.length ? '<button class="button" data-action="use-suggested-deaths">带入建议死亡</button>' : "",
      room.mode === "SYSTEM" && isController && room.systemDaybreakReady ? '<button class="button primary" data-action="system-publish-daybreak">公布昨夜死讯</button>' : "",
      ...pendingDelayedDeaths.map((item) => `<button class="button danger" data-action="confirm-delayed-death" data-seat="${item.seat}">确认 ${item.seat}号发言结束死亡</button>`),
      ...pendingDeathSkills.map((item) => `<div class="death-skill-action"><div class="notice">${item.seat}号可以发动死亡技能</div><select class="input" id="deathSkillTarget-${item.seat}"><option value="0">选择开枪目标</option>${room.seats.filter((seat) => (room.aliveSeats || []).includes(seat.seat) && seat.seat !== item.seat).map((seat) => `<option value="${seat.seat}">${seat.seat}号</option>`).join("")}</select><button class="button danger" data-action="death-skill-submit" data-seat="${item.seat}">确认开枪</button><button class="button" data-action="death-skill-skip" data-seat="${item.seat}">不开枪</button></div>`),
      canRunDayActions && pendingExileResult ? '<button class="button" data-action="view" data-view="orderPrince">处理投票结果</button>' : "",
      canRunDayActions && !pendingExileResult ? `<button class="button" data-action="view" data-view="dayVote">${room.orderPrinceRevotePending ? "记录回溯重投" : "记录放逐投票"}</button>` : "",
      canRunDayActions && !pendingExileResult ? '<button class="button primary" data-action="view" data-view="exile">手动记录放逐</button>' : "",
      room.mode === "SYSTEM" && isController && room.phase === "DAY" && !room.systemDaybreakReady ? '<button class="button" data-action="view" data-view="exile">记录白天出局</button>' : "",
      canRunDayActions && !pendingExileResult && !room.orderPrinceRevotePending && !room.pendingNightResolution && !pendingDelayedDeaths.length && !pendingDeathSkills.length ? '<button class="button primary" data-action="start-night">进入下一夜</button>' : "",
      room.mode === "SYSTEM" && isController && room.phase === "DAY" && room.systemDayOutcomeRecorded && !room.systemDaybreakReady && !(room.systemPendingTasks?.delayedDeaths || room.systemPendingTasks?.deathSkills) ? '<button class="button primary" data-action="start-night">进入下一夜</button>' : "",
      room.phase === "NIGHT" && (canControl || room.systemNight?.canAct) ? `<button class="button ${room.systemNight?.canAct ? "primary" : ""}" data-action="view" data-view="night">${room.systemNight?.canAct ? "轮到我行动" : "进入夜间播报"}</button>` : "",
      room.phase === "WAITING" && canControl ? '<button class="button" data-action="fill-test-seats">补齐测试座位</button>' : ""
    ];
    const infoActions = [
      room.phase !== "WAITING" && !canControl ? '<button class="button primary" data-action="view" data-view="identity">查看我的身份</button>' : "",
      (room.phase === "DEALT" || room.phase === "DAY" || room.phase === "NIGHT" || gameOver) && isJudge ? '<button class="button" data-action="view" data-view="judge">法官总览</button>' : "",
      (room.phase === "DEALT" || room.phase === "DAY" || room.phase === "NIGHT" || gameOver) && isJudge ? '<button class="button" data-action="view" data-view="review">复盘</button>' : "",
      gameOver && room.mode === "SYSTEM" && isController ? '<button class="button" data-action="view" data-view="review">复盘</button>' : "",
      '<button class="button" data-action="view" data-view="randomizer">随机发言顺序</button>',
      IS_REMOTE ? '<button class="button" data-action="refresh-room">刷新房间</button>' : ""
    ];
    const dangerActions = [
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
      <section class="panel">
        <div class="row">
          <div><div class="label">${canControl && IS_REMOTE ? "当前身份" : "当前座位"}</div><div class="value">${canControl && IS_REMOTE ? room.mode === "SYSTEM" ? "公共控制设备" : "法官席" : mySeat ? `${mySeat.seat}号` : "未选择"}</div></div>
          <div><div class="label">人数</div><div class="value">${occupiedCount} / ${board.playerCount}</div></div>
        </div>
        <div class="notice">${canControl ? `当前阶段：${getPhaseName(room.phase)}${room.night ? ` · 第 ${room.night} 天` : ""}` : `我的状态：${getPlayerStatusText({ room, mySeat, sheriffCandidates, sheriffWithdrawn })}`}</div>
        ${room.boardId === "dawn_voyage" && room.phase === "DAY" && (isJudge ? room.captainAliveAtDawn && room.windDirection : room.announcedWindDirection) ? (() => {
          const windName = { calm: "无风", tailwind: "顺风", headwind: "逆风" };
          const announcedWind = isJudge ? room.windDirection : room.announcedWindDirection;
          const captainAlive = (room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
          const captainDiedThisNight = room.captainAliveAtDawn && !captainAlive;
          const label = "昨夜" + windName[announcedWind] + (isJudge && captainDiedThisNight ? "（法官宣布）" : "");
          return label ? '<div class="notice" style="color:var(--accent);font-weight:600;">' + label + '</div>' : "";
        })() : ""}
        <div class="notice">${canControl ? `下一步：${judgeNextStep.title}。${judgeNextStep.detail}` : getPlayerPhaseText(room, mySeat)}</div>
      </section>
      <section class="panel">
        <div class="label">上警玩家</div>
        <div class="body-text">${sheriffCandidates.length ? sheriffCandidates.map((seat) => `${seat}号`).join("、") : "暂未记录"}</div>
        <div class="notice">已退水：${sheriffWithdrawn.length ? sheriffWithdrawn.map((seat) => `${seat}号`).join("、") : "无"}</div>
        <div class="notice">仍在警上：${sheriffActive.length ? sheriffActive.map((seat) => `${seat}号`).join("、") : "无"}</div>
        <div class="notice">警徽结果：${sheriffVote ? sheriffVote.electedSeat ? `${sheriffVote.electedSeat}号当选` : sheriffVote.badgeLost ? "警徽流失" : sheriffVote.pkSeats && sheriffVote.pkSeats.length ? `${formatSeatList(sheriffVote.pkSeats)} 平票 PK` : "未产生警长" : sheriffElectionDone ? "警徽流失" : "暂未投票"}</div>
        <div class="notice">当前警长：${sheriffBadge.holderSeat ? `${sheriffBadge.holderSeat}号` : sheriffBadge.lost ? "警徽流失" : "暂无"}</div>
      </section>
      <section class="panel">
        <div class="label">公开死亡</div>
        <div class="body-text">${latestDeaths ? `第 ${latestDeaths.day} 天：${formatSeatList(latestDeaths.seats)}` : "暂未记录"}</div>
        ${room.phase === "DAY" && room.night === 1 && !sheriffElectionDone ? '<div class="notice">第一天死亡结果应在警长竞选结束后公布。</div>' : ""}
        ${suggestedDeaths.length ? `<div class="notice">建议天亮死亡：${suggestedDeaths.map((item) => `${item.seat}号（${item.reasons.join("、")}）`).join("、")}</div>` : ""}
      </section>
      <section class="panel">
        <div class="label">白天放逐</div>
        <div class="body-text">${latestExile ? `第 ${latestExile.day} 天：${latestExile.noExile ? "无人出局" : `${latestExile.seat}号出局`}` : "暂未记录"}</div>
        <div class="notice">投票状态：${dayVote ? dayVote.exiledSeat ? `${dayVote.exiledSeat}号出局` : dayVote.noExile ? "无人出局" : dayVote.pkSeats && dayVote.pkSeats.length ? `${formatSeatList(dayVote.pkSeats)} 平票 PK` : "未产生结果" : "暂未投票"}</div>
        ${publicReveals.length ? `<div class="notice">公开身份：${publicReveals.map((item) => `${item.seat}号白痴`).join("、")}</div>` : ""}
      </section>
      ${gameOver ? '<section class="panel"><div class="value">游戏已结束</div><div class="notice">可以进入复盘查看身份和操作记录。</div></section>' : ""}
      <section class="seat-grid">
        ${room.seats.map((seat) => {
          const className = seat.userId === state.currentUserId ? "mine" : seat.occupied ? "taken" : "";
          return `<button class="seat ${className}" data-action="choose-seat" data-seat="${seat.seat}" ${canControl && IS_REMOTE ? "disabled" : ""}>${seat.seat}号</button>`;
        }).join("")}
      </section>
      ${renderActionPanel("当前操作", mainActions)}
      ${renderActionPanel("查看信息", infoActions)}
      ${renderActionPanel("系统操作", dangerActions, "danger-zone")}
      <div class="notice">${IS_REMOTE ? "联机版会使用当前网址的后端同步房间。localhost 是本机服务，Cloudflare Pages 是线上服务。" : "静态版数据只保存在当前浏览器。真正跨手机加入房间需要后端同步。"}</div>
    `;
    if (room.mode === "SYSTEM" && isController && room.latestPublicAnnouncement && room.latestPublicAnnouncement.id !== state.heardAnnouncementIds[room.id]) {
      state.heardAnnouncementIds[room.id] = room.latestPublicAnnouncement.id;
      saveState();
      setTimeout(() => speakSystemAnnouncement(room.latestPublicAnnouncement.text), 100);
    }
  }

  function renderIdentity() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const mySeat = room.seats.find((seat) => seat.userId === state.currentUserId);
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
      const announcementText = systemNight.complete
        ? "所有夜间身份均已行动，请等待天亮。"
        : getJudgeScript({ id: systemNight.stepId, label: systemNight.announcement });
      const announcementKey = `${room.id}-${room.night}-${systemNight.stepIndex}-${systemNight.complete}`;
      app.innerHTML = `
        ${pageHeader(`第 ${room.night || 1} 夜`, systemNight.complete ? "夜间行动已完成" : "公共语音播报中")}
        <section class="panel">
          <div class="label">公共设备</div>
          <div class="value">${systemNight.complete ? "等待进入天亮" : "请保持全员闭眼"}</div>
          <div class="progress-bar"><div class="progress-fill" style="width:${systemNight.stepCount ? Math.round((systemNight.stepIndex / systemNight.stepCount) * 100) : 100}%"></div></div>
          <div class="notice">进度 ${Math.min(systemNight.stepIndex + (systemNight.complete ? 0 : 1), systemNight.stepCount)} / ${systemNight.stepCount}</div>
        </section>
        ${systemNight.complete ? '<button class="button primary" data-action="night-finish">结算并天亮</button>' : '<button class="button" data-action="system-speak" data-text="' + escapeHtml(announcementText) + '">重播当前台词</button>'}
        ${systemNight.stepIndex > 0 ? '<button class="button" data-action="night-undo">撤回上一步</button>' : ""}
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      if (announcementKey !== lastSystemAnnouncementKey) {
        lastSystemAnnouncementKey = announcementKey;
        setTimeout(() => speakSystemAnnouncement(announcementText), 100);
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
    const progress = steps.length ? Math.round((index / steps.length) * 100) : 0;
    const treasure = room.assignments.find((item) => item.roleId === "treasure_master");
    const treasureCards = treasure && treasure.abilityState && treasure.abilityState.treasureCards
      ? treasure.abilityState.treasureCards.map((roleId) => getRole(roleId))
      : [];
    const activeTreasureRoleId = currentTreasureCard(room);
    const activeTreasureRole = activeTreasureRoleId ? getRole(activeTreasureRoleId) : null;
    const treasurePoisonUsed = systemNight?.privateContext?.treasurePoisonUsed ?? (room.nightActions || []).some((action) => action.stepId === "treasure_skill" && action.cardRoleId === "poisoner" && !action.skipped);
    const treasureWolfEligible = systemNight?.privateContext?.treasureWolfEligible ?? !(room.assignments || []).some((assignment) => assignment.alive !== false && ["wolf", "wolf_king"].includes(assignment.roleId));
    const treasureSkillCanTarget = !activeTreasureRoleId || ["spirit_medium", "dreamer"].includes(activeTreasureRoleId) || (activeTreasureRoleId === "poisoner" && !treasurePoisonUsed) || (activeTreasureRoleId === "wolf" && treasureWolfEligible);
    const treasureSkillRequired = ["spirit_medium", "dreamer"].includes(activeTreasureRoleId);
    const currentNightActions = (room.nightActions || []).filter((action) => action.night === room.night);
    const suggestedDeaths = isJudge ? calculateSuggestedDeaths(room, room.night) : [];
    const witchAntidoteTarget = step && ["witch_action", "witch_antidote"].includes(step.id) ? getWitchAntidoteTarget(room) : 0;
    const nightSubmitLabel = step && step.id === "witch_antidote" ? "救" : step && step.id === "witch_poison" ? "使用毒药" : "确认记录";
    const nightSkipLabel = step && step.id === "witch_antidote" ? "不救" : step && step.id === "witch_poison" ? "不使用毒药" : "空过";

    if (!step) {
      app.innerHTML = `
        ${pageHeader(`第 ${room.night || 1} 夜`, "夜间行动已记录完成")}
        <section class="panel">
          <div class="value">可以进入天亮阶段</div>
          <div class="notice">${suggestedDeaths.length ? `建议天亮死亡：${suggestedDeaths.map((item) => `${item.seat}号（${item.reasons.join("、")}）`).join("、")}` : "建议天亮死亡：无"}</div>
          <div class="notice">建议结果不会自动公布，请法官天亮后确认。</div>
        </section>
        <button class="button primary" data-action="night-finish">天亮</button>
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }

    app.innerHTML = `
      ${pageHeader(`第 ${room.night || 1} 夜`, `${index + 1} / ${steps.length} · ${step.label}`)}
      <section class="panel">
        <div class="label">进度</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="night-step-list">
          ${steps.map((item, itemIndex) => `<div class="night-step ${itemIndex === index ? "active" : itemIndex < index ? "done" : ""}"><span>${itemIndex + 1}. ${item.label}</span><span>${itemIndex < index ? "已记录" : itemIndex === index ? "当前" : ""}</span></div>`).join("")}
        </div>
      </section>

      <section class="panel script-panel">
        <div class="label">法官台词</div>
        <div class="body-text">${getJudgeScript(step, room)}</div>
      </section>

      ${step.id === "witch_action" ? `
        ${step.antidoteAvailable ? `
          <section class="panel">
            <div class="label">解药</div>
            <div class="value">今晚被击杀：${witchAntidoteTarget ? `${witchAntidoteTarget}号` : "无人"}</div>
            <div class="segmented witch-choice-row">
              <button class="segment" data-action="witch-antidote-choice" data-use="true" ${witchAntidoteTarget ? "" : "disabled"}>救</button>
              <button class="segment" data-action="witch-antidote-choice" data-use="false">不救</button>
            </div>
          </section>
        ` : ""}
        ${step.poisonAvailable ? `
          <section class="panel">
            <div class="label">毒药号码</div>
            <section class="seat-grid">
              ${room.seats.map((seat) => `<button class="seat" data-action="witch-poison-seat" data-seat="${seat.seat}">${seat.seat}号</button>`).join("")}
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
          ${room && room.boardId === "treasure_master" ? `<div class="notice">狼人同伴：${treasureWolfEligible ? "已全部出局，选择狼人牌时可发动技能刀" : "仍有存活，狼人牌不能发动技能刀"}</div>` : ""}
          <div class="card-options">
            ${treasureCards.map((card) => `<button class="card-option" data-action="night-card" data-role="${card.id}">${card.name}</button>`).join("")}
          </div>
        </section>
      ` : `
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
          ${step.id === "witch_action" ? `
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
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) {
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
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) return setView("room");
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
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) return setView("room");
    const candidates = room.sheriffCandidates || [];
    const withdrawn = room.sheriffWithdrawn || [];
    const activeCandidates = candidates.filter((seat) => !withdrawn.includes(seat));
    const previous = room.sheriffVoteRecord;
    const secondRound = previous && previous.pkSeats && previous.pkSeats.length > 1 && !previous.electedSeat;
    const targets = secondRound ? previous.pkSeats : activeCandidates;
    const voters = room.seats
      .map((seat) => seat.seat)
      .filter((seat) => secondRound ? !activeCandidates.includes(seat) : !candidates.includes(seat));

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
    if (!isSheriffElectionFinished(room)) {
      app.innerHTML = `
        ${pageHeader("记录天亮死亡", "请先完成警长竞选")}
        <section class="panel"><div class="body-text">第一天死亡结果应在警下公布。请先记录上警、退水和警徽结果，再回到这里公布死亡。</div></section>
        <button class="button" data-action="view" data-view="room">返回房间</button>
      `;
      return;
    }
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
    app.innerHTML = `
      ${pageHeader("记录白天出局", "线下投票完成后，只记录最终出局结果")}
      <section class="seat-grid">
        ${room.seats.map((seat) => `<button class="seat" data-action="exile-seat" data-seat="${seat.seat}">${seat.seat}号</button>`).join("")}
      </section>
      <button class="button primary" data-action="exile-submit">确认放逐</button>
      <button class="button" data-action="exile-none">无人出局</button>
      <button class="button" data-action="view" data-view="room">返回房间</button>
    `;
  }

  function renderDayVote() {
    const room = getCurrentRoom();
    if (!room) return setView("home");
    const isJudge = !IS_REMOTE || room.isJudge;
    if (!isJudge) return setView("room");
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

  function renderOrderPrince() {
    const room = getCurrentRoom();
    if (!room || !room.pendingExileResult) return setView("room");
    const pending = room.pendingExileResult;
    const record = pending.record || pending;
    const rawSeat = Number(record.exiledSeat || 0);
    const voteCount = rawSeat && record.counts ? Number(record.counts[rawSeat] || 0) : 0;
    const tied = !rawSeat && record.topSeats && record.topSeats.length > 1;
    const resultText = tied
      ? `${formatSeatList(record.topSeats)}平票，等待玩家发动技能`
      : rawSeat
        ? `${rawSeat}号玩家${voteCount}票出局，等待玩家发动技能`
        : "本轮无人得票，等待玩家发动技能";
    app.innerHTML = `
      ${pageHeader("等待发动技能", "实际死讯尚未宣布")}
      <section class="panel script-panel">
        <div class="label">法官台词</div>
        <div class="value">${resultText}</div>
      </section>
      <section class="panel">
        <div class="body-text">定序王子可在此时发动“回溯”。若无人发动，单一出局结果再按诡术师换号结算；平票则进入正常 PK。</div>
      </section>
      ${room.orderPrinceUsed ? "" : '<button class="button primary" data-action="order-prince-activate">定序王子发动回溯</button>'}
      <button class="button" data-action="order-prince-decline">无人发动，继续结算</button>
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
    if (state.view === "orderPrince") return renderOrderPrince();
    if (state.view === "exile") return renderExileRecord();
    if (state.view === "badge") return renderBadge();
    if (state.view === "judge") return renderJudge();
    if (state.view === "review") return renderReview();
    if (state.view === "gameEnd") return renderGameEnd();
    return renderHome();
  }

  app.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const room = getCurrentRoom();

    if (action === "view") {
      await setView(target.dataset.view);
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

    if (action === "refresh-room") {
      try {
        await refreshRemoteRoom();
        render();
      } catch (error) {
        window.alert(error.message);
      }
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
        const mySeat = room.seats.find((seat) => seat.userId === state.currentUserId);
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
        if (data.room.latestPublicAnnouncement?.id) state.heardAnnouncementIds[room.id] = data.room.latestPublicAnnouncement.id;
        speakSystemAnnouncement(data.announcement || "天亮了。");
        saveState();
        render();
      } catch (error) {
        window.alert(error.message);
      }
      return;
    }

    if (action === "start-night" && room) {
      try {
        if (IS_REMOTE) {
          await remotePost("night-start");
          state.deathDraftSeats = [];
          state.deathDraftReasons = {};
          state.view = "night";
          saveState();
          render();
          return;
        }
        if (room.pendingNightResolution) throw new Error("请先确认天亮死亡名单");
        if ((room.pendingDelayedDeaths || []).some((item) => item.day === room.night)) throw new Error("请先处理蒙面人的延迟死亡");
        if ((room.pendingDeathSkills || []).some((item) => item.day === room.night)) throw new Error("请先处理死亡技能");
        room.night = (room.night || 0) + 1;
        room.phase = "NIGHT";
        room.lastWindDirection = room.windDirection || "calm";
        room.boardedSeat = 0;
        room.captainAliveAtDawn = (room.assignments || []).some((a) => a.roleId === "captain" && a.alive !== false);
        room.captainDiedLastDay = false;
        room.currentNightSteps = createNightSteps(room.boardId, room.night, room);
        room.currentNightStepIndex = 0;
        room.nightActions = room.nightActions || [];
        writeLog(room, "NIGHT_STARTED", { night: room.night });
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
      if (step.antidoteAvailable && !antidoteChoice) {
        window.alert("请选择救或不救");
        return;
      }
      const antidoteUsed = step.antidoteAvailable && antidoteChoice && antidoteChoice.dataset.use === "true";
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
      if (step.singlePotionPerNight && antidoteUsed && poisonTargetSeat) {
        window.alert("本版型中，女巫同一晚不能同时使用解药和毒药");
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
        room.nightActions = room.nightActions || [];
        room.nightActions.push(actionRecord);
        writeLog(room, "NIGHT_ACTION", actionRecord);
        room.currentNightStepIndex = (room.currentNightStepIndex || 0) + 1;
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
        refreshSwapConflict(room, room.night);
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
      if (room.night > 1 && wind === room.lastWindDirection) { window.alert("不可连续两晚选择相同风向"); return; }
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
          createdAt: Date.now()
        };
        room.nightActions = room.nightActions || [];
        room.nightActions.push(actionRecord);
        if (step.id === "captain_board" && targetSeats.length) {
          room.boardedSeat = targetSeats[0];
        }
        refreshSwapConflict(room, room.night);
        writeLog(room, "NIGHT_ACTION", actionRecord);
        room.currentNightStepIndex = (room.currentNightStepIndex || 0) + 1;
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
        room.phase = "DAY";
        room.pendingNightResolution = window.NightResolution.calculateNightResolution(room, room.night);
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
        const allowedTargets = round === 1 ? activeCandidates : pkSeats;
        const allowedVoters = room.seats
          .map((seat) => seat.seat)
          .filter((seat) => round === 1 ? !candidates.includes(seat) : !activeCandidates.includes(seat));
        const counts = {};
        allowedTargets.forEach((seat) => { counts[seat] = 0; });
        votes.forEach((vote) => {
          if (allowedVoters.includes(vote.voterSeat) && allowedTargets.includes(vote.targetSeat)) counts[vote.targetSeat] += 1;
        });
        const maxVotes = Math.max(0, ...Object.values(counts));
        const topSeats = Object.keys(counts).map(Number).filter((seat) => counts[seat] === maxVotes && maxVotes > 0);
        const electedSeat = topSeats.length === 1 ? topSeats[0] : 0;
        const badgeLost = round === 2 && !electedSeat;
        const record = {
          round,
          votes: votes.filter((vote) => allowedVoters.includes(vote.voterSeat)),
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
        queueDeathSkills(room, seats, "DAYBREAK", reasonsBySeat);
        const record = { day: room.night, phase: "DAYBREAK", seats, reasons: reasonsBySeat, createdAt: Date.now() };
        room.deathRecords = room.deathRecords || [];
        room.deathRecords.push(record);
        writeLog(room, "DAYBREAK_DEATHS_CONFIRMED", record);
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
        if (targetSeat) {
          const targetAssignment = room.assignments.find((item) => item.seat === targetSeat);
          if (!targetAssignment || targetAssignment.alive === false) throw new Error("开枪目标必须是存活玩家");
          targetAssignment.alive = false;
          trackCaptainDeath(room, targetSeat);
          room.deathRecords.push({ day: room.night, phase: "SHOT", seats: [targetSeat], reasons: { [targetSeat]: [`${seat}号死亡技能`] }, createdAt: Date.now() });
        }
        room.pendingDeathSkills = (room.pendingDeathSkills || []).filter((item) => !(item.day === room.night && item.seat === seat));
        const record = [...(room.deathSkillRecords || [])].reverse().find((item) => item.day === room.night && item.seat === seat && !item.resolved);
        if (record) Object.assign(record, { resolved: true, targetSeat, skipped: !targetSeat, resolvedAt: Date.now() });
        writeLog(room, "DEATH_SKILL_RESOLVED", { seat, targetSeat, skipped: !targetSeat });
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
          state.view = action === "order-prince-activate" ? "dayVote" : "room";
          saveState();
          render();
          return;
        }
        const pending = room.pendingExileResult;
        if (!pending) return;
        if (action === "order-prince-activate") {
          room.orderPrinceUsed = true;
          room.orderPrinceRevotePending = true;
          room.pendingExileResult = null;
          room.dayVoteRecord = null;
          writeLog(room, "ORDER_PRINCE_ACTIVATED", { day: room.night });
          state.view = "dayVote";
        } else {
          const record = pending.record || pending;
          room.pendingExileResult = null;
          room.dayVoteRecord = record;
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
        if (IS_REMOTE) {
          await remotePost("exile-record", { seat, noExile });
          state.view = "room";
          saveState();
          render();
          return;
        }
        if (!noExile) {
          const assignment = room.assignments.find((item) => item.seat === seat);
          if (assignment) {
            assignment.alive = false;
            if (assignment.roleId === "idiot") assignment.revealed = true;
          }
          trackCaptainDeath(room, seat);
          queueDeathSkills(room, [seat], "EXILE");
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
      if (selected.occupied && selected.userId !== state.currentUserId) {
        window.alert("座位已被占用");
        return;
      }
      if (IS_REMOTE) {
        try {
          await remotePost("seat", {
            seat: seatNumber,
            nickname: "我"
          });
          render();
        } catch (error) {
          window.alert(error.message);
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
    setInterval(() => {
      if (!state.currentRoomId || !AUTO_REFRESH_VIEWS.includes(state.view)) return;
      if (state.view === "night" && state.remoteRoom?.systemNight?.canAct) return;
      refreshRemoteRoom()
        .then(render)
        .catch(() => {});
    }, 2500);
  }
})();
