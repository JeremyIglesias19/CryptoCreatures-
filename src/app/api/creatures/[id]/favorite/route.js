import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// PATCH /api/creatures/:id/favorite  { isFavorite?: boolean }
// Set or toggle the favorite flag. Solo el dueño puede modificarlo.
//
// Versión optimizada: una sola query que:
//  1. Hace JOIN a players por privy_id (authz)
//  2. Si se pasó isFavorite, lo setea; si no, hace toggle (NOT is_favorite)
//  3. Devuelve 0 filas si no hay match (criatura inexistente o no es tuya)
//
// De 3 queries a 1 → ~3x menos carga en DB bajo spam.
export async function PATCH(req, { params }) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const creatureId = parseInt(params.id, 10);
  if (!Number.isInteger(creatureId)) {
    return NextResponse.json({ error: 'Invalid creature id' }, { status: 400 });
  }

  let body = {};
  try { body = await req.json(); } catch { /* body vacío = toggle */ }

  const explicit = typeof body.isFavorite === 'boolean' ? body.isFavorite : null;

  // Una sola query con authz atómica via JOIN a players.
  // CASE WHEN: si $3 IS NULL hacemos toggle, si no usamos el valor explícito.
  // Query 100% estática → imposible inyección, sin branching en JS.
  const res = await query(
    `UPDATE creatures c
     SET is_favorite = CASE WHEN $3::boolean IS NULL THEN NOT c.is_favorite ELSE $3 END
     FROM players p
     WHERE c.id = $1
       AND c.owner_id = p.id
       AND p.privy_id = $2
     RETURNING c.id, c.is_favorite`,
    [creatureId, privyId, explicit]
  );
  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Creature not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, creature: res.rows[0] });
}
