import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// ============================================
// GET /api/profile/[username]
// Devuelve datos públicos del perfil de un jugador.
// Auth: requerida vía JWT (cualquier usuario logeado puede ver perfiles ajenos).
//   - Sirve para prevenir scraping anónimo del ranking.
//
// NUNCA devuelve: email, privy_id, wallet_address, last_login, energy_reset.
// El avatar_creature se valida en read-time: si el dueño actual no es el
// player → avatar revierte a default (porque vendió la criatura).
// ============================================

const TOP_CREATURES_LIMIT = 5;

export async function GET(req, { params }) {
  // Auth requerida — solo usuarios logeados ven perfiles ajenos
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const { username } = await params;
  if (!username || typeof username !== 'string') {
    return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
  }

  try {
    // 1. Buscar jugador por username (case-insensitive)
    const playerRes = await query(
      `SELECT id, username, avatar_url, avatar_creature_id,
              elo, wins, losses, streak_days, created_at
       FROM players WHERE LOWER(username) = LOWER($1)`,
      [username]
    );
    if (playerRes.rows.length === 0) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const p = playerRes.rows[0];

    // 2. Validar avatar_creature: solo lo devolvemos si AÚN pertenece al jugador
    let avatarCreature = null;
    if (p.avatar_creature_id) {
      const avRes = await query(
        `SELECT id, name, rarity, types, hp, atk, def, spd, ability, attacks, img_seed
         FROM creatures WHERE id = $1 AND owner_id = $2`,
        [p.avatar_creature_id, p.id]
      );
      if (avRes.rows.length > 0) avatarCreature = avRes.rows[0];
    }

    // 3. Top criaturas: favoritas primero, luego por rareza desc
    const RARITY_ORDER = `CASE rarity
      WHEN 'Unica' THEN 6
      WHEN 'Legendaria' THEN 5
      WHEN 'Epica' THEN 4
      WHEN 'Rara' THEN 3
      WHEN 'Poco Comun' THEN 2
      ELSE 1
    END`;
    const topRes = await query(
      `SELECT id, name, rarity, types, hp, atk, def, spd, ability, img_seed, is_favorite
       FROM creatures
       WHERE owner_id = $1
       ORDER BY is_favorite DESC, ${RARITY_ORDER} DESC, created_at DESC
       LIMIT $2`,
      [p.id, TOP_CREATURES_LIMIT]
    );

    return NextResponse.json({
      profile: {
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url, // fallback Google avatar
        avatar_creature: avatarCreature,
        elo: p.elo,
        wins: p.wins,
        losses: p.losses,
        streak_days: p.streak_days,
        joined_at: p.created_at,
      },
      top_creatures: topRes.rows,
    });
  } catch (err) {
    console.error('[PROFILE] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
