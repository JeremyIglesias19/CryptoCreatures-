import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// ============================================
// GET /api/notifications?limit=20
// Devuelve últimas N notificaciones + contador de no leídas.
// Seguridad:
//  - Authz via x-privy-id → players.id (nunca confiamos en un userId del cliente)
//  - Solo devuelve notifs del jugador autenticado (WHERE player_id = $1)
//  - Cap duro en limit (máx 50) para evitar scrapes
// ============================================

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

export async function GET(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
  if (playerRes.rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const playerId = playerRes.rows[0].id;

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const notifRes = await query(
      `SELECT id, type, title, body, payload, read_at, created_at
       FROM notifications
       WHERE player_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [playerId, limit]
    );

    const countRes = await query(
      `SELECT COUNT(*)::int AS n FROM notifications
       WHERE player_id = $1 AND read_at IS NULL`,
      [playerId]
    );

    return NextResponse.json({
      notifications: notifRes.rows,
      unread: countRes.rows[0].n,
    });
  } catch (err) {
    console.error('[notifications GET] error:', err.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
