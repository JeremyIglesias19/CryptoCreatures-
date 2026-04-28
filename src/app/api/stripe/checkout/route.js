import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';
import { query } from '@/lib/db';
import {
  getStripe,
  EGG_PRICE_CENTS,
  EGG_PRICE_EUR,
  EGG_PRODUCT_NAME,
  EGG_PRODUCT_DESCRIPTION,
} from '@/lib/stripe';

// POST /api/stripe/checkout
// Crea una sesion de Stripe Checkout para comprar 1 huevo (5 EUR).
// Devuelve { url } al que redirigimos al usuario.
export async function POST(req) {
  try {
    const privyId = await getAuthenticatedPrivyId(req);
    if (!privyId) {
      return NextResponse.json({ error: 'No auth' }, { status: 401 });
    }

    // Validar que el jugador existe
    const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    const player = playerRes.rows[0];

    // TODO (prioridad 2): aqui se verificara edad via Didit antes de permitir la compra.
    // TODO (prioridad 2): rate limiting por IP + Cloudflare Turnstile.

    // URLs de retorno
    const origin =
      req.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';

    const stripe = getStripe();

    // Crear la sesion de Checkout (producto inline, sin productos pre-creados en Stripe)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: EGG_PRODUCT_NAME,
              description: EGG_PRODUCT_DESCRIPTION,
            },
            unit_amount: EGG_PRICE_CENTS,
          },
          quantity: 1,
        },
      ],
      // metadata: info que recuperaremos en el webhook para vincular el pago al jugador
      metadata: {
        privy_id: String(privyId),
        player_id: String(player.id),
        product: 'egg',
      },
      // success_url incluye el session_id para que el cliente haga polling del claim
      success_url: `${origin}/game?egg_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/game?egg_cancel=1`,
      // Opcional: email del cliente si esta guardado
      customer_email: player.email || undefined,
      // Limitar locale a espanol
      locale: 'es',
    });

    // Registrar la compra como pendiente en la DB
    await query(
      `INSERT INTO egg_purchases (player_id, stripe_session_id, amount_eur, currency, status)
       VALUES ($1, $2, $3, 'eur', 'pending')
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [player.id, session.id, EGG_PRICE_EUR]
    );

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('[STRIPE/checkout] error:', err);
    return NextResponse.json(
      { error: err.message || 'Error creando la sesion de pago' },
      { status: 500 }
    );
  }
}
