-- ============================================
-- CryptoCreatures - preferred_role en criaturas
-- Lote 6 Fase 4: cada criatura tiene un rol preferido aleatorio asignado al nacer.
-- Si role asignado en batalla === preferred_role → +10% damage. Si no → -5%.
-- ============================================

-- Columna nueva. NULL para criaturas existentes (quedan en "hybrid" implícito).
ALTER TABLE creatures ADD COLUMN IF NOT EXISTS preferred_role VARCHAR(20);

-- Asignar rol preferido aleatorio a criaturas EXISTENTES que no lo tengan.
-- 25% probabilidad por rol. Esto da a cada criatura ya generada una identidad única
-- retroactivamente (sin tener que re-generar el huevo).
UPDATE creatures
SET preferred_role = (ARRAY['aggressive', 'kiter', 'flanker', 'hybrid'])[1 + floor(random() * 4)::int]
WHERE preferred_role IS NULL;

-- Index para queries que filtren por rol (ej: marketplace "kiter rare")
CREATE INDEX IF NOT EXISTS idx_creatures_preferred_role ON creatures(preferred_role);
