import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// ============================================
// POST /api/notifications/read-all
// Marca todas las notificaciones del jugador como leídas.
// Bulk UPDATE con JOIN atómico a players vía privy_id.
// ============================================

export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  try {
    const res = await query(
      `UPDATE notifications n
       SET read_at = NOW()
       FROM players p
       WHERE n.player_id = p.id
         AND p.privy_id = $1
         AND n.read_at IS NULL
       RETURNING n.id`,
      [privyId]
    );
    return NextResponse.json({ ok: true, updated: res.rows.length });
  } catch (err) {
    console.error('[notifications read-all] error:', err.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
