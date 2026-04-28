import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// ============================================
// PATCH /api/notifications/:id
// Marca una notificación como leída. Solo el dueño puede.
// Implementación: un solo UPDATE con JOIN a players (authz atómica, sin leak).
// ============================================

export async function PATCH(req, { params }) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const notifId = Number.parseInt(params.id, 10);
  if (!Number.isInteger(notifId) || notifId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const res = await query(
      `UPDATE notifications n
       SET read_at = NOW()
       FROM players p
       WHERE n.id = $1
         AND n.player_id = p.id
         AND p.privy_id = $2
         AND n.read_at IS NULL
       RETURNING n.id`,
      [notifId, privyId]
    );
    // 0 filas puede ser: no existe, no es tuya, o ya estaba leída.
    // Todo devuelve 200 con ok:true para no filtrar cuál de los 3 es.
    return NextResponse.json({ ok: true, updated: res.rows.length });
  } catch (err) {
    console.error('[notifications PATCH] error:', err.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
