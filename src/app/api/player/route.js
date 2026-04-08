import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { CREATURE_POOL, CREATURE_TYPES, ATTACKS_DB, RARITIES } from '@/lib/gameData';

// GET /api/player - Obtener perfil + criaturas
export async function GET(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const playerRes = await query('SELECT * FROM players WHERE privy_id = $1', [privyId]);
  if (playerRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const player = playerRes.rows[0];
  const creaturesRes = await query('SELECT * FROM creatures WHERE owner_id = $1 ORDER BY created_at DESC', [player.id]);

  // Reset energy si ha pasado el dia
  const now = new Date();
  const lastReset = new Date(player.energy_reset);
  if (now.toDateString() !== lastReset.toDateString()) {
    await query('UPDATE players SET energy = 10, energy_reset = NOW() WHERE id = $1', [player.id]);
    player.energy = 10;
  }

  // Update wallet address if provided and not yet saved
  const walletAddress = req.headers.get('x-wallet-address');
  if (walletAddress && !player.wallet_address) {
    await query('UPDATE players SET wallet_address = $1 WHERE id = $2', [walletAddress, player.id]);
    player.wallet_address = walletAddress;
  }

  return NextResponse.json({ player, creatures: creaturesRes.rows });
}

// POST /api/player - Crear nuevo jugador + huevos iniciales
export async function POST(req) {
  const privyId = req.headers.get('x-privy-id');
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  const body = await req.json();
  const { email, username, walletAddress } = body;

  // Crear jugador
  const insertRes = await query(
    'INSERT INTO players (privy_id, email, username, gems, wallet_address) VALUES ($1, $2, $3, 100, $4) RETURNING *',
    [privyId, email, username, walletAddress || null]
  );
  const player = insertRes.rows[0];

  // Dar 3 criaturas iniciales (comunes) para poder empezar a jugar
  const starterCreatures = [];
  for (let i = 0; i < 3; i++) {
    const creature = generateCreature('common', i);
    const res = await query(
      `INSERT INTO creatures (owner_id, name, rarity, types, hp, atk, def, spd, ability, attacks, img_seed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [player.id, creature.name, creature.rarity, creature.types,
       creature.hp, creature.atk, creature.def, creature.spd,
       creature.ability, JSON.stringify(creature.attacks),
       creature.imgSeed]
    );
    starterCreatures.push(res.rows[0]);
  }

  return NextResponse.json({ player, creatures: starterCreatures });
}

// ============================================
// Generador de criaturas (server-side)
// ============================================
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateCreature(rarityKey, index) {
  const pool = CREATURE_POOL[rarityKey];
  const name = pool[randInt(0, pool.length - 1)];
  const types = CREATURE_TYPES[name] || ['Fuego'];

  // Stats por rareza (match prototype ranges exactly)
  const r = RARITIES[rarityKey];

  // Generar ataques: 70% propio tipo, 20% neutro, 10% otro tipo
  const attacks = generateAttacks(types);

  // Habilidad (simplificada para server)
  const ABILITY_POOLS = {
    common: ['Furia Ardiente','Escamas Gruesas','Cicatrizacion','Velocista','Piel Dura','Golpe Critico+','Golpe Fantasma','Fortaleza Interior'],
    uncommon: ['Rabia Creciente','Voluntad de Hierro','Versatilidad','Iniciativa','Penetracion','Marca de Caza','Esporas Latentes'],
    rare: ['Rabia Creciente','Sed de Sangre','Voluntad de Hierro','Agotamiento','Caparazon Espejo','Emboscada','Reflejo Instintivo'],
    epic: ['Dualidad','Agotamiento','Aura Dominante','Nexo Vital','Eco Elemental','Fase Eterea'],
    legendary: ['Aura Dominante','Resurreccion','Dualidad','Fase Eterea','Eco Elemental','Resonancia'],
    unique: ['Aura Dominante','Dualidad','Sed de Sangre','Resurreccion','Fase Eterea','Nexo Vital'],
  };
  const abilityPool = ABILITY_POOLS[rarityKey];
  const ability = abilityPool[randInt(0, abilityPool.length - 1)];

  return {
    name,
    rarity: RARITIES[rarityKey].name,
    types,
    hp: randInt(r.hp[0], r.hp[1]),
    atk: randInt(r.atk[0], r.atk[1]),
    def: randInt(r.def[0], r.def[1]),
    spd: randInt(r.spd[0], r.spd[1]),
    ability,
    attacks,
    imgSeed: Math.random().toString(36).slice(2, 10),
  };
}

function generateAttacks(types) {
  const attacks = [];
  const used = new Set();

  // 1 STAB garantizado por cada tipo
  for (const type of types) {
    const typeAtks = ATTACKS_DB.filter(a => a.type === type && !used.has(a.name));
    if (typeAtks.length > 0) {
      const pick = typeAtks[randInt(0, typeAtks.length - 1)];
      attacks.push({ ...pick });
      used.add(pick.name);
    }
  }

  // Rellenar hasta 4 con distribución 70/20/10
  while (attacks.length < 4) {
    const roll = Math.random();
    let candidates;
    if (roll < 0.7) {
      // Propio tipo
      candidates = ATTACKS_DB.filter(a => a.type && types.includes(a.type) && !used.has(a.name));
    } else if (roll < 0.9) {
      // Neutro
      candidates = ATTACKS_DB.filter(a => a.type === null && !used.has(a.name));
    } else {
      // Otro tipo
      candidates = ATTACKS_DB.filter(a => a.type && !types.includes(a.type) && !used.has(a.name));
    }
    if (candidates.length === 0) {
      candidates = ATTACKS_DB.filter(a => !used.has(a.name));
    }
    if (candidates.length === 0) break;
    const pick = candidates[randInt(0, candidates.length - 1)];
    attacks.push({ ...pick });
    used.add(pick.name);
  }

  return attacks;
}

export { generateCreature, generateAttacks };
