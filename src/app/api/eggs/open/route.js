import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { generateCreature } from '../../player/route';
import { RARITIES } from '@/lib/gameData';

const EGG_COST = 50;

export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  // Obtener jugador
  const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
  if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const player = playerRes.rows[0];

  // Comprobar gems
  if (player.gems < EGG_COST) {
    return NextResponse.json({ error: 'No tienes suficientes gemas' }, { status: 400 });
  }

  // Gastar gems
  await query('UPDATE players SET gems = gems - $1 WHERE id = $2', [EGG_COST, player.id]);

  // Determinar rareza
  const roll = Math.random();
  let cumulative = 0;
  let rarityKey = 'common';
  for (const [key, rarity] of Object.entries(RARITIES)) {
    cumulative += rarity.chance;
    if (roll <= cumulative) { rarityKey = key; break; }
  }

  // Contar criaturas del jugador para el index
  const countRes = await query('SELECT COUNT(*) FROM creatures WHERE owner_id = $1', [player.id]);
  const index = parseInt(countRes.rows[0].count);

  // Generar criatura
  const creature = generateCreature(rarityKey, index);

  // Guardar en BD
  const res = await query(
    `INSERT INTO creatures (owner_id, name, rarity, types, hp, atk, def, spd, ability, attacks, img_seed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [player.id, creature.name, creature.rarity, creature.types,
     creature.hp, creature.atk, creature.def, creature.spd,
     creature.ability, JSON.stringify(creature.attacks),
     creature.imgSeed]
  );

  return NextResponse.json({
    creature: res.rows[0],
    gemsRemaining: player.gems - EGG_COST,
    rarity: rarityKey,
  });
}
