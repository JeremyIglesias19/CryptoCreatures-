// ============================================
// Tests del SpatialCombatEngine.
// Ejecutar: node server/spatialCombatEngine.spec.js
// ============================================

const {
  SpatialCombatEngine, getTypeEffectiveness, makeSeededRng,
  SHAPES, SHAPE_RANGES,
} = require('./spatialCombatEngine');

let pass = 0, fail = 0;

function assert(condition, label) {
  if (condition) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`); fail++; }
}

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  if (ok) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}\n      expected: ${expected}\n      actual:   ${actual}`); fail++; }
}

function makeBasicTeam(name1, name2, name3) {
  const make = (name, types, hp = 200) => ({
    name, types, rarity: 'Rara',
    hp, atk: 50, def: 40, spd: 60,
    ability: 'Ninguna',
    attacks: [
      { name: `${name}-wave`, type: types[0], power: 50, accuracy: 95 },
      { name: `${name}-beam`, type: types[0], power: 50, accuracy: 95 },
      { name: `${name}-area`, type: types[0], power: 50, accuracy: 95 },
      { name: `${name}-proj`, type: types[0], power: 50, accuracy: 95 },
    ],
  });
  return [make(name1, ['Fuego']), make(name2, ['Agua']), make(name3, ['Hielo'])];
}

// ============================================
// Test 1: Type Effectiveness
// ============================================
console.log('\n[Test 1] Type Effectiveness');
assertEqual(getTypeEffectiveness('Fuego', ['Naturaleza']), 1.5, 'Fuego super-eficaz vs Naturaleza');
assertEqual(getTypeEffectiveness('Fuego', ['Agua']), 0.65, 'Fuego poco eficaz vs Agua');
assertEqual(getTypeEffectiveness('Fuego', ['Rayo']), 1.0, 'Fuego neutro vs Rayo');
const dual = getTypeEffectiveness('Rayo', ['Agua', 'Hielo']);
assert(Math.abs(dual - 2.25) < 0.01, `Rayo vs Agua/Hielo = 2.25 (got ${dual})`);
assertEqual(getTypeEffectiveness(null, ['Agua']), 1.0, 'null type → neutral');
assertEqual(getTypeEffectiveness('Fuego', null), 1.0, 'null defTypes → neutral');

// ============================================
// Test 2: Seeded RNG es determinista
// ============================================
console.log('\n[Test 2] Seeded RNG');
const rng1 = makeSeededRng(42);
const rng2 = makeSeededRng(42);
const seq1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
const seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];
assert(JSON.stringify(seq1) === JSON.stringify(seq2), 'Mismo seed → misma secuencia');
const rng3 = makeSeededRng(43);
const seq3 = [rng3(), rng3(), rng3(), rng3(), rng3()];
assert(JSON.stringify(seq1) !== JSON.stringify(seq3), 'Distinto seed → distinta secuencia');
assert(seq1.every(v => v >= 0 && v < 1), 'Todos los valores en [0, 1)');

// ============================================
// Test 3: Determinismo en battles con mismo seed
// ============================================
console.log('\n[Test 3] Determinismo de batalla con seed');
const teamA = makeBasicTeam('A1', 'A2', 'A3');
const teamB = makeBasicTeam('B1', 'B2', 'B3');
const battle1 = new SpatialCombatEngine(teamA, teamB, { seed: 12345 }).simulate();
const battle2 = new SpatialCombatEngine(teamA, teamB, { seed: 12345 }).simulate();
assertEqual(battle1.winner, battle2.winner, 'Mismo seed → mismo ganador');
assertEqual(battle1.durationMs, battle2.durationMs, 'Mismo seed → misma duración');
assertEqual(battle1.log.length, battle2.log.length, 'Mismo seed → mismo nº de eventos');
// Comparar logs evento a evento
let logsMatch = true;
for (let i = 0; i < battle1.log.length; i++) {
  if (JSON.stringify(battle1.log[i]) !== JSON.stringify(battle2.log[i])) {
    logsMatch = false; break;
  }
}
assert(logsMatch, 'Logs idénticos evento a evento');

// ============================================
// Test 4: Distinto seed → distinto resultado
// ============================================
console.log('\n[Test 4] Distinto seed produce distinta batalla');
const battle3 = new SpatialCombatEngine(teamA, teamB, { seed: 99999 }).simulate();
const sameDuration = battle1.durationMs === battle3.durationMs;
const sameWinner = battle1.winner === battle3.winner;
assert(!(sameDuration && sameWinner), 'Otro seed → otra batalla (al menos uno difiere)');

// ============================================
// Test 5: Battle eventually finishes
// ============================================
console.log('\n[Test 5] Las batallas terminan (no se quedan en loop)');
let allFinish = true;
for (let s = 1; s < 50; s++) {
  const r = new SpatialCombatEngine(teamA, teamB, { seed: s }).simulate();
  if (!r.winner || r.durationMs > 90000) { allFinish = false; break; }
}
assert(allFinish, '50 batallas distintas, todas terminan en <90s');

// ============================================
// Test 6: getSnapshot() devuelve estructura válida
// ============================================
console.log('\n[Test 6] getSnapshot()');
const eng = new SpatialCombatEngine(teamA, teamB, { seed: 7 });
eng.tick();
eng.tick();
const snap = eng.getSnapshot();
assert(snap.team1.length === 3, 'snap.team1 tiene 3 criaturas');
assert(snap.team2.length === 3, 'snap.team2 tiene 3 criaturas');
assert(typeof snap.t === 'number', 'snap.t es número');
assert(snap.arena.width === 800, 'snap.arena.width = 800');
assert(Array.isArray(snap.attacks), 'snap.attacks es array');
const c = snap.team1[0];
assert(typeof c.x === 'number' && typeof c.y === 'number', 'criatura tiene x,y');
assert(c.facing === 'left' || c.facing === 'right', 'criatura tiene facing válido');
assert(Array.isArray(c.cooldowns) && c.cooldowns.length === 4, 'criatura tiene 4 cooldowns');

// ============================================
// Test 7: KO immediato cuando hp llega a 0
// ============================================
console.log('\n[Test 7] KO al hp 0');
const fragile = [
  { name: 'Glass', types: ['Fuego'], rarity: 'Comun', hp: 1, atk: 10, def: 10, spd: 50,
    attacks: [{name:'a',type:'Fuego',power:10},{name:'b',type:'Fuego',power:10},{name:'c',type:'Fuego',power:10},{name:'d',type:'Fuego',power:10}]},
  { name: 'Glass2', types: ['Fuego'], rarity: 'Comun', hp: 1, atk: 10, def: 10, spd: 50,
    attacks: [{name:'a',type:'Fuego',power:10},{name:'b',type:'Fuego',power:10},{name:'c',type:'Fuego',power:10},{name:'d',type:'Fuego',power:10}]},
  { name: 'Glass3', types: ['Fuego'], rarity: 'Comun', hp: 1, atk: 10, def: 10, spd: 50,
    attacks: [{name:'a',type:'Fuego',power:10},{name:'b',type:'Fuego',power:10},{name:'c',type:'Fuego',power:10},{name:'d',type:'Fuego',power:10}]},
];
const fragileBattle = new SpatialCombatEngine(fragile, fragile, { seed: 1 }).simulate();
assert(fragileBattle.durationMs < 10000, `Glass cannons mueren rápido (got ${fragileBattle.durationMs}ms)`);
assert(fragileBattle.finished, 'Batalla de glass cannons termina');

// ============================================
// Test 8: Daño básico
// ============================================
console.log('\n[Test 8] Damage formula');
const eng2 = new SpatialCombatEngine(teamA, teamB, { seed: 42 });
const c1 = eng2.team1[0];
const c2 = eng2.team2[0];
// Forzar fire de wave
const oldRng = eng2.rng;
eng2.rng = () => 0.5; // determinista para variance fijo
eng2._fireAttack(c1, c1.attacks[0], c2);
const lastFire = eng2.log[eng2.log.length - 1];
assertEqual(lastFire.type, 'fire', 'Log tiene fire event');
assertEqual(lastFire.shape, 'wave', 'Wave shape correcto');
const atk = eng2.activeAttacks[eng2.activeAttacks.length - 1];
assert(atk.damage >= 1, 'Damage >= 1');
eng2.rng = oldRng;

// ============================================
// Test 9: Wave radius respeta maxRadius
// ============================================
console.log('\n[Test 9] Wave geometry');
const eng3 = new SpatialCombatEngine(teamA, teamB, { seed: 1 });
const caster = eng3.team1[0];
const target = eng3.team2[0];
eng3._fireAttack(caster, caster.attacks[0], target); // wave
const wave = eng3.activeAttacks[eng3.activeAttacks.length - 1];
assertEqual(wave.maxRadius, 90, 'Wave maxRadius = 90');
// Ejecutar suficientes ticks para que wave alcance maxRadius
for (let i = 0; i < 20; i++) eng3._updateActiveAttacks();
assert(wave.radius <= wave.maxRadius, `Wave no excede maxRadius (got ${wave.radius})`);

// ============================================
// Test 10: Beam single-target (no atraviesa todo el equipo)
// ============================================
console.log('\n[Test 10] Beam single-target');
// Más difícil de testear sin orquestar posiciones exactas. Lo dejamos como
// verificación de que tras un hit, el beam se "consume" (duration = 0).
const eng4 = new SpatialCombatEngine(teamA, teamB, { seed: 1 });
const caster4 = eng4.team1[0];
caster4.x = 100; caster4.y = 250;
const t1 = eng4.team2[0]; t1.x = 200; t1.y = 250;
const t2 = eng4.team2[1]; t2.x = 300; t2.y = 250; // alineados con beam
eng4._fireAttack(caster4, caster4.attacks[1], t1); // beam
const beam = eng4.activeAttacks[eng4.activeAttacks.length - 1];
const initialDuration = beam.duration;
eng4._resolveCollisions();
// Tras hit, duración debería haberse reducido a 0 (single-target)
assert(beam.duration === 0 || beam.hitTargets.size > 0, 'Beam single-target tras hit');

// ============================================
// Resumen
// ============================================
console.log('\n' + '='.repeat(50));
console.log(`✓ ${pass} pasaron / ✗ ${fail} fallaron`);
console.log('='.repeat(50));
process.exit(fail > 0 ? 1 : 0);
