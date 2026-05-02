import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// ============================================
// GET /api/player/username-check?value=<name>
// Chequeo en vivo de disponibilidad de un username (debounced desde el frontend).
// Devuelve { available: bool, reason?: string }.
//
// Auth: requerida para evitar enumeración masiva por bots.
// La validación final autoritative ocurre en PATCH /api/player/profile.
// ============================================

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/;
const USERNAME_RESERVED = new Set([
  'admin', 'system', 'null', 'undefined', 'root', 'support',
  'cryptocreatures', 'mod', 'moderator', 'official', 'anonymous',
]);

export async function GET(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get('value') || '').trim();

  if (raw.length < USERNAME_MIN) {
    return NextResponse.json({ available: false, reason: `Mínimo ${USERNAME_MIN} caracteres` });
  }
  if (raw.length > USERNAME_MAX) {
    return NextResponse.json({ available: false, reason: `Máximo ${USERNAME_MAX} caracteres` });
  }
  if (!USERNAME_REGEX.test(raw)) {
    return NextResponse.json({ available: false, reason: 'Solo letras, números, _ y -' });
  }
  if (USERNAME_RESERVED.has(raw.toLowerCase())) {
    return NextResponse.json({ available: false, reason: 'Nombre reservado' });
  }

  try {
    // Lookup actual del usuario para excluirse a sí mismo (puede mantener su propio nombre)
    const meRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (meRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const myId = meRes.rows[0].id;

    const dupRes = await query(
      'SELECT 1 FROM players WHERE LOWER(username) = LOWER($1) AND id <> $2',
      [raw, myId]
    );
    if (dupRes.rows.length > 0) {
      return NextResponse.json({ available: false, reason: 'Ya está en uso' });
    }

    return NextResponse.json({ available: true });
  } catch (err) {
    console.error('[USERNAME-CHECK] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
