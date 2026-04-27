import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/creatures/:id/battles
// Devuelve los últimos 10 combates en los que esta criatura ha participado.
// Busca el id de la criatura dentro de los snapshots JSONB player1_team / player2_team.
export async function GET(req, { params }) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const creatureId = parseInt(params.id, 10);
  if (!Number.isInteger(creatureId)) {
    return NextResponse.json({ error: 'Invalid creature id' }, { status: 400 });
  }

  // Verificar que la criatura pertenece al jugador autenticado
  const ownerCheck = await query(
    `SELECT c.id, c.owner_id, p.id AS player_id
     FROM creatures c
     JOIN players p ON p.id = c.owner_id
     WHERE c.id = $1 AND p.privy_id = $2`,
    [creatureId, privyId]
  );
  if (ownerCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Creature not found' }, { status: 404 });
  }
  const playerId = ownerCheck.rows[0].player_id;

  // JSONB containment: [{"id": N}] encuentra cualquier array que contenga al menos
  // un objeto con ese id. Es rápido con un índice GIN pero funciona sin él.
  const containsJson = JSON.stringify([{ id: creatureId }]);

  const battlesRes = await query(
    `SELECT b.id, b.player1_id, b.player2_id, b.winner_id,
            b.elo_change, b.turns, b.finished_at,
            p1.username AS p1_username,
            p2.username AS p2_username
     FROM battles b
     LEFT JOIN players p1 ON p1.id = b.player1_id
     LEFT JOIN players p2 ON p2.id = b.player2_id
     WHERE b.status = 'finished'
       AND (b.player1_team @> $1::jsonb OR b.player2_team @> $1::jsonb)
     ORDER BY b.finished_at DESC NULLS LAST
     LIMIT 10`,
    [containsJson]
  );

  const battles = battlesRes.rows.map(b => {
    const isP1 = b.player1_id === playerId;
    const ownWon = b.winner_id === playerId;
    const opponentUsername = isP1 ? b.p2_username : b.p1_username;
    return {
      id: b.id,
      result: ownWon ? 'win' : 'loss',
      opponent: opponentUsername || 'Desconocido',
      eloChange: ownWon ? b.elo_change : -b.elo_change,
      turns: b.turns,
      finishedAt: b.finished_at,
    };
  });

  return NextResponse.json({ battles });
}
