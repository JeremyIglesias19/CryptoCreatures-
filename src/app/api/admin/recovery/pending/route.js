import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/adminAuth';

// ============================================
// GET /api/admin/recovery/pending
// Lista todos los movimientos SOL del marketplace que necesitan retry manual:
//   - Reembolsos a compradores que perdieron race pero sendSOLFromEscrow falló
//   - Pagos a vendedores que ganaron venta pero sendSOLFromEscrow falló
// Auth: x-privy-id header debe coincidir con ADMIN_PRIVY_ID env.
// ============================================
export async function GET(req) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Reembolsos pendientes: tx_type='refund' con tx_signature aún NULL
    const refundsRes = await query(`
      SELECT mt.id, mt.listing_id, mt.to_player_id, mt.amount_sol, mt.original_tx, mt.created_at,
             p.username AS buyer_username, p.wallet_address AS buyer_wallet,
             ml.creature_id, ml.price_sol AS listing_price
      FROM marketplace_transactions mt
      LEFT JOIN players p ON mt.to_player_id = p.id
      LEFT JOIN marketplace_listings ml ON mt.listing_id = ml.id
      WHERE mt.tx_type = 'refund' AND mt.tx_signature IS NULL
      ORDER BY mt.created_at ASC
      LIMIT 100
    `);

    // Pagos al vendedor pendientes: listings vendidas pero seller_tx=NULL
    const payoutsRes = await query(`
      SELECT ml.id AS listing_id, ml.seller_id, ml.price_sol, ml.platform_fee, ml.sold_at,
             ml.creature_id, ml.buyer_id,
             p.username AS seller_username, p.wallet_address AS seller_wallet
      FROM marketplace_listings ml
      LEFT JOIN players p ON ml.seller_id = p.id
      WHERE ml.status = 'sold' AND ml.seller_tx IS NULL AND ml.price_sol > 0
      ORDER BY ml.sold_at ASC
      LIMIT 100
    `);

    return NextResponse.json({
      pending_refunds: refundsRes.rows,
      pending_seller_payouts: payoutsRes.rows,
    });
  } catch (err) {
    console.error('[ADMIN] recovery/pending error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
