-- ============================================
-- CryptoCreatures - Marketplace Migration
-- Tablas para: venta directa, subastas, intercambios
-- Pagos con SOL via Solana devnet
-- ============================================

-- Listings del marketplace (venta directa + subastas)
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id              SERIAL PRIMARY KEY,
  seller_id       INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  creature_id     INT NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  listing_type    VARCHAR(20) NOT NULL CHECK (listing_type IN ('fixed', 'auction')),
  price_sol       DECIMAL(18,9),                    -- Precio fijo en SOL (para tipo 'fixed')
  min_bid_sol     DECIMAL(18,9),                    -- Puja mínima (para tipo 'auction')
  current_bid_sol DECIMAL(18,9) DEFAULT 0,          -- Puja más alta actual
  current_bidder_id INT REFERENCES players(id),     -- Quien tiene la puja más alta
  expires_at      TIMESTAMP,                        -- Cuándo expira la subasta
  status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled', 'expired')),
  buyer_id        INT REFERENCES players(id),       -- Quien compró (tras la venta)
  tx_signature    VARCHAR(128),                     -- Firma de transacción Solana de la compra
  seller_tx       VARCHAR(128),                     -- Firma de transacción de pago al vendedor
  platform_fee    DECIMAL(18,9) DEFAULT 0,          -- Comisión de la plataforma
  created_at      TIMESTAMP DEFAULT NOW(),
  sold_at         TIMESTAMP
);

-- Historial de pujas en subastas
CREATE TABLE IF NOT EXISTS bids (
  id              SERIAL PRIMARY KEY,
  listing_id      INT NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  bidder_id       INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount_sol      DECIMAL(18,9) NOT NULL,
  tx_signature    VARCHAR(128),                     -- Firma de la transacción de la puja
  refund_tx       VARCHAR(128),                     -- Firma del reembolso (si fue superado)
  refunded        BOOLEAN DEFAULT false,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Propuestas de intercambio (criatura por criatura)
CREATE TABLE IF NOT EXISTS trade_proposals (
  id                    SERIAL PRIMARY KEY,
  proposer_id           INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  receiver_id           INT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  proposer_creature_id  INT NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  receiver_creature_id  INT NOT NULL REFERENCES creatures(id) ON DELETE CASCADE,
  message               TEXT,                       -- Mensaje opcional del proponente
  status                VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at            TIMESTAMP DEFAULT NOW(),
  resolved_at           TIMESTAMP
);

-- Historial de transacciones del marketplace (para analytics y seguridad)
CREATE TABLE IF NOT EXISTS marketplace_transactions (
  id              SERIAL PRIMARY KEY,
  listing_id      INT REFERENCES marketplace_listings(id),
  trade_id        INT REFERENCES trade_proposals(id),
  tx_type         VARCHAR(20) NOT NULL CHECK (tx_type IN ('sale', 'auction_win', 'trade', 'refund')),
  from_player_id  INT REFERENCES players(id),
  to_player_id    INT REFERENCES players(id),
  creature_id     INT REFERENCES creatures(id),
  amount_sol      DECIMAL(18,9),
  tx_signature    VARCHAR(128),
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Índices para rendimiento
CREATE INDEX idx_listings_status ON marketplace_listings(status);
CREATE INDEX idx_listings_seller ON marketplace_listings(seller_id);
CREATE INDEX idx_listings_type ON marketplace_listings(listing_type);
CREATE INDEX idx_listings_expires ON marketplace_listings(expires_at) WHERE status = 'active';
CREATE INDEX idx_bids_listing ON bids(listing_id);
CREATE INDEX idx_bids_bidder ON bids(bidder_id);
CREATE INDEX idx_trades_proposer ON trade_proposals(proposer_id);
CREATE INDEX idx_trades_receiver ON trade_proposals(receiver_id);
CREATE INDEX idx_trades_status ON trade_proposals(status);

-- Marcar criaturas como "en venta" para evitar vender/usar en combate
ALTER TABLE creatures ADD COLUMN IF NOT EXISTS listed BOOLEAN DEFAULT false;
