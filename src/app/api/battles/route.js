import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// GET /api/battles - Get battle history for a player
export async function GET(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);
  const offset = (page - 1) * limit;

  try {
    // Get player
    const playerRes = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
    if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const playerId = playerRes.rows[0].id;

    // Get total count + wins/losses agregados (todas las páginas, no solo la visible)
    const countRes = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE winner_id = $1)::int AS wins,
         COUNT(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id <> $1)::int AS losses
       FROM battles
       WHERE (player1_id = $1 OR player2_id = $1) AND status = $2`,
      [playerId, 'finished']
    );
    const total = countRes.rows[0].total;
    const totalWins = countRes.rows[0].wins;
    const totalLosses = countRes.rows[0].losses;

    // Get battles with player usernames + ELO at battle time
    const battlesRes = await query(`
      SELECT b.id, b.player1_id, b.player2_id, b.winner_id, b.elo_change, b.turns,
             b.player1_team, b.player2_team, b.started_at, b.finished_at,
             b.p1_elo, b.p2_elo,
             p1.username AS player1_username, p1.elo AS player1_elo_current,
             p2.username AS player2_username, p2.elo AS player2_elo_current
      FROM battles b
      JOIN players p1 ON b.player1_id = p1.id
      JOIN players p2 ON b.player2_id = p2.id
      WHERE (b.player1_id = $1 OR b.player2_id = $1) AND b.status = 'finished'
      ORDER BY b.finished_at DESC
      LIMIT $2 OFFSET $3
    `, [playerId, limit, offset]);

    // Format battles for the client
    const battles = battlesRes.rows.map(b => {
      const isPlayer1 = b.player1_id === playerId;
      const won = b.winner_id === playerId;
      const myTeam = isPlayer1 ? b.player1_team : b.player2_team;
      const opponentTeam = isPlayer1 ? b.player2_team : b.player1_team;
      const opponentName = isPlayer1 ? b.player2_username : b.player1_username;
      // Use ELO saved at battle time (p1_elo/p2_elo), fallback to current if old battles don't have it
      const opponentElo = isPlayer1
        ? (b.p2_elo ?? b.player2_elo_current)
        : (b.p1_elo ?? b.player1_elo_current);

      return {
        id: b.id,
        won,
        eloChange: won ? b.elo_change : -b.elo_change,
        turns: b.turns,
        opponentName,
        opponentElo,
        myTeam: myTeam || [],
        opponentTeam: opponentTeam || [],
        finishedAt: b.finished_at,
      };
    });

    // Daily battle count
    const dailyRes = await query(
      `SELECT COUNT(*) FROM battles
       WHERE (player1_id = $1 OR player2_id = $1)
       AND status = 'finished'
       AND finished_at >= CURRENT_DATE`,
      [playerId]
    );
    const dailyBattles = parseInt(dailyRes.rows[0].count);
    const dailyLimit = 10;

    return NextResponse.json({
      battles,
      total,
      totalWins,
      totalLosses,
      page,
      totalPages: Math.ceil(total / limit),
      dailyBattles,
      dailyLimit,
      dailyRemaining: Math.max(0, dailyLimit - dailyBattles),
    });
  } catch (err) {
    console.error('[BATTLES] History error:', err);
    return NextResponse.json({ error: 'Error fetching battle history' }, { status: 500 });
  }
}
