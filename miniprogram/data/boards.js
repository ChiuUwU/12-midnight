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
    summary: "",
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
    summary: "",
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
    summary: "",
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
    summary: "",
    globalRules: DEFAULT_RULES
  }
];

function getBoard(boardId) {
  return BOARDS.find((board) => board.id === boardId);
}

module.exports = {
  BOARDS,
  DEFAULT_RULES,
  getBoard
};
