import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// Cache in-memory (simple, 60s TTL)
let cache = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 1000;

// GET /api/stats - Stats publicas para la landing (social proof)
// No requiere auth. Cacheado 60s.
export async function GET() {
  const now = Date.now();
  if (cache && now < cacheExpiresAt) {
    return NextResponse.json(cache);
  }

  try {
    // Consultas en paralelo
    const [playersRes, battlesTodayRes, creaturesRes, battlesTotalRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS n FROM players'),
      query(`SELECT COUNT(*)::int AS n FROM battles
             WHERE status = 'finished' AND finished_at >= CURRENT_DATE`),
      query('SELECT COUNT(*)::int AS n FROM creatures'),
      query(`SELECT COUNT(*)::int AS n FROM battles WHERE status = 'finished'`),
    ]);

    const stats = {
      totalPlayers: playersRes.rows[0]?.n ?? 0,
      battlesToday: battlesTodayRes.rows[0]?.n ?? 0,
      totalCreatures: creaturesRes.rows[0]?.n ?? 0,
      battlesTotal: battlesTotalRes.rows[0]?.n ?? 0,
      updatedAt: new Date().toISOString(),
    };

    cache = stats;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json(stats);
  } catch (err) {
    console.error('[STATS] Error:', err);
    // Fallback: si DB falla, devolvemos ceros en vez de 500 (la landing no debe caerse)
    return NextResponse.json({
      totalPlayers: 0,
      battlesToday: 0,
      totalCreatures: 0,
      battlesTotal: 0,
      updatedAt: new Date().toISOString(),
      error: 'stats_unavailable',
    });
  }
}
