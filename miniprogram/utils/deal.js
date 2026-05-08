const { getBoard } = require("../data/boards");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flattenEntries(entries) {
  const cards = [];
  entries.forEach((entry) => {
    for (let index = 0; index < entry.count; index += 1) {
      cards.push({
        roleId: entry.roleId,
        camp: entry.camp
      });
    }
  });
  return cards;
}

function shuffle(cards) {
  const result = cards.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
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

  if (candidates.length === 0) {
    throw new Error("盗宝神职牌池为空");
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return removeOne(cards, chosen.roleId);
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

function dealBoard(boardId, seats) {
  const board = clone(getBoard(boardId));
  if (!board) {
    throw new Error("版型不存在");
  }
  if (seats.length !== board.playerCount) {
    throw new Error(`需要 ${board.playerCount} 个座位才能发牌`);
  }

  if (board.id === "treasure_master") {
    return dealTreasureMasterBoard(board, seats);
  }

  const cards = flattenEntries(board.roles);
  if (cards.length !== board.playerCount) {
    throw new Error(`版型牌数应为 ${board.playerCount}，实际为 ${cards.length}`);
  }

  return assignCards(seats, cards);
}

module.exports = {
  dealBoard,
  flattenEntries
};
