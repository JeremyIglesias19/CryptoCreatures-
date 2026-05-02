// ============================================
// Test runner standalone para SpatialCombatEngine.
// Ejecuta varias batallas y muestra log legible por consola.
// Uso: node server/spatialCombatEngine.test.js
// ============================================

const { SpatialCombatEngine } = require('./spatialCombatEngine');

// ============================================
// Equipos de prueba con 4 ataques cada uno
// (Posición 0=wave, 1=beam, 2=area, 3=projectile)
// ============================================
function makeCreature(opts) {
  return {
    name: opts.name,
    types: opts.types,
    rarity: opts.rarity,
    hp: opts.hp, atk: opts.atk, def: opts.def, spd: opts.spd,
    ability: opts.ability || 'Ninguna',
    attacks: [
      { name: opts.attacks[0], type: opts.attackTypes[0], power: opts.power[0] || 50, accuracy: 95 },
      { name: opts.attacks[1], type: opts.attackTypes[1], power: opts.power[1] || 50, accuracy: 95 },
      { name: opts.attacks[2], type: opts.attackTypes[2], power: opts.power[2] || 50, accuracy: 95 },
      { name: opts.attacks[3], type: opts.attackTypes[3], power: opts.power[3] || 50, accuracy: 95 },
    ],
  };
}

// Equipos balanceados: mismas stats globales, distintas types/builds.
// Team A: melee fuerte (Pyron) + ranged híbrido (Aquayín) + tank/AOE (Tidalmor)
// Team B: ranged fast (Sparkis) + ranged sustain (Verdancia) + tank/AOE (Gaiaroth)
const TEAM_A = [
  makeCreature({
    name: 'Pyron', types: ['Fuego'], rarity: 'Rara',
    hp: 280, atk: 65, def: 40, spd: 70,
    attacks: ['Llamarada', 'Rayo de Fuego', 'Mar de Llamas', 'Bola de Fuego'],
    attackTypes: ['Fuego', 'Fuego', 'Fuego', 'Fuego'],
    power: [50, 55, 70, 50],
  }),
  makeCreature({
    name: 'Aquayín', types: ['Agua'], rarity: 'Rara',
    hp: 290, atk: 65, def: 50, spd: 60,
    attacks: ['Onda Acuática', 'Hidrochorro', 'Tormenta', 'Hidrobala'],
    attackTypes: ['Agua', 'Agua', 'Agua', 'Agua'],
    power: [45, 60, 65, 55],
  }),
  makeCreature({
    name: 'Tidalmor', types: ['Agua', 'Hielo'], rarity: 'Legendaria',
    hp: 400, atk: 80, def: 70, spd: 50,
    attacks: ['Frostwave', 'Rayo Helado', 'Ventisca', 'Estalactita'],
    attackTypes: ['Hielo', 'Hielo', 'Hielo', 'Hielo'],
    power: [50, 60, 75, 55],
  }),
];

const TEAM_B = [
  makeCreature({
    name: 'Verdancia', types: ['Naturaleza'], rarity: 'Rara',
    hp: 280, atk: 60, def: 45, spd: 65,
    attacks: ['Tornado Verde', 'Látigo', 'Trampa Floral', 'Hojas Cortantes'],
    attackTypes: ['Naturaleza', 'Naturaleza', 'Naturaleza', 'Naturaleza'],
    power: [45, 55, 65, 50],
  }),
  makeCreature({
    name: 'Sparkis', types: ['Rayo'], rarity: 'Rara',
    hp: 280, atk: 70, def: 40, spd: 80,
    attacks: ['Choque Eléctrico', 'Rayo Eléctrico', 'Tormenta Eléctrica', 'Esfera Voltaica'],
    attackTypes: ['Rayo', 'Rayo', 'Rayo', 'Rayo'],
    power: [45, 65, 65, 55],
  }),
  makeCreature({
    name: 'Gaiaroth', types: ['Tierra'], rarity: 'Legendaria',
    hp: 400, atk: 80, def: 80, spd: 40,
    attacks: ['Onda Sísmica', 'Lanza Piedra', 'Terremoto', 'Roca Voladora'],
    attackTypes: ['Tierra', 'Tierra', 'Tierra', 'Tierra'],
    power: [50, 55, 75, 55],
  }),
];

// ============================================
// Pretty-print del log
// ============================================
const SHAPE_EMOJI = { wave: '🌊', beam: '⚡', area: '🟪', projectile: '🎯' };

function formatLog(result) {
  console.log('\n' + '='.repeat(60));
  console.log('🏟️  BATALLA');
  console.log('='.repeat(60));
  console.log(`Duración: ${(result.durationMs / 1000).toFixed(1)}s (${result.tickCount} ticks)`);
  console.log(`Ganador: ${result.winner === 'player1' ? '🟦 Equipo 1' : result.winner === 'player2' ? '🟥 Equipo 2' : '⚪ Empate'}`);
  console.log('');

  // Filtrar log: mostrar solo eventos importantes
  for (const e of result.log) {
    const t = (e.t / 1000).toFixed(1);
    if (e.type === 'fire') {
      const sideTag = e.casterSide === 1 ? '🟦' : '🟥';
      const shape = SHAPE_EMOJI[e.shape];
      console.log(`[${t}s] ${sideTag} ${e.caster} → ${shape} ${e.attack} → ${e.target}`);
    } else if (e.type === 'hit') {
      const sideTag = e.targetSide === 1 ? '🟦' : '🟥';
      const eff = e.eff > 1 ? ' ¡SUPER EFICAZ!' : e.eff < 1 ? ' (poco eficaz)' : '';
      console.log(`[${t}s]   💥 ${sideTag} ${e.target} recibe ${e.damage} dmg → ${e.hpAfter} HP${eff}`);
    } else if (e.type === 'miss') {
      const sideTag = e.casterSide === 1 ? '🟦' : '🟥';
      console.log(`[${t}s]   💨 ${sideTag} ${e.attack} (${e.shape}) FALLÓ`);
    } else if (e.type === 'kod') {
      const sideTag = e.targetSide === 1 ? '🟦' : '🟥';
      console.log(`[${t}s]   ☠️  ${sideTag} ${e.target} KO`);
    }
  }

  console.log('');
  console.log('Estado final:');
  console.log('  🟦 Team 1:');
  for (const c of result.finalState.team1) {
    const hpBar = c.kod ? '☠️ KO' : `${c.hp}/${c.maxHp}`;
    console.log(`     - ${c.name.padEnd(12)} ${hpBar.padEnd(15)} pos(${c.x},${c.y})`);
  }
  console.log('  🟥 Team 2:');
  for (const c of result.finalState.team2) {
    const hpBar = c.kod ? '☠️ KO' : `${c.hp}/${c.maxHp}`;
    console.log(`     - ${c.name.padEnd(12)} ${hpBar.padEnd(15)} pos(${c.x},${c.y})`);
  }

  // Estadísticas
  const fires = result.log.filter(e => e.type === 'fire').length;
  const hits = result.log.filter(e => e.type === 'hit').length;
  const misses = result.log.filter(e => e.type === 'miss').length;
  const accuracy = fires > 0 ? Math.round((hits / fires) * 100) : 0;
  console.log('');
  console.log(`Estadísticas: ${fires} disparos / ${hits} hits / ${misses} miss → accuracy ${accuracy}%`);
}

// ============================================
// Run multiple battles
// ============================================
const NUM_BATTLES = 20;
const stats = { team1Wins: 0, team2Wins: 0, draws: 0, totalDuration: 0, totalFires: 0, totalHits: 0 };

for (let i = 0; i < NUM_BATTLES; i++) {
  const engine = new SpatialCombatEngine(TEAM_A, TEAM_B);
  const result = engine.simulate();

  if (i === 0) formatLog(result); // imprimir solo la primera con detalle
  stats.totalDuration += result.durationMs;
  stats.totalFires += result.log.filter(e => e.type === 'fire').length;
  stats.totalHits += result.log.filter(e => e.type === 'hit').length;
  if (result.winner === 'player1') stats.team1Wins++;
  else if (result.winner === 'player2') stats.team2Wins++;
  else stats.draws++;
}

console.log('\n' + '='.repeat(60));
console.log(`📊 RESUMEN DE ${NUM_BATTLES} BATALLAS`);
console.log('='.repeat(60));
console.log(`🟦 Team 1 wins: ${stats.team1Wins}/${NUM_BATTLES} (${Math.round(stats.team1Wins/NUM_BATTLES*100)}%)`);
console.log(`🟥 Team 2 wins: ${stats.team2Wins}/${NUM_BATTLES} (${Math.round(stats.team2Wins/NUM_BATTLES*100)}%)`);
console.log(`⚪ Empates:     ${stats.draws}/${NUM_BATTLES}`);
console.log(`Duración media: ${(stats.totalDuration / NUM_BATTLES / 1000).toFixed(1)}s`);
console.log(`Accuracy media: ${Math.round((stats.totalHits / stats.totalFires) * 100)}%`);
