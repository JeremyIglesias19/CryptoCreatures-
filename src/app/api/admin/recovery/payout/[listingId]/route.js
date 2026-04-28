import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { sendSOLFromEscrow, calculateFees } from '@/lib/solana';
import { isAdminRequest } from '@/lib/adminAuth';

// ============================================
// POST /api/admin/recovery/payout/[listingId]
// Reintenta un pago al vendedor que falló. listingId = marketplace_listings.id
//
// Validaciones:
//   - Auth admin
//   - Listing existe y status='sold'
//   - seller_tx está en NULL (si no, ya está pagado)
//   - El vendedor tiene wallet_address registrada
// ============================================
export async function POST(req, { params }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { listingId } = await params;
  const id = parseInt(listingId, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid listingId' }, { status: 400 });
  }

  try {
    // Lookup
    const listingRes = await query(`
      SELECT ml.*, p.wallet_address AS seller_wallet
      FROM marketplace_listings ml
      LEFT JOIN players p ON ml.seller_id = p.id
      WHERE ml.id = $1
    `, [id]);

    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    const listing = listingRes.rows[0];

    if (listing.status !== 'sold') {
      return NextResponse.json({ error: 'Listing is not in sold status' }, { status: 400 });
    }
    if (listing.seller_tx) {
      return NextResponse.json({ error: 'Payout already completed', seller_tx: listing.seller_tx }, { status: 409 });
    }
    if (!listing.seller_wallet) {
      return NextResponse.json({ error: 'Seller has no wallet address — cannot pay' }, { status: 400 });
    }
    if (!listing.price_sol || parseFloat(listing.price_sol) <= 0) {
      return NextResponse.json({ error: 'Invalid listing price' }, { status: 400 });
    }

    // Recalcular fee + payout (usar listing.platform_fee si ya estaba calculado)
    const { fee, sellerPayout } = calculateFees(parseFloat(listing.price_sol));
    if (sellerPayout <= 0) {
      return NextResponse.json({ error: 'Calculated payout is zero or negative' }, { status: 400 });
    }

    // Send SOL al vendedor
    let payoutTx;
    try {
      payoutTx = await sendSOLFromEscrow(listing.seller_wallet, sellerPayout);
    } catch (err) {
      console.error('[ADMIN] payout retry failed:', err);
      return NextResponse.json({ error: `Send failed: ${err.message}` }, { status: 502 });
    }

    // Update listing. Solo si seller_tx sigue NULL (idempotencia frente a concurrencia).
    const updRes = await query(`
      UPDATE marketplace_listings
      SET seller_tx = $1, platform_fee = $2
      WHERE id = $3 AND seller_tx IS NULL
      RETURNING id, seller_tx
    `, [payoutTx, fee, id]);

    if (updRes.rows.length === 0) {
      console.warn('[ADMIN] payout retry: row was already updated concurrently. Sent SOL anyway:', payoutTx);
      return NextResponse.json({
        ok: true,
        warning: 'Row was already marked completed by concurrent process; SOL was still sent',
        seller_tx: payoutTx,
      });
    }

    return NextResponse.json({ ok: true, seller_tx: payoutTx, fee, sellerPayout });
  } catch (err) {
    console.error('[ADMIN] payout retry error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
