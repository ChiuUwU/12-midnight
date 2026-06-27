CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at);

CREATE TABLE IF NOT EXISTS deal_histories (
  profile_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_histories_updated_at ON deal_histories(updated_at);

CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  result TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_results_room_id ON game_results(room_id);
CREATE INDEX IF NOT EXISTS idx_game_results_created_at ON game_results(created_at);
