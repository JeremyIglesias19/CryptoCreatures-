import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// DELETE /api/team-presets/:id
// Elimina un preset. Solo el dueño puede borrarlo.
// Implementación: un solo DELETE con JOIN a players para authz atómica.
export async function DELETE(req, { params }) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const presetId = Number.parseInt(params.id, 10);
  if (!Number.isInteger(presetId) || presetId <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // DELETE con authz: borra solo si el preset pertenece a un jugador con este privy_id
  const res = await query(
    `DELETE FROM team_presets tp
     USING players p
     WHERE tp.id = $1
       AND tp.owner_id = p.id
       AND p.privy_id = $2
     RETURNING tp.id`,
    [presetId, privyId]
  );
  if (res.rows.length === 0) {
    // Devolvemos 404 genérico tanto si no existe como si no es del usuario (no leak)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id: res.rows[0].id });
}
