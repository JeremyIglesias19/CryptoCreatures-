-- ============================================
-- CryptoCreatures - Esquema de Base de Datos
-- PostgreSQL (Railway)
-- ============================================

-- Jugadores (vinculados a Privy auth)
CREATE TABLE IF NOT EXISTS players (
  id            SERIAL PRIMARY KEY,
  privy_id      VARCHAR(255) UNIQUE NOT NULL,   -- ID de Privy (Google login)
  wallet_address VARCHAR(64),                    -- Wallet Solana generada por Privy
  username      VARCHAR(32) UNIQUE,
  avatar_url    TEXT,
  email         VARCHAR(255),
  energy        INT DEFAULT 10,                  -- Energía diaria para combates
  energy_reset  TIMESTAMP DEFAULT NOW(),
  gems          INT DEFAULT 0,                   -- Moneda in-game
  elo           INT DEFAULT 1000,                -- Rating para matchmaking
  wins          INT DEFAULT 0,
  losses        INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  last_login    TIMESTAMP DEFAULT NOW()
);

-- Criaturas (cada una es potencialmente un NFT)
CREATE TABLE IF NOT EXISTS creatures (
  id            SERIAL PRIMARY KEY,
  owner_id      INT REFERENCES players(id) ON DELETE CASCADE,
  name          VARCHAR(64) NOT NULL,
  rarity        VARCHAR(20) NOT NULL,            -- Comun, Poco Comun, Rara, Epica, Legendaria, Unica
  types         TEXT[] NOT NULL,                  -- Array: ['Fuego'], ['Agua','Hielo'], etc
  hp            INT NOT NULL,
  atk           INT NOT NULL,
  def           INT NOT NULL,
  spd           INT NOT NULL,
  ability       VARCHAR(64) NOT NULL,
  attacks       JSONB NOT NULL,                   -- Array de {name, type, power, accuracy, effect, effectChance}
  img_seed      VARCHAR(32),                      -- Seed para generar la imagen consistentemente
  mint_address  VARCHAR(64),                      -- Dirección del NFT en Solana (null si no minteado)
  wins          INT DEFAULT 0,
  losses        INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Batallas (historial completo)
CREATE TABLE IF NOT EXISTS battles (
  id            SERIAL PRIMARY KEY,
  player1_id    INT REFERENCES players(id),
  player2_id    INT REFERENCES players(id),
  winner_id     INT REFERENCES players(id),
  status        VARCHAR(20) DEFAULT 'active',     -- active, finished, abandoned
  battle_log    JSONB,                             -- Log completo de la batalla
  player1_team  JSONB,                             -- Equipo del jugador 1 (snapshot)
  player2_team  JSONB,                             -- Equipo del jugador 2 (snapshot)
  elo_change    INT DEFAULT 0,                     -- Cambio de ELO para el ganador
  turns         INT DEFAULT 0,
  started_at    TIMESTAMP DEFAULT NOW(),
  finished_at   TIMESTAMP
);

-- Cola de matchmaking
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  id            SERIAL PRIMARY KEY,
  player_id     INT REFERENCES players(id) ON DELETE CASCADE,
  elo           INT NOT NULL,
  team          JSONB NOT NULL,                    -- IDs de las criaturas seleccionadas
  socket_id     VARCHAR(64),                       -- Socket.IO connection ID
  joined_at     TIMESTAMP DEFAULT NOW()
);

-- Ediciones especiales de huevos
CREATE TABLE IF NOT EXISTS egg_editions (
  id            VARCHAR(32) PRIMARY KEY,
  name          VARCHAR(64) NOT NULL,
  description   TEXT,
  price_gems    INT DEFAULT 0,
  available     BOOLEAN DEFAULT true,
  creature_pool JSONB,                             -- Pool especial de criaturas
  starts_at     TIMESTAMP,
  ends_at       TIMESTAMP
);

-- Inventario de huevos sin abrir
CREATE TABLE IF NOT EXISTS eggs (
  id            SERIAL PRIMARY KEY,
  owner_id      INT REFERENCES players(id) ON DELETE CASCADE,
  edition_id    VARCHAR(32) REFERENCES egg_editions(id),
  rarity_boost  FLOAT DEFAULT 1.0,
  obtained_at   TIMESTAMP DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX idx_creatures_owner ON creatures(owner_id);
CREATE INDEX idx_battles_players ON battles(player1_id, player2_id);
CREATE INDEX idx_battles_status ON battles(status);
CREATE INDEX idx_matchmaking_elo ON matchmaking_queue(elo);
CREATE INDEX idx_players_elo ON players(elo);
