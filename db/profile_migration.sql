-- ============================================
-- CryptoCreatures - Profile Customization
-- Lote 5I: avatar = una criatura propia + username editable con cooldown
-- ============================================

-- Avatar = criatura propia. ON DELETE SET NULL: si la criatura se borra
-- → avatar revierte a default. Si solo cambia de owner (venta), validamos
-- en read-time que avatar.owner_id == player.id.
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_creature_id INT
  REFERENCES creatures(id) ON DELETE SET NULL;

-- Cooldown del cambio de username (30 días entre cambios).
-- NULL = nunca lo ha cambiado → puede cambiar inmediatamente.
ALTER TABLE players ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMP;

-- Index case-insensitive para búsquedas por username (perfil público + check de disponibilidad).
CREATE INDEX IF NOT EXISTS idx_players_username_lower ON players(LOWER(username));
