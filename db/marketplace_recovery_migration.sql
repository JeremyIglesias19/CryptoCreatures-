-- ============================================
-- CryptoCreatures - Marketplace Recovery Migration
-- Tarea #5: Auto-reembolsos en races + endpoint admin para casos fallidos
-- ============================================

-- 1) Columna nueva para enlazar reembolsos con la tx original del comprador.
--    Para tx_type='refund', original_tx = la tx_signature del intento de compra
--    que estamos reembolsando. Permite buscar reembolsos por intento.
ALTER TABLE marketplace_transactions
  ADD COLUMN IF NOT EXISTS original_tx VARCHAR(128);

-- 2) Cada Solana tx_signature aparece como mucho una vez en la tabla.
--    Es la regla por la red: cada tx tiene una firma única. Esto bloquea
--    duplicados por reintento de cliente o doble procesamiento.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_market_tx_signature
  ON marketplace_transactions(tx_signature)
  WHERE tx_signature IS NOT NULL;

-- 3) Como mucho UN reembolso por (listing, intento original).
--    Aunque el comprador retry su request 10 veces, solo se inserta 1 fila refund.
--    Esta es la idempotencia real para evitar doble reembolso.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_refund_per_attempt
  ON marketplace_transactions(listing_id, original_tx)
  WHERE tx_type = 'refund' AND original_tx IS NOT NULL;

-- 4) Índice helper para el endpoint admin: lista reembolsos pendientes de envío
--    (los que tienen fila pero tx_signature aún NULL = sendSOLFromEscrow falló).
CREATE INDEX IF NOT EXISTS idx_market_pending_refunds
  ON marketplace_transactions(created_at)
  WHERE tx_type = 'refund' AND tx_signature IS NULL;

-- 5) Índice helper para listings con seller_payout pendiente
--    (sold pero sin seller_tx = sendSOLFromEscrow al vendedor falló).
CREATE INDEX IF NOT EXISTS idx_market_pending_payouts
  ON marketplace_listings(sold_at)
  WHERE status = 'sold' AND seller_tx IS NULL AND price_sol > 0;
