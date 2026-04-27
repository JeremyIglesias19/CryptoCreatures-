-- ============================================
-- Migration: Daily streak system (Lote 1)
-- Añade columnas para gamificar la retención diaria
-- ============================================

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS streak_days INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_date DATE DEFAULT CURRENT_DATE;

-- Inicializar para jugadores existentes: streak = 1, last_active = hoy
UPDATE players
SET streak_days = 1, last_active_date = CURRENT_DATE
WHERE streak_days IS NULL OR last_active_date IS NULL;

-- Index para posibles queries futuras (ranking de streaks, etc)
CREATE INDEX IF NOT EXISTS idx_players_streak ON players(streak_days DESC);
