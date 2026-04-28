import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';
import { query } from '@/lib/db';

// POST /api/eggs/claim
// Body: { sessionId }
// Devuelve la criatura generada tras un pago Stripe completado.
// El cliente hace polling a este endpoint tras redireccion desde Stripe:
//   - status "pending" -> webhook aun no llego, reintentar
//   - status "paid"    -> criatura lista, devolver
//   - status "claimed" -> ya fue reclamada (muestra error suave, no permite doble animacion)
//   - status "failed"  -> pago fallido
export async function POST(req) {
  try {
    const privyId = await getAuthenticatedPrivyId(req);
    if (!privyId) {
      return NextResponse.json({ error: 'No auth' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // Validar que el jugador es el dueno de esta compra
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    const player = playerRes.rows[0];

    const purchaseRes = await query(
      `SELECT ep.*, c.* FROM egg_purchases ep
         LEFT JOIN creatures c ON c.id = ep.creature_id
         WHERE ep.stripe_session_id = $1 AND ep.player_id = $2`,
      [sessionId, player.id]
    );

    if (purchaseRes.rows.length === 0) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }

    const row = purchaseRes.rows[0];

    // Si aun no ha llegado el webhook
    if (row.status === 'pending') {
      return NextResponse.json({ status: 'pending' });
    }

    if (row.status === 'failed') {
      return NextResponse.json({ status: 'failed' });
    }

    if (row.status === 'claimed') {
      return NextResponse.json({ status: 'claimed', message: 'Este huevo ya fue abierto previamente' });
    }

    // status === 'paid': hay criatura, la devolvemos y marcamos como claimed
    if (!row.creature_id) {
      // Caso raro: pago procesado pero criatura sin generar. Devolver pending para reintentar.
      return NextResponse.json({ status: 'pending' });
    }

    // La query con JOIN puede dar columnas confusas; hacemos un fetch limpio
    const creatureRes = await query('SELECT * FROM creatures WHERE id = $1', [row.creature_id]);
    const creature = creatureRes.rows[0];

    // Marcar como claimed (evita doble animacion si el usuario refresca)
    await query(
      `UPDATE egg_purchases SET status = 'claimed', claimed_at = NOW() WHERE stripe_session_id = $1`,
      [sessionId]
    );

    return NextResponse.json({
      status: 'paid',
      creature,
      rarity: row.rarity_key,
    });
  } catch (err) {
    console.error('[EGGS/claim] error:', err);
    return NextResponse.json({ error: err.message || 'Error reclamando huevo' }, { status: 500 });
  }
}
