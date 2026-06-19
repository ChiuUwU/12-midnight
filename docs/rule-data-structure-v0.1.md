# 十二点天黑规则数据结构草案 v0.1

本文档描述第一版小程序推荐使用的规则抽象。目标是先支持四个固定版型，同时为后续自定义版型、玩家手机夜间操作、盗宝蒙面等变化留余地。

## 1. 核心原则

程序中不要只用“身份名”判断规则。至少需要区分以下概念：

- 真实身份：玩家发到的原始身份，例如机械狼、盗宝大师、猎人。
- 当前阵营：好人、狼人、第三方、跟随阵营。
- 可见身份：玩家自己看到的身份展示。
- 技能来源：原生技能、机械狼模仿、盗宝牌、临时标记。
- 临时结算标记：例如假面的面具、摄梦、守护、中毒、负伤。
- 死亡原因：狼刀、毒杀、放逐、同守同救、摄梦连续、舞池结算、蒙面延迟死亡等。

## 2. 推荐枚举

```ts
type Camp = "GOOD" | "WOLF" | "THIRD" | "FOLLOW";

type RoleId =
  | "seer"
  | "witch"
  | "hunter"
  | "idiot"
  | "villager"
  | "wolf"
  | "wolf_king"
  | "mixed_blood"
  | "dancer"
  | "mask"
  | "spirit_medium"
  | "poisoner"
  | "dreamer"
  | "masked_man"
  | "mechanical_wolf"
  | "treasure_master"
  | "guard"
  | "magician"
  | "order_prince"
  | "trickster";

type DeathCause =
  | "WOLF_KILL"
  | "POISON"
  | "VOTE_OUT"
  | "GUARD_AND_SAVE"
  | "DREAM_REPEAT"
  | "DANCE_POOL"
  | "MASKED_DELAY"
  | "SHOT"
  | "SKILL_KILL";
```

## 3. 版型配置结构

```ts
interface BoardConfig {
  id: string;
  name: string;
  playerCount: number;
  roles: RoleEntry[];
  globalRules: GlobalRules;
  nightOrder: NightStep[];
  specialRules?: SpecialRuleConfig;
}

interface RoleEntry {
  roleId: RoleId;
  count: number;
  camp: Camp;
}

interface DeckPoolEntry extends RoleEntry {
  canBecomeTreasureCard?: boolean;
}

interface GlobalRules {
  winCondition: "KILL_SIDE";
  sheriffEnabled: boolean;
  lastWordsEnabled: boolean;
  nightDeathLastWords: boolean;
  witchCanSelfSaveFirstNight: boolean;
  witchAntidoteCount: number;
  witchPoisonCount: number;
  guardCanRepeatTarget: boolean;
  wolvesCanNoKill: boolean;
  seerCanSkipCheck: boolean;
  spiritMediumCanSkipCheck: boolean;
  tieRule: "PK_THEN_NO_OUT_ON_SECOND_TIE";
}
```

## 4. 玩家状态结构

```ts
interface PlayerState {
  seat: number;
  name?: string;
  realRole: RoleId;
  currentCamp: Camp;
  alive: boolean;
  sheriff: boolean;
  revealed: boolean;
  marks: PlayerMark[];
  abilityState: AbilityState;
}

interface PlayerMark {
  type:
    | "GUARDED"
    | "DREAMED"
    | "POISONED"
    | "INJURED"
    | "DANCE_POOL"
    | "MASK_FOR_DANCE"
    | "MAGICIAN_SWAP"
    | "TRICKSTER_SWAP"
    | "DELAYED_DEATH";
  night: number;
  sourceSeat?: number;
  value?: string;
}
```

## 5. 技能状态结构

```ts
interface AbilityState {
  witchAntidoteUsed?: boolean;
  witchPoisonUsed?: boolean;
  poisonerPoisonUsed?: boolean;
  lastGuardTarget?: number;
  lastDreamTarget?: number;
  lastMaskCheckTarget?: number;
  lastMaskGiveTarget?: number;
  hasShot?: boolean;
  mechanicalWolfMimicRole?: RoleId;
  mechanicalWolfMimicSeat?: number;
  treasureCards?: RoleId[];
  activeTreasureCard?: RoleId;
  lastTreasureCard?: RoleId;
  mixedBloodModelSeat?: number;
  usedSwapSeats?: number[];
  lastSwapWasEmpty?: boolean;
  orderPrinceUsed?: boolean;
}
```

## 6. 夜间行动结构

```ts
interface NightStep {
  id: string;
  actor: RoleId | "wolf_team" | "system";
  fromNight: number;
  required: boolean;
  targetCount: number;
  allowSkip: boolean;
  visibleInfo: VisibleInfoRule;
}

interface NightAction {
  night: number;
  stepId: string;
  actorSeat?: number;
  actorRole?: RoleId;
  targetSeats: number[];
  skipped: boolean;
  payload?: Record<string, unknown>;
}

interface VisibleInfoRule {
  showAlivePlayers: boolean;
  showDeadPlayers: boolean;
  showWolfTeammates?: boolean;
  showLastTarget?: boolean;
  showKillTarget?: boolean;
}
```

## 7. 四个固定版型初始配置

### 7.1 预女猎白混

```ts
const boardPreWitchHunterIdiotMixed: BoardConfig = {
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
    { roleId: "wolf", count: 4, camp: "WOLF" },
  ],
};
```

### 7.2 假面舞会

```ts
const boardMasquerade: BoardConfig = {
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
    { roleId: "wolf", count: 3, camp: "WOLF" },
  ],
};
```

### 7.3 盗宝大师

```ts
const boardTreasureMaster = {
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
    { roleId: "wolf", count: 3, camp: "WOLF" },
  ],
  specialRules: {
    treasureMaster: {
      fixedCards: ["wolf", "villager"],
      godCardPoolExcludes: ["masked_man"],
      allowMaskedManInTreasureCards: false,
      firstNightWolfKillDisabled: true,
    },
  },
};
```

盗宝大师版型发牌不能直接把 `deckPool` 全部洗入 12 张玩家牌。推荐流程是：

1. 固定生成盗宝大师玩家牌。
2. 从 `deckPool` 中移除盗宝牌：狼人、平民、1 张神职牌。
3. 当前神职牌池排除蒙面人。
4. 将盗宝大师玩家牌与 `deckPool` 剩余 11 张牌组成 12 张场上玩家牌。
5. 随机分配给 12 个座位。
6. 将被移除的 3 张牌写入盗宝大师的 `treasureCards`。

### 7.4 机械狼通灵师

```ts
const boardMechanicalWolfSpiritMedium: BoardConfig = {
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
    { roleId: "wolf", count: 3, camp: "WOLF" },
  ],
};
```

### 7.5 诡术之境

```ts
const boardRealmOfTrickery: BoardConfig = {
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
    { roleId: "wolf", count: 3, camp: "WOLF" },
  ],
};
```

推荐为换号与回溯增加独立状态：

```ts
interface SeatSwapRecord {
  night: number;
  source: "MAGICIAN" | "TRICKSTER";
  seats: [number, number] | [];
  skipped: boolean;
  invalidByConflict: boolean;
}

interface PendingExileResult {
  day: number;
  round: number;
  votes: Array<{ voterSeat: number; targetSeat: number }>;
  counts: Record<number, number>;
  rawTopSeats: number[];
  rawExiledSeat: number;
  rawVoteCount: number;
  waitingForOrderPrince: boolean;
  orderPrinceActivated: boolean;
  actualExiledSeat: number;
}
```

换号结算要求：

1. 魔术师与诡术师提交号码后立即写入各自 `usedSwapSeats`；即使同对冲突无效，也消耗号码。
2. 同对冲突判断应先将号码对排序，因此 `[2, 5]` 与 `[5, 2]` 相同。
3. 魔术师映射用于当夜狼刀、毒药、查验的实际目标。
4. 女巫看到并记录狼人原始刀口，解药生效时解救映射后的实际承伤玩家。
5. 诡术师映射只用于当日最终放逐结果，不修改票数和原始票型。
6. 定序王子决定是否回溯前，禁止把 `rawExiledSeat` 写入死亡或放逐记录。
7. 回溯后清空第一次投票的待结算结果，由所有存活玩家重新自由投票；最终结果再应用诡术师映射。

## 8. 发牌逻辑建议

### 8.1 普通版型

1. 根据版型生成 12 张玩家身份牌。
2. 随机打乱。
3. 按座位号分配。
4. 写入每名玩家的真实身份和初始阵营。

### 8.2 盗宝大师版型

1. 先固定生成 1 张盗宝大师玩家牌。
2. 从基础身份池中选出 3 张盗宝牌：狼人、平民、1 张神职牌。
3. 当前神职牌池排除蒙面人。
4. 从基础身份池中移除这 3 张盗宝牌。
5. 将盗宝大师玩家牌与基础身份池剩余 11 张牌组成 12 张场上玩家牌。
6. 随机分配场上身份。
7. 根据盗宝牌堆判断盗宝大师阵营；当前必定为狼人阵营。
8. 保存盗宝牌堆，但只向盗宝大师本人或法官展示。

### 8.3 均衡随机发牌

均衡随机不是生成一套牌后检查，而是：

1. 每局重新生成一条隐藏实力曲线，以 6、7 号为中心，向两侧随机阶梯下降。
2. 生成本局狼人强弱目标和一套均匀随机的阵营参考布局。
3. 独立生成 2000 套满足版型硬规则的候选牌局。
4. 为每套候选计算 `totalPenalty`，罚分越低代表越符合当前均衡目标。
5. 使用温度加权随机抽取，不固定选择唯一最低罚分候选：`P(i) ∝ exp(-(penalty[i] - minPenalty) / temperature)`。
6. 保存最近 10 局历史，供之后的身份、阵营、关键角色座位和特殊牌堆评分使用。

通用罚分包括：

- 同座位连续相同身份：`+12`。
- 同座位连续相同阵营：`+1`。
- 同座位连续三局相同阵营：额外 `+3`。
- 随机阵营参考布局不一致：每个座位 `+15`。
- 最近 10 局所有座位对分别追踪同好、同狼、对立三种关系；偏离版型理论分布时增加平方漂移罚分。
- 关键身份最近 6 局在同一座位每出现一次：`+2`。

狼人强弱目标每局独立生成：

- 25% 弱狼局：目标为 `-10` 至 `-3`。
- 40% 均势局：目标为 `-3` 至 `+3`。
- 30% 略强狼局：目标为 `+3` 至 `+10`。
- 5% 强狼局：目标为 `+10` 至 `+16`。

实力罚分：

```text
1.8 × |(狼人平均实力 - 神职平均实力) - 本局目标优势|
+ 0.6 × |(狼人平均实力 - 好人平均实力) - 0.6 × 本局目标优势|
```

关键角色适配罚分仅在对应版型启用：

- 假面舞会：舞者与假面。
- 诡术之境：魔术师与诡术师。
- 两者实力差：`0.6 × |A - B|`。
- 60% 标准局按中位数计算水平不足罚分，系数 `0.45`。
- 25% 放宽局按下四分位数计算水平不足罚分，系数 `0.15`。
- 15% 自由局不计算水平不足罚分，但仍计算两者实力差。

版型专属随机罚分：

- 盗宝大师神牌与上一局相同：`+10`。
- 最近四局盗宝神牌每出现一次：`+3`。
- 最近四局已经出现三次：额外 `+8`。
- 其他当前版型没有额外随机牌堆，此项为 `0`。

历史按法官设备的隐藏 `balanceProfileId` 保存。Cloudflare 只保留最近 10 局；玩家端不得获得历史、实力曲线、目标优势或候选罚分。

### 8.4 新增版型的平衡设计流程

新增版型前必须主动向产品负责人确认以下内容，不得直接沿用默认值：

1. 哪些身份属于好人、神职、狼人或暂不参与实力比较的阵营。
2. 是否存在需要水平接近的关键对位身份。
3. 是否有应优先分配给中高水平玩家的高操作身份。
4. 是否存在盗宝牌、备用身份、随机情侣等额外随机结果，以及如何限制连续重复。
5. 该版型狼人是否需要弱狼、均势、略强狼、强狼的特殊比例。
6. 哪些规则属于不可违反的硬规则，哪些只能作为软罚分。

## 9. 结算引擎建议

死亡结算不要直接在每个技能里立即杀人。建议先收集夜间行动，再统一结算：

1. 收集守卫、摄梦、狼人、女巫、毒师、舞者、假面等行动。
2. 生成临时标记。
3. 根据免疫和保护规则抵消狼刀、毒杀。
4. 处理同守同救。
5. 处理女巫反伤。
6. 处理摄梦连续。
7. 处理舞池结算。
8. 处理蒙面人延迟死亡。
9. 生成天亮死亡列表和死亡原因。
10. 根据死亡原因判断是否可发动死亡技能。

## 10. 优先开发范围

- 固定版型发牌。
- 玩家私密查看身份。
- 法官查看全部身份。
- 夜间流程手动记录。
- 基础投票和 PK。
- 死亡原因记录。
- 复盘展示。

第二阶段再做自动完整结算和玩家个人手机夜间私密操作。
