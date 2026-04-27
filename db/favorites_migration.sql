-- ============================================
-- Añadir sistema de favoritos a las criaturas
-- Railway PostgreSQL - ejecutar una sola vez
-- ============================================

ALTER TABLE creatures
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- Índice parcial para acelerar "favoritos primero" (solo indexa los true)
CREATE INDEX IF NOT EXISTS idx_creatures_favorites
  ON creatures(owner_id)
  WHERE is_favorite = true;

-- Verificación (debería mostrar la columna)
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'creatures' AND column_name = 'is_favorite';
