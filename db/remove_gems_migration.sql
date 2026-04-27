-- ============================================
-- Eliminar sistema de Gems (código muerto)
-- Railway PostgreSQL - ejecutar una sola vez
-- ============================================

-- Quitar columna de Gems de la tabla de jugadores
ALTER TABLE players DROP COLUMN IF EXISTS gems;

-- Quitar precio en gems de las ediciones de huevos
ALTER TABLE egg_editions DROP COLUMN IF EXISTS price_gems;

-- Verificación (deberían devolver 0 filas)
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'players' AND column_name = 'gems';
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'egg_editions' AND column_name = 'price_gems';
