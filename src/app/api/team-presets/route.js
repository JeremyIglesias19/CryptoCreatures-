import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

// ============================================
// Team Presets API
// Seguridad:
//  - Authz via x-privy-id → players.id (nunca confiamos en headers a pelo)
//  - Validación estricta: nombre 1-32 chars, 3 IDs únicos, todos propiedad del jugador
//  - Cap de 10 presets por jugador (anti-abuso de almacenamiento)
//  - Parametrizado siempre, sin string interp
// ============================================

const MAX_PRESETS_PER_PLAYER = 10;
const NAME_MIN = 1;
const NAME_MAX = 32;

// Resolver jugador desde privy_id (sin filtrar existencia al cliente)
async function resolvePlayer(privyId) {
  const res = await query('SELECT id FROM players WHERE privy_id = $1', [privyId]);
  return res.rows[0] || null;
}

// GET /api/team-presets
// Devuelve la lista de presets del jugador autenticado.
export async function GET(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const player = await resolvePlayer(privyId);
  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const res = await query(
    `SELECT id, name, creature_ids, created_at
     FROM team_presets
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [player.id]
  );
  return NextResponse.json({ presets: res.rows });
}

// POST /api/team-presets  { name: string, creatureIds: number[] (len=3) }
// Crea un preset nuevo (o 409 si ya tenías uno con el mismo nombre).
export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validar name
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.` },
      { status: 400 }
    );
  }

  // Validar creatureIds: array de exactamente 3 enteros únicos
  const creatureIds = Array.isArray(body.creatureIds) ? body.creatureIds : null;
  if (!creatureIds || creatureIds.length !== 3) {
    return NextResponse.json({ error: 'Debes seleccionar exactamente 3 criaturas.' }, { status: 400 });
  }
  const clean = [];
  for (const id of creatureIds) {
    const n = Number.parseInt(id, 10);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'Creature id inválido.' }, { status: 400 });
    }
    clean.push(n);
  }
  if (new Set(clean).size !== 3) {
    return NextResponse.json({ error: 'Las 3 criaturas deben ser distintas.' }, { status: 400 });
  }

  const player = await resolvePlayer(privyId);
  if (!player) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Cap anti-abuso
  const countRes = await query(
    'SELECT COUNT(*)::int AS n FROM team_presets WHERE owner_id = $1',
    [player.id]
  );
  if (countRes.rows[0].n >= MAX_PRESETS_PER_PLAYER) {
    return NextResponse.json(
      { error: `Has alcanzado el máximo de ${MAX_PRESETS_PER_PLAYER} equipos guardados.` },
      { status: 400 }
    );
  }

  // Validar que las 3 criaturas son propiedad del jugador (authz en DB, no en memoria)
  const ownerCheck = await query(
    'SELECT COUNT(*)::int AS n FROM creatures WHERE id = ANY($1::int[]) AND owner_id = $2',
    [clean, player.id]
  );
  if (ownerCheck.rows[0].n !== 3) {
    // No filtramos cuáles faltan para no dar info a posibles atacantes
    return NextResponse.json({ error: 'Alguna criatura no es tuya o no existe.' }, { status: 403 });
  }

  try {
    const insertRes = await query(
      `INSERT INTO team_presets (owner_id, name, creature_ids)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, name, creature_ids, created_at`,
      [player.id, name, JSON.stringify(clean)]
    );
    return NextResponse.json({ preset: insertRes.rows[0] });
  } catch (err) {
    if (err?.code === '23505') {
      // Violación del unique index (owner_id, LOWER(name))
      return NextResponse.json({ error: 'Ya tienes un equipo con ese nombre.' }, { status: 409 });
    }
    console.error('[team-presets] POST error:', err.message);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
