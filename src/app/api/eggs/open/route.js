import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { generateCreature } from '../../player/route';
import { RARITIES } from '@/lib/gameData';
import { verifyTransaction } from '@/lib/solana';

const EGG_PRICE_EUR = 5;

export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { txSignature, walletAddress, priceSOL } = body;

  if (!txSignature || !walletAddress || !priceSOL) {
    return NextResponse.json({ error: 'Missing txSignature, walletAddress, or priceSOL' }, { status: 400 });
  }

  // Obtener jugador
  const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
  if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const player = playerRes.rows[0];

  // Update wallet address if different
  if (walletAddress !== player.wallet_address) {
    await query('UPDATE players SET wallet_address = $1 WHERE id = $2', [walletAddress, player.id]);
  }

  // Verify the Solana transaction
  const verification = await verifyTransaction(txSignature, walletAddress, parseFloat(priceSOL));
  if (!verification.valid) {
    return NextResponse.json({ error: `Transaction verification failed: ${verification.error}` }, { status: 400 });
  }

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

  // Record the egg purchase transaction
  await query(
    `INSERT INTO marketplace_transactions (tx_type, from_player_id, amount_sol, tx_signature)
     VALUES ('egg_purchase', $1, $2, $3)`,
    [player.id, priceSOL, txSignature]
  ).catch(() => {}); // Non-critical, don't fail if table schema doesn't match

  return NextResponse.json({
    creature: res.rows[0],
    rarity: rarityKey,
  });
}
