-- =====================================================
-- Migracion: Sistema de pagos hibrido con Stripe
-- =====================================================
-- Ejecutar una vez para anadir soporte de compra de huevos con EUR via Stripe.
-- La criatura se genera en el webhook (tras confirmacion de pago) y se vincula
-- al stripe_session_id para que el cliente pueda reclamarla por polling.

CREATE TABLE IF NOT EXISTS egg_purchases (
  id                        SERIAL PRIMARY KEY,
  player_id                 INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stripe_session_id         VARCHAR(255) UNIQUE NOT NULL,
  stripe_payment_intent_id  VARCHAR(255),
  amount_eur                DECIMAL(10, 2) NOT NULL DEFAULT 5.00,
  currency                  VARCHAR(8)     NOT NULL DEFAULT 'eur',
  status                    VARCHAR(20)    NOT NULL DEFAULT 'pending',
    -- pending  = checkout creado, pago aun no confirmado
    -- paid     = pago confirmado, criatura generada
    -- failed   = pago fallido o expirado
    -- claimed  = usuario ya vio la animacion de reveal
  creature_id               INTEGER REFERENCES creatures(id) ON DELETE SET NULL,
  rarity_key                VARCHAR(20),
  created_at                TIMESTAMP DEFAULT NOW(),
  paid_at                   TIMESTAMP,
  claimed_at                TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_egg_purchases_session  ON egg_purchases(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_egg_purchases_player   ON egg_purchases(player_id);
CREATE INDEX IF NOT EXISTS idx_egg_purchases_status   ON egg_purchases(status);
