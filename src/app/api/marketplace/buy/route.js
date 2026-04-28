import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';
import { verifyTransaction, sendSOLFromEscrow, calculateFees } from '@/lib/solana';
import { insertNotification } from '@/lib/notifications';

// ============================================
// POST /api/marketplace/buy
// ============================================
// Flujo:
//   1. Auth + ownership checks
//   2. Verificar tx on-chain (SOL llegó al escrow)
//   3. Idempotencia: si ya compramos o ya nos reembolsaron, return temprano
//   4. Atomic UPDATE de la listing PRIMERO (esto define quién gana la race)
//   5. Si perdimos race → auto-refund al comprador (su SOL sigue en escrow,
//      no se ha enviado al vendedor todavía gracias al reorden)
//   6. Si ganamos → pagamos al vendedor, transferimos criatura, registramos
//
// Garantías:
//   - Nunca doble pago al vendedor (race) porque el seller_payout va DESPUÉS del lock
//   - Nunca SOL atorado: si hay race, auto-refund inmediato; si auto-refund falla,
//     queda fila marketplace_transactions con tx_signature=NULL para retry admin
//   - Idempotente ante retry: índice UNIQUE en (listing_id, original_tx) bloquea
//     reembolsos duplicados; SELECT previo devuelve éxito si ya compramos
// ============================================

export async function POST(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { listingId, txSignature } = await req.json();
  if (!listingId || !txSignature) {
    return NextResponse.json({ error: 'Missing listingId or txSignature' }, { status: 400 });
  }

  try {
    // --------------------------------------------------
    // 1. Get buyer + wallet
    //    SECURITY: NO aceptamos walletAddress del request body.
    //    Antes lo aceptábamos y sobrescribía buyer.wallet_address, lo que permitía
    //    que un atacante reutilizara la tx_signature on-chain de otro usuario,
    //    pasando la wallet del verdadero pagador en el body. La verificación
    //    on-chain pasaba (es B → escrow), el atomic UPDATE asignaba el creature
    //    al atacante (privy_id en header) y el pagador legítimo perdía su SOL.
    //    Solución: usar SOLO buyer.wallet_address de DB (set en onboarding).
    // --------------------------------------------------
    const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const buyer = playerRes.rows[0];

    if (!buyer.wallet_address) {
      return NextResponse.json({
        error: 'Wallet not linked to your account. Please re-login.',
      }, { status: 400 });
    }
    const senderAddress = buyer.wallet_address;

    // --------------------------------------------------
    // 2. Get listing (sin filtrar por status — necesitamos detectarlo
    //    para auto-refund si ya fue vendida)
    // --------------------------------------------------
    const listingRes = await query(
      "SELECT * FROM marketplace_listings WHERE id = $1 AND listing_type = 'fixed'",
      [listingId]
    );
    if (listingRes.rows.length === 0) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }
    const listing = listingRes.rows[0];

    // Can't buy your own
    if (listing.seller_id === buyer.id) {
      return NextResponse.json({ error: 'Cannot buy your own listing' }, { status: 400 });
    }

    // --------------------------------------------------
    // 3. Idempotencia: ¿ya compramos esta listing con esta tx?
    //    Si sí, retry exitoso sin tocar nada más.
    // --------------------------------------------------
    if (listing.status === 'sold' && listing.tx_signature === txSignature && listing.buyer_id === buyer.id) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        creature_id: listing.creature_id,
        paid: listing.price_sol,
      });
    }

    // ¿Ya hay un reembolso registrado para este intento? Retry tras race perdida.
    const existingRefund = await query(
      "SELECT tx_signature FROM marketplace_transactions WHERE listing_id = $1 AND original_tx = $2 AND tx_type = 'refund'",
      [listing.id, txSignature]
    );
    if (existingRefund.rows.length > 0) {
      const refundTx = existingRefund.rows[0].tx_signature;
      return NextResponse.json({
        error: 'Listing was sold to another buyer. Your SOL was refunded.',
        refund_tx: refundTx,
        refund_pending: !refundTx,
      }, { status: 409 });
    }

    // --------------------------------------------------
    // 4. Verify tx on-chain
    // --------------------------------------------------
    const verification = await verifyTransaction(txSignature, senderAddress, parseFloat(listing.price_sol));
    if (!verification.valid) {
      return NextResponse.json({ error: `Transaction verification failed: ${verification.error}` }, { status: 400 });
    }

    // --------------------------------------------------
    // 5. ATOMIC UPDATE PRIMERO. Define el ganador de la race.
    //    Si listing.status no es 'active' (ya vendida, cancelada, expirada) → falla → auto-refund.
    // --------------------------------------------------
    const closeRes = await query(`
      UPDATE marketplace_listings
      SET status = 'sold', buyer_id = $1, tx_signature = $2, sold_at = NOW()
      WHERE id = $3 AND status = 'active'
      RETURNING id
    `, [buyer.id, txSignature, listing.id]);

    // --------------------------------------------------
    // 6. RACE PERDIDA → AUTO-REFUND
    //    Importante: el SOL del buyer YA está en escrow (verificado en paso 4)
    //    pero NUNCA se envió al vendedor (porque el seller_payout va después
    //    del lock). Reembolso = devolver el monto exacto al sender_address.
    // --------------------------------------------------
    if (closeRes.rows.length === 0) {
      console.warn('[MARKETPLACE] Race lost or listing not active:', {
        listingId: listing.id, buyer: buyer.id, tx: txSignature, status: listing.status,
      });

      const refundAmount = verification.amountReceived;

      // 6a. Reservar fila refund con tx_signature=NULL ANTES de enviar SOL.
      //     Si server crashea entre send y record, fila persiste como pending.
      //     UNIQUE INDEX en (listing_id, original_tx) bloquea duplicados.
      let refundRowId = null;
      try {
        // ON CONFLICT con WHERE matching el índice parcial uniq_refund_per_attempt.
        // Si ya hay refund para este (listing, original_tx), DO NOTHING y returning vacío.
        const reserveRes = await query(`
          INSERT INTO marketplace_transactions
            (listing_id, tx_type, from_player_id, to_player_id, amount_sol, original_tx, tx_signature)
          VALUES ($1, 'refund', NULL, $2, $3, $4, NULL)
          ON CONFLICT (listing_id, original_tx)
            WHERE tx_type = 'refund' AND original_tx IS NOT NULL
            DO NOTHING
          RETURNING id
        `, [listing.id, buyer.id, refundAmount, txSignature]);
        refundRowId = reserveRes.rows[0]?.id ?? null;
      } catch (insErr) {
        console.error('[MARKETPLACE] Refund reserve failed:', insErr.message);
      }

      // Si refundRowId es null = otro request concurrente ya reservó este reembolso.
      // Devolvemos lo que tengamos en DB para que el cliente sepa el estado.
      if (!refundRowId) {
        const dup = await query(
          "SELECT tx_signature FROM marketplace_transactions WHERE listing_id = $1 AND original_tx = $2 AND tx_type = 'refund'",
          [listing.id, txSignature]
        );
        const dupTx = dup.rows[0]?.tx_signature ?? null;
        return NextResponse.json({
          error: 'Listing was sold to another buyer. Refund in progress.',
          refund_tx: dupTx,
          refund_pending: !dupTx,
        }, { status: 409 });
      }

      // 6b. Enviar SOL de vuelta al buyer
      let refundTx = null;
      try {
        refundTx = await sendSOLFromEscrow(senderAddress, refundAmount);
        await query('UPDATE marketplace_transactions SET tx_signature = $1 WHERE id = $2', [refundTx, refundRowId]);
      } catch (refundErr) {
        console.error('[MARKETPLACE] Auto-refund send failed (admin retry needed):', {
          rowId: refundRowId, err: refundErr.message,
        });
        // Fila queda con tx_signature=NULL → admin endpoint la recoge.
      }

      return NextResponse.json({
        error: 'Listing was sold to another buyer. Your SOL has been refunded.',
        refund_tx: refundTx,
        refund_pending: !refundTx,
      }, { status: 409 });
    }

    // --------------------------------------------------
    // 7. GANAMOS LA RACE. Ahora sí pagamos al vendedor.
    // --------------------------------------------------
    const { fee, sellerPayout } = calculateFees(parseFloat(listing.price_sol));
    const sellerRes = await query('SELECT wallet_address FROM players WHERE id = $1', [listing.seller_id]);
    const sellerWallet = sellerRes.rows[0]?.wallet_address;

    let sellerTx = null;
    if (sellerWallet && sellerPayout > 0) {
      try {
        sellerTx = await sendSOLFromEscrow(sellerWallet, sellerPayout);
      } catch (payErr) {
        console.error('[MARKETPLACE] Seller payout error (admin retry needed):', {
          listingId: listing.id, sellerWallet, sellerPayout, err: payErr.message,
        });
        // Listing queda en 'sold' con seller_tx=NULL → admin endpoint la recoge
      }
    }

    // 7b. Actualizar listing con resultado del payout
    await query(
      'UPDATE marketplace_listings SET seller_tx = $1, platform_fee = $2 WHERE id = $3',
      [sellerTx, fee, listing.id]
    );

    // 7c. Transferir criatura al buyer
    await query('UPDATE creatures SET owner_id = $1, listed = false WHERE id = $2', [buyer.id, listing.creature_id]);

    // 7d. Record sale en marketplace_transactions.
    //     ON CONFLICT con WHERE matching el índice parcial uniq_market_tx_signature.
    await query(`
      INSERT INTO marketplace_transactions (listing_id, tx_type, from_player_id, to_player_id, creature_id, amount_sol, tx_signature)
      VALUES ($1, 'sale', $2, $3, $4, $5, $6)
      ON CONFLICT (tx_signature)
        WHERE tx_signature IS NOT NULL
        DO NOTHING
    `, [listing.id, buyer.id, listing.seller_id, listing.creature_id, listing.price_sol, txSignature]);

    // 7e. Notificación al vendedor (best-effort)
    let creatureName = 'tu criatura';
    try {
      const nameRes = await query('SELECT name FROM creatures WHERE id = $1', [listing.creature_id]);
      if (nameRes.rows[0]?.name) creatureName = nameRes.rows[0].name;
    } catch { /* noop */ }
    insertNotification(listing.seller_id, {
      type: 'marketplace_sold',
      title: '¡Vendiste una criatura!',
      body: `${creatureName} se vendió por ${listing.price_sol} SOL.`,
      payload: {
        creature_id: listing.creature_id,
        creature_name: creatureName,
        price_sol: listing.price_sol,
        seller_payout: sellerPayout,
        listing_id: listing.id,
      },
    }).catch(err => console.error('[MARKETPLACE] notif error:', err.message));

    return NextResponse.json({
      success: true,
      creature_id: listing.creature_id,
      paid: listing.price_sol,
      fee,
      sellerPayout,
      sellerTx,
      sellerPayoutPending: !sellerTx && sellerPayout > 0,
    });
  } catch (err) {
    console.error('[MARKETPLACE] Buy error:', err);
    return NextResponse.json({ error: 'Error processing purchase' }, { status: 500 });
  }
}
