import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { RARITIES } from '@/lib/gameData';
import { generateCreature } from '../../player/route';

// IMPORTANTE: Stripe necesita el body raw para validar la firma.
// En App Router no hay que hacer nada especial: req.text() nos da el raw.
// Deshabilitamos ademas cualquier cache/optimizacion.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[STRIPE/webhook] STRIPE_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ error: 'Webhook secret missing' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Obtener el raw body (string) para verificar la firma
  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[STRIPE/webhook] Firma invalida:', err.message);
    return NextResponse.json({ error: `Webhook signature failed: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object;
        await query(
          `UPDATE egg_purchases SET status = 'failed' WHERE stripe_session_id = $1 AND status = 'pending'`,
          [session.id]
        );
        break;
      }
      default:
        // Ignoramos el resto de eventos
        break;
    }
  } catch (err) {
    console.error('[STRIPE/webhook] Error procesando evento:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session) {
  const sessionId = session.id;
  const paymentIntentId = session.payment_intent || null;

  // Idempotencia: si ya esta marcado como pagado, no duplicamos
  const existing = await query(
    `SELECT id, status, creature_id FROM egg_purchases WHERE stripe_session_id = $1`,
    [sessionId]
  );

  if (existing.rows.length === 0) {
    // Puede pasar si el checkout se creo fuera de nuestro flujo. Recuperamos metadata.
    const metadata = session.metadata || {};
    const playerId = parseInt(metadata.player_id, 10);
    if (!playerId) {
      console.error('[STRIPE/webhook] checkout.session.completed sin player_id en metadata', session.id);
      return;
    }
    await query(
      `INSERT INTO egg_purchases (player_id, stripe_session_id, stripe_payment_intent_id, amount_eur, currency, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, 'paid', NOW())`,
      [playerId, sessionId, paymentIntentId, (session.amount_total || 500) / 100, session.currency || 'eur']
    );
    await mintCreatureForSession(sessionId, playerId);
    return;
  }

  const purchase = existing.rows[0];
  if (purchase.status === 'paid' || purchase.status === 'claimed') {
    // Ya procesado previamente (reintento del webhook). No hacer nada.
    console.log('[STRIPE/webhook] Sesion ya procesada:', sessionId, 'status:', purchase.status);
    return;
  }

  // Marcar como pagado
  await query(
    `UPDATE egg_purchases
     SET status = 'paid',
         stripe_payment_intent_id = $2,
         paid_at = NOW()
     WHERE stripe_session_id = $1`,
    [sessionId, paymentIntentId]
  );

  // Obtener player_id de la fila existente
  const playerRow = await query(
    `SELECT player_id FROM egg_purchases WHERE stripe_session_id = $1`,
    [sessionId]
  );
  const playerId = playerRow.rows[0].player_id;

  await mintCreatureForSession(sessionId, playerId);
}

// Genera la criatura tras confirmacion de pago y la vincula a la compra.
async function mintCreatureForSession(sessionId, playerId) {
  // Determinar rareza segun probabilidades
  const roll = Math.random();
  let cumulative = 0;
  let rarityKey = 'common';
  for (const [key, rarity] of Object.entries(RARITIES)) {
    cumulative += rarity.chance;
    if (roll <= cumulative) {
      rarityKey = key;
      break;
    }
  }

  // Indice de la criatura (para naming consistente)
  const countRes = await query('SELECT COUNT(*) FROM creatures WHERE owner_id = $1', [playerId]);
  const index = parseInt(countRes.rows[0].count, 10);

  // Generar criatura usando la logica compartida
  const creature = generateCreature(rarityKey, index);

  // Insertar criatura
  const insertRes = await query(
    `INSERT INTO creatures (owner_id, name, rarity, types, hp, atk, def, spd, ability, attacks, img_seed, preferred_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      playerId,
      creature.name,
      creature.rarity,
      creature.types,
      creature.hp,
      creature.atk,
      creature.def,
      creature.spd,
      creature.ability,
      JSON.stringify(creature.attacks),
      creature.imgSeed,
      creature.preferred_role,
    ]
  );
  const createdCreature = insertRes.rows[0];

  // Vincular la criatura a la compra
  await query(
    `UPDATE egg_purchases
     SET creature_id = $1,
         rarity_key = $2
     WHERE stripe_session_id = $3`,
    [createdCreature.id, rarityKey, sessionId]
  );

  // Registrar en marketplace_transactions (coherencia con flujo legacy)
  await query(
    `INSERT INTO marketplace_transactions (tx_type, from_player_id, amount_sol, tx_signature)
     VALUES ('egg_purchase', $1, $2, $3)`,
    [playerId, 0, `stripe:${sessionId}`]
  ).catch(() => {});

  console.log(
    `[STRIPE/webhook] Criatura generada: ${createdCreature.name} (${rarityKey}) para player ${playerId} — session ${sessionId}`
  );
}
