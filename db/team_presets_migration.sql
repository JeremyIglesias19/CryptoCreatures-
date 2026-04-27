-- ============================================
-- Team presets (equipos guardados por jugador)
-- Railway PostgreSQL - ejecutar una sola vez
-- ============================================

CREATE TABLE IF NOT EXISTS team_presets (
  id            SERIAL PRIMARY KEY,
  owner_id      INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name          VARCHAR(32) NOT NULL,
  creature_ids  JSONB NOT NULL,                 -- Array de 3 IDs de criaturas
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Un jugador no puede tener dos presets con el mismo nombre
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_presets_owner_name
  ON team_presets(owner_id, LOWER(name));

-- Búsqueda rápida de presets de un jugador
CREATE INDEX IF NOT EXISTS idx_team_presets_owner
  ON team_presets(owner_id);

-- Verificación
-- SELECT table_name FROM information_schema.tables WHERE table_name = 'team_presets';
