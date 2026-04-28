import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { sendSOLFromEscrow } from '@/lib/solana';
import { isAdminRequest } from '@/lib/adminAuth';

// ============================================
// POST /api/admin/recovery/refund/[id]
// Reintenta un reembolso fallido. id = marketplace_transactions.id
//
// Validaciones:
//   - Auth admin
//   - La fila existe, es tipo 'refund' y tx_signature aún es NULL
//   - El comprador tiene wallet_address registrada
//
// Idempotencia:
//   - Si en el momento de procesar otro hilo ya completó el refund, abort.
//   - sendSOLFromEscrow no es idempotente per se, así que este endpoint NUNCA
//     debe llamarse en paralelo. Asumimos que solo un admin lo dispara a la vez.
// ============================================
export async function POST(req, { params }) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const txId = parseInt(id, 10);
  if (!Number.isFinite(txId) || txId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    // Lookup
    const txRes = await query(`
      SELECT mt.*, p.wallet_address AS buyer_wallet
      FROM marketplace_transactions mt
      LEFT JOIN players p ON mt.to_player_id = p.id
      WHERE mt.id = $1
    `, [txId]);

    if (txRes.rows.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }
    const row = txRes.rows[0];

    if (row.tx_type !== 'refund') {
      return NextResponse.json({ error: 'Not a refund transaction' }, { status: 400 });
    }
    if (row.tx_signature) {
      return NextResponse.json({ error: 'Refund already completed', tx_signature: row.tx_signature }, { status: 409 });
    }
    if (!row.buyer_wallet) {
      return NextResponse.json({ error: 'Buyer has no wallet address — cannot refund' }, { status: 400 });
    }
    if (!row.amount_sol || parseFloat(row.amount_sol) <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Send SOL
    let refundTx;
    try {
      refundTx = await sendSOLFromEscrow(row.buyer_wallet, parseFloat(row.amount_sol));
    } catch (err) {
      console.error('[ADMIN] refund retry failed:', err);
      return NextResponse.json({ error: `Send failed: ${err.message}` }, { status: 502 });
    }

    // Update record. Si otra ejecución concurrente ya lo updateó, lo respetamos.
    const updRes = await query(`
      UPDATE marketplace_transactions
      SET tx_signature = $1
      WHERE id = $2 AND tx_signature IS NULL
      RETURNING id, tx_signature
    `, [refundTx, txId]);

    if (updRes.rows.length === 0) {
      console.warn('[ADMIN] refund retry: row was already updated concurrently. Sent SOL anyway:', refundTx);
      return NextResponse.json({
        ok: true,
        warning: 'Row was already marked completed by concurrent process; SOL was still sent',
        tx_signature: refundTx,
      });
    }

    return NextResponse.json({ ok: true, tx_signature: refundTx });
  } catch (err) {
    console.error('[ADMIN] refund retry error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
