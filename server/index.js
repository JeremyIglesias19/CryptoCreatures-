// ============================================
// CryptoCreatures - Servidor PvP (Socket.IO)
// Auto-Battle: el servidor ejecuta la batalla,
// los clientes solo observan con animaciones.
// ============================================
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { PrivyClient } = require('@privy-io/server-auth');
const { CombatEngine } = require('./combatEngine');
const { Matchmaker } = require('./matchmaker');

const PORT = process.env.WS_PORT || 3001;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// Privy auth verification (compartido en lógica con src/lib/privyAuth.js).
// El cliente envía su access token de Privy en el evento `auth`.
// Verificamos el JWT y extraemos el userId (privy_id).
// ============================================
let privyClient = null;
function getPrivyClient() {
  if (privyClient) return privyClient;
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    console.error('[AUTH] PRIVY_APP_ID o PRIVY_APP_SECRET no están seteadas — todos los sockets fallarán');
    return null;
  }
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

async function verifyPrivyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const client = getPrivyClient();
  if (!client) return null;
  try {
    const claims = await client.verifyAuthToken(token);
    return claims.userId || null;
  } catch (err) {
    return null;
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', battles: battleManager.activeCount() }));
  } else { res.writeHead(404); res.end(); }
});

const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:3000', methods: ['GET', 'POST'] },
  pingInterval: 10000, pingTimeout: 5000,
});

// ============================================
// Rank tiers (espejo de src/app/game/page.js RANK_TIERS)
// Mantener sincronizado con el cliente si cambian los thresholds.
// ============================================
const RANK_TIERS = [
  { name: 'Maestro',  minElo: 1500 },
  { name: 'Diamante', minElo: 1300 },
  { name: 'Platino',  minElo: 1150 },
  { name: 'Oro',      minElo: 1000 },
  { name: 'Plata',    minElo: 850 },
  { name: 'Bronce',   minElo: 0 },
];
function getTierName(elo) {
  for (const t of RANK_TIERS) if (elo >= t.minElo) return t.name;
  return 'Bronce';
}

// ============================================
// Notificaciones (lado socket server)
// Inserta + emite por socket si el jugador está online.
// Cap de 50 best-effort.
// ============================================
const NOTIF_MAX_PER_PLAYER = 50;
const NOTIF_VALID_TYPES = new Set(['marketplace_sold', 'tier_up', 'record', 'system']);

async function insertNotification(playerId, { type, title, body = null, payload = {} }) {
  if (!Number.isInteger(playerId) || playerId <= 0) return null;
  if (!NOTIF_VALID_TYPES.has(type)) return null;
  if (typeof title !== 'string' || title.length === 0) return null;

  try {
    const res = await pool.query(
      `INSERT INTO notifications (player_id, type, title, body, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, type, title, body, payload, read_at, created_at`,
      [
        playerId,
        type,
        title.slice(0, 120),
        body ? String(body).slice(0, 280) : null,
        JSON.stringify(payload || {}),
      ]
    );
    // Cap best-effort
    pool.query(
      `DELETE FROM notifications
       WHERE player_id = $1
         AND id IN (
           SELECT id FROM notifications
           WHERE player_id = $1
           ORDER BY created_at DESC
           OFFSET $2
         )`,
      [playerId, NOTIF_MAX_PER_PLAYER]
    ).catch(err => console.error('[notif] cap:', err.message));

    // Push realtime al room del usuario si está conectado
    const notif = res.rows[0];
    io.to(`user:${playerId}`).emit('notif:new', notif);
    return notif;
  } catch (err) {
    console.error('[notif] insert:', err.message);
    return null;
  }
}

// ============================================
// AI Attack Selection (migrado del prototipo)
// ============================================
const TYPE_ADVANTAGE = {
  Fuego:['Naturaleza','Hielo'], Agua:['Fuego','Tierra'],
  Naturaleza:['Agua','Tierra'], Rayo:['Agua','Hielo'],
  Tierra:['Fuego','Rayo'], Hielo:['Naturaleza','Tierra']
};
const TYPE_DISADVANTAGE = {
  Fuego:['Agua','Tierra'], Agua:['Naturaleza','Rayo'],
  Naturaleza:['Fuego','Hielo'], Rayo:['Tierra','Naturaleza'],
  Tierra:['Agua','Naturaleza'], Hielo:['Fuego','Rayo']
};

function aiChooseAttack(attacker, defender) {
  const rarityIntel = {
    'Comun': 0.3, 'Poco Comun': 0.4, 'Rara': 0.55,
    'Epica': 0.7, 'Legendaria': 0.85, 'Unica': 0.95,
  };
  const intelligence = rarityIntel[attacker.rarity] || 0.5;
  const attacks = attacker.attacks || [];
  if (attacks.length === 0) return null;

  if (Math.random() > intelligence) {
    return Math.floor(Math.random() * attacks.length);
  }

  let bestIdx = 0, bestScore = -1;
  for (let i = 0; i < attacks.length; i++) {
    const atk = attacks[i];
    let score = (atk.power || 50) * ((atk.accuracy || 90) / 100);
    if (atk.type && defender.types) {
      for (const dt of defender.types) {
        if (TYPE_ADVANTAGE[atk.type]?.includes(dt)) score *= 1.8;
        if (TYPE_DISADVANTAGE[atk.type]?.includes(dt)) score *= 0.4;
      }
    }
    if (defender.currentHP < defender.maxHP * 0.3) score *= 1 + ((atk.power || 50) / 150);
    const ec = atk.effectChance || atk.effect_chance || 0;
    if (atk.effect && !defender.status && ec > 0) score *= 1.15;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
}

// ============================================
// Battle Manager
// ============================================
class BattleManager {
  constructor() {
    this.battles = new Map();
    this.playerBattle = new Map();
  }

  activeCount() { return this.battles.size; }

  createBattle(player1, player2) {
    const battleId = `battle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const engine = new CombatEngine(player1.team, player2.team);

    const state = {
      id: battleId, engine,
      player1: { ...player1 },
      player2: { ...player2 },
      turnTimer: null, turnNumber: 1,
      status: 'active', log: [],
      speed: 1, // 1=slow, 2=normal, 3=fast
    };

    this.battles.set(battleId, state);
    this.playerBattle.set(player1.id, battleId);
    this.playerBattle.set(player2.id, battleId);
    return state;
  }

  getBattle(battleId) { return this.battles.get(battleId); }
  getBattleByPlayer(playerId) {
    const bid = this.playerBattle.get(playerId);
    return bid ? this.battles.get(bid) : null;
  }

  endBattle(battleId) {
    const b = this.battles.get(battleId);
    if (!b) return;
    clearTimeout(b.turnTimer);
    this.playerBattle.delete(b.player1.id);
    this.playerBattle.delete(b.player2.id);
    this.battles.delete(battleId);
  }
}

const battleManager = new BattleManager();
const matchmaker = new Matchmaker();
const ELO_K = 32;

// Periodic matchmaking scan - matches players as ELO range expands over time
matchmaker.onMatch((match) => {
  console.log(`[MM-SCAN] Match encontrado: ${match.player1.username} vs ${match.player2.username}`);
  startMatch(match.player1, match.player2);
});
matchmaker.startPeriodicScan();

// ============================================
// Socket.IO connections
// ============================================
io.on('connection', (socket) => {
  let playerId = null;
  console.log(`[WS] Conectado: ${socket.id}`);

  socket.on('auth', async (data) => {
    try {
      // SECURITY: el cliente envía su Privy access token (JWT). Antes aceptábamos
      // el privy_id directo, lo que permitía suplantar a cualquier usuario solo
      // sabiendo su privy_id. Ahora verificamos el JWT contra Privy y extraemos
      // el userId del token verificado.
      const { token } = data || {};
      const verifiedPrivyId = await verifyPrivyToken(token);
      if (!verifiedPrivyId) {
        return socket.emit('error', { message: 'Auth inválida o expirada' });
      }

      const result = await pool.query(
        'SELECT id, username, elo FROM players WHERE privy_id = $1',
        [verifiedPrivyId]
      );
      if (result.rows.length === 0) return socket.emit('error', { message: 'Jugador no encontrado' });
      playerId = result.rows[0].id;
      socket.playerId = playerId;
      socket.playerData = result.rows[0];
      socket.privyId = verifiedPrivyId;
      // Room personal para push de notificaciones (io.to('user:123').emit(...))
      socket.join(`user:${playerId}`);
      socket.emit('auth:success', { playerId, username: result.rows[0].username });
      console.log(`[AUTH] ${result.rows[0].username} (${playerId}) autenticado`);
    } catch (err) {
      console.error('[AUTH] Error:', err);
      socket.emit('error', { message: 'Error de autenticación' });
    }
  });

  socket.on('matchmaking:join', async (data) => {
    if (!playerId) return socket.emit('error', { message: 'No autenticado' });
    const { teamIds } = data;

    try {
      // Check daily battle limit (10 per day)
      const dailyRes = await pool.query(
        `SELECT COUNT(*) FROM battles
         WHERE (player1_id = $1 OR player2_id = $1)
         AND status = 'finished'
         AND finished_at >= CURRENT_DATE`,
        [playerId]
      );
      const dailyBattles = parseInt(dailyRes.rows[0].count);
      const DAILY_LIMIT = 10;
      if (dailyBattles >= DAILY_LIMIT) {
        return socket.emit('error', { message: `Has alcanzado el límite de ${DAILY_LIMIT} batallas diarias. Vuelve mañana.` });
      }

      const creaturesResult = await pool.query(
        'SELECT * FROM creatures WHERE id = ANY($1) AND owner_id = $2', [teamIds, playerId]
      );
      if (creaturesResult.rows.length !== 3) {
        return socket.emit('error', { message: 'Selecciona exactamente 3 criaturas' });
      }

      // Fetch fresh ELO from DB (might have changed since auth)
      const freshEloRes = await pool.query('SELECT elo FROM players WHERE id = $1', [playerId]);
      const freshElo = freshEloRes.rows[0]?.elo ?? socket.playerData.elo;
      socket.playerData.elo = freshElo;

      const team = creaturesResult.rows.map(c => ({ ...c, attacks: c.attacks }));
      const entry = {
        id: playerId, socketId: socket.id,
        elo: freshElo, username: socket.playerData.username,
        team,
      };

      matchmaker.addToQueue(entry);
      socket.emit('matchmaking:searching', { position: matchmaker.queueSize() });
      console.log(`[MM] ${entry.username} en cola (ELO: ${entry.elo}, cola: ${matchmaker.queueSize()})`);

      // Try to match
      const match = matchmaker.tryMatch(entry);
      if (match) {
        console.log(`[MM] Match encontrado: ${match.player1.username} vs ${match.player2.username}`);
        startMatch(match.player1, match.player2);
      }
    } catch (err) {
      console.error('[MM] Error:', err);
      socket.emit('error', { message: 'Error al buscar partida' });
    }
  });

  socket.on('matchmaking:cancel', () => {
    if (playerId) matchmaker.removeFromQueue(playerId);
    socket.emit('matchmaking:cancelled');
  });

  // Speed control from client
  socket.on('battle:speed', (data) => {
    if (!playerId) return;
    const battle = battleManager.getBattleByPlayer(playerId);
    if (battle) battle.speed = Math.min(3, Math.max(1, data.speed || 1));
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Desconectado: ${socket.id}`);
    if (playerId) {
      matchmaker.removeFromQueue(playerId);
      const battle = battleManager.getBattleByPlayer(playerId);
      if (battle && battle.status === 'active') {
        const winnerId = battle.player1.id === playerId ? battle.player2.id : battle.player1.id;
        endBattle(battle, winnerId, 'abandon');
      }
    }
  });
});

// ============================================
// Match start → Auto-battle loop
// ============================================
function startMatch(p1, p2) {
  matchmaker.removeFromQueue(p1.id);
  matchmaker.removeFromQueue(p2.id);

  const battle = battleManager.createBattle(p1, p2);

  const p1Socket = io.sockets.sockets.get(p1.socketId);
  const p2Socket = io.sockets.sockets.get(p2.socketId);

  const commonData = { battleId: battle.id };

  console.log(`[BATTLE] p1Socket exists: ${!!p1Socket} (id: ${p1.socketId})`);
  console.log(`[BATTLE] p2Socket exists: ${!!p2Socket} (id: ${p2.socketId})`);

  if (p1Socket) {
    p1Socket.join(`battle:${battle.id}`);
    p1Socket.emit('battle:start', {
      ...commonData, side: 'player1', playerId: p1.id,
      opponent: { username: p2.username, elo: p2.elo },
      yourTeam: p1.team,
      enemyTeam: p2.team.map(c => ({ name: c.name, rarity: c.rarity, types: c.types, hp: c.hp, maxHP: c.hp, attacks: c.attacks, ability: c.ability })),
      state: getBattleState(battle),
    });
    console.log(`[BATTLE] battle:start emitted to ${p1.username}`);
  } else {
    console.error(`[BATTLE] ERROR: p1Socket NOT FOUND for ${p1.username} (socketId: ${p1.socketId})`);
  }

  if (p2Socket) {
    p2Socket.join(`battle:${battle.id}`);
    p2Socket.emit('battle:start', {
      ...commonData, side: 'player2', playerId: p2.id,
      opponent: { username: p1.username, elo: p1.elo },
      yourTeam: p2.team,
      enemyTeam: p1.team.map(c => ({ name: c.name, rarity: c.rarity, types: c.types, hp: c.hp, maxHP: c.hp, attacks: c.attacks, ability: c.ability })),
      state: getBattleState(battle),
    });
    console.log(`[BATTLE] battle:start emitted to ${p2.username}`);
  } else {
    console.error(`[BATTLE] ERROR: p2Socket NOT FOUND for ${p2.username} (socketId: ${p2.socketId})`);
  }

  console.log(`[BATTLE] ${p1.username} vs ${p2.username} — ${battle.id}`);

  // Start auto-battle loop after 1.5s (entry animations)
  battle.turnTimer = setTimeout(() => runAutoBattleTurn(battle.id), 1500);
}

// ============================================
// Auto-Battle Turn Loop
// ============================================
function runAutoBattleTurn(battleId) {
  const battle = battleManager.getBattle(battleId);
  if (!battle || battle.status !== 'active') return;

  const engine = battle.engine;
  if (engine.finished) return;

  const c1 = engine.team1[engine.active1];
  const c2 = engine.team2[engine.active2];

  // AI picks attacks
  const atkIdx1 = aiChooseAttack(c1, c2);
  const atkIdx2 = aiChooseAttack(c2, c1);

  // Si la IA no encuentra ataque viable (solo ocurre si attacks.length === 0),
  // usamos el primer ataque como fallback para evitar partidas bloqueadas.
  const action1 = { type: 'attack', attackIndex: atkIdx1 !== null ? atkIdx1 : 0 };
  const action2 = { type: 'attack', attackIndex: atkIdx2 !== null ? atkIdx2 : 0 };

  // Execute turn
  const result = engine.executeTurn(action1, action2);

  // Add attack names to events for display
  result.events.forEach(e => {
    if (e.type === 'attack' && !e.attack) {
      if (e.side === 'player1' && c1.attacks[atkIdx1]) e.attack = c1.attacks[atkIdx1].name;
      if (e.side === 'player2' && c2.attacks[atkIdx2]) e.attack = c2.attacks[atkIdx2].name;
    }
  });

  battle.log.push(result);
  battle.turnNumber++;

  // Send turn result to both players
  io.to(`battle:${battle.id}`).emit('battle:turnResult', {
    turn: battle.turnNumber - 1,
    result,
    state: getBattleState(battle),
    attacks: {
      player1: c1.attacks[atkIdx1] || null,
      player2: c2.attacks[atkIdx2] || null,
    },
  });

  // Check if battle ended
  if (result.winner) {
    const winnerId = result.winner === 'player1' ? battle.player1.id : battle.player2.id;
    endBattle(battle, winnerId, 'ko');
    return;
  }

  // Schedule next turn (speed-based delay)
  const delay = battle.speed === 3 ? 1200 : battle.speed === 2 ? 2000 : 3000;
  battle.turnTimer = setTimeout(() => runAutoBattleTurn(battleId), delay);
}

// ============================================
// End battle
// ============================================
async function endBattle(battle, winnerId, reason) {
  battle.status = 'finished';
  clearTimeout(battle.turnTimer);
  const loserId = winnerId === battle.player1.id ? battle.player2.id : battle.player1.id;

  // Fetch fresh ELO from DB for accurate calculation
  let p1Elo = battle.player1.elo;
  let p2Elo = battle.player2.elo;
  try {
    const eloRes = await pool.query('SELECT id, elo FROM players WHERE id IN ($1, $2)', [battle.player1.id, battle.player2.id]);
    for (const row of eloRes.rows) {
      if (row.id === battle.player1.id) p1Elo = row.elo;
      if (row.id === battle.player2.id) p2Elo = row.elo;
    }
  } catch {}

  const winnerElo = winnerId === battle.player1.id ? p1Elo : p2Elo;
  const loserElo = winnerId === battle.player1.id ? p2Elo : p1Elo;

  // Elo formula: higher ELO diff = less points for winning against weaker opponent
  const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const eloChange = Math.max(1, Math.round(ELO_K * (1 - expected)));

  io.to(`battle:${battle.id}`).emit('battle:end', {
    winnerId, reason, eloChange,
    player1Elo: p1Elo,
    player2Elo: p2Elo,
    state: getBattleState(battle),
  });

  try {
    // Add p1_elo and p2_elo columns to store ELO at battle time
    await pool.query(`
      INSERT INTO battles (player1_id, player2_id, winner_id, status, battle_log, player1_team, player2_team, elo_change, turns, p1_elo, p2_elo, finished_at)
      VALUES ($1, $2, $3, 'finished', $4, $5, $6, $7, $8, $9, $10, NOW())
    `, [battle.player1.id, battle.player2.id, winnerId,
        JSON.stringify(battle.log), JSON.stringify(battle.player1.team),
        JSON.stringify(battle.player2.team), eloChange, battle.turnNumber - 1,
        p1Elo, p2Elo]);
    await pool.query('UPDATE players SET elo = elo + $1, wins = wins + 1 WHERE id = $2', [eloChange, winnerId]);
    await pool.query('UPDATE players SET elo = GREATEST(0, elo - $1), losses = losses + 1 WHERE id = $2', [eloChange, loserId]);

    // Detección de tier up en el ganador. Solo notificamos si cruza thresholds hacia arriba.
    // Comparamos el tier ANTES (winnerElo) con el DESPUÉS (winnerElo + eloChange).
    try {
      const oldTier = getTierName(winnerElo);
      const newTier = getTierName(winnerElo + eloChange);
      if (oldTier !== newTier) {
        insertNotification(winnerId, {
          type: 'tier_up',
          title: `¡Subiste a ${newTier}!`,
          body: `Enhorabuena, alcanzaste ${winnerElo + eloChange} ELO.`,
          payload: { old_tier: oldTier, new_tier: newTier, elo: winnerElo + eloChange },
        }).catch(() => {});
      }
    } catch (err) { console.error('[tier-up] error:', err.message); }
  } catch (err) { console.error('[DB] Error guardando batalla:', err); }

  battleManager.endBattle(battle.id);
  console.log(`[BATTLE] Fin: ganador=${winnerId} razón=${reason} ELO±${eloChange} (winner:${winnerElo} vs loser:${loserElo})`);
}

// ============================================
// State helpers
// ============================================
function getBattleState(battle) {
  const state = battle.engine.getState();
  return {
    turn: battle.turnNumber,
    player1: {
      username: battle.player1.username, id: battle.player1.id,
      team: state.team1.map(c => ({
        name: c.name, types: c.types, rarity: c.rarity,
        currentHP: c.currentHP, maxHP: c.maxHP,
        status: c.status, isActive: c.isActive, ability: c.ability,
      })),
    },
    player2: {
      username: battle.player2.username, id: battle.player2.id,
      team: state.team2.map(c => ({
        name: c.name, types: c.types, rarity: c.rarity,
        currentHP: c.currentHP, maxHP: c.maxHP,
        status: c.status, isActive: c.isActive, ability: c.ability,
      })),
    },
    finished: state.finished,
    winner: state.winner,
  };
}

server.listen(PORT, () => {
  console.log(`🎮 CryptoCreatures PvP Server en puerto ${PORT}`);
});
