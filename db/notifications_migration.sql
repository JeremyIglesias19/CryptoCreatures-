-- Lote 4: Notificaciones
-- Tabla con cap de 50 por jugador (se recorta en el insert).
-- Dos índices: uno para listar ordenado, otro parcial para contar no leídas rápido.

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  player_id   INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type        VARCHAR(32) NOT NULL,
  title       VARCHAR(120) NOT NULL,
  body        VARCHAR(280),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lista ordenada por jugador
CREATE INDEX IF NOT EXISTS idx_notifications_player_created
  ON notifications(player_id, created_at DESC);

-- Parcial: COUNT(*) WHERE read_at IS NULL es el query más caliente (badge)
CREATE INDEX IF NOT EXISTS idx_notifications_player_unread
  ON notifications(player_id) WHERE read_at IS NULL;
