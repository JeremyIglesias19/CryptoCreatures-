-- ============================================
-- CryptoCreatures - Battles FK ON DELETE SET NULL
-- Tarea #3: Permitir borrar jugadores sin que las batallas históricas bloqueen.
-- ============================================
--
-- Problema: las 3 FKs de battles (player1_id, player2_id, winner_id) referenciaban
-- players(id) sin ON DELETE clause = comportamiento por defecto RESTRICT.
-- Resultado: imposible borrar a un jugador que haya peleado alguna vez sin
-- borrar manualmente sus batallas primero. Bloquea operaciones de limpieza,
-- GDPR delete requests, banear cuentas, etc.
--
-- Solución: ON DELETE SET NULL. Si se borra un jugador, sus referencias en
-- battles se ponen a NULL pero la batalla se conserva. Los snapshots
-- player1_team / player2_team (JSONB) ya tienen los datos para mostrarla.
--
-- Hago las 3 columnas a la vez por consistencia. La auditoría mencionó solo
-- winner_id pero el problema es idéntico en player1_id y player2_id.
-- ============================================

BEGIN;

-- player1_id
ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_player1_id_fkey;
ALTER TABLE battles
  ADD CONSTRAINT battles_player1_id_fkey
  FOREIGN KEY (player1_id) REFERENCES players(id) ON DELETE SET NULL;

-- player2_id
ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_player2_id_fkey;
ALTER TABLE battles
  ADD CONSTRAINT battles_player2_id_fkey
  FOREIGN KEY (player2_id) REFERENCES players(id) ON DELETE SET NULL;

-- winner_id
ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_winner_id_fkey;
ALTER TABLE battles
  ADD CONSTRAINT battles_winner_id_fkey
  FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL;

COMMIT;
