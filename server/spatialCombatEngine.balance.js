// ============================================
// Test de balance: enfrenta combinaciones de ataques de ATTACKS_DB
// para detectar OPs y subpowered.
// ============================================

const { SpatialCombatEngine } = require('./spatialCombatEngine');

// Replicamos el ATTACKS_DB aquí porque está en src/lib (ESM) y no podemos
// importarlo desde Node CJS fácil. Mantén sincronizado con src/lib/gameData.js.
const ATTACKS_DB = [
  {name:'Fogonazo',type:'Fuego',power:85,accuracy:90,shape:'projectile'},
  {name:'Brasas Vivas',type:'Fuego',power:55,accuracy:100,shape:'fan_3'},
  {name:'Ignicion',type:'Fuego',power:110,accuracy:75,shape:'area'},
  {name:'Canon Abisal',type:'Agua',power:90,accuracy:85,shape:'arrow'},
  {name:'Salpicon',type:'Agua',power:50,accuracy:100,shape:'wave'},
  {name:'Tsunami',type:'Agua',power:110,accuracy:75,shape:'wave'},
  {name:'Filo Silvestre',type:'Naturaleza',power:80,accuracy:95,shape:'bounce'},
  {name:'Esporada',type:'Naturaleza',power:45,accuracy:100,shape:'area'},
  {name:'Tormenta Solar',type:'Naturaleza',power:115,accuracy:70,shape:'fan_5'},
  {name:'Electropulso',type:'Rayo',power:90,accuracy:90,shape:'wave'},
  {name:'Arco Voltaico',type:'Rayo',power:50,accuracy:100,shape:'beam'},
  {name:'Fulgor Electrico',type:'Rayo',power:120,accuracy:65,shape:'beam'},
  {name:'Sacudida Sismica',type:'Tierra',power:95,accuracy:85,shape:'wave'},
  {name:'Fango Explosivo',type:'Tierra',power:55,accuracy:100,shape:'projectile'},
  {name:'Grieta Abisal',type:'Tierra',power:120,accuracy:75,shape:'area'},
  {name:'Alud Gelido',type:'Hielo',power:85,accuracy:90,shape:'fan_5'},
  {name:'Prisma Glacial',type:'Hielo',power:70,accuracy:95,shape:'arrow'},
  {name:'Cero Absoluto',type:'Hielo',power:120,accuracy:70,shape:'area'},
  {name:'Golpe Rapido',type:null,power:45,accuracy:100,shape:'charge'},
  {name:'Arremetida',type:null,power:60,accuracy:95,shape:'charge'},
];

// Por tipo
const BY_TYPE = {};
for (const a of ATTACKS_DB) {
  const t = a.type || 'Neutro';
  if (!BY_TYPE[t]) BY_TYPE[t] = [];
  BY_TYPE[t].push(a);
}

// Genera una criatura con stats balanceados y 4 ataques de su tipo
function makeCreature(name, types, hp, atk, def, spd) {
  const primary = types[0];
  const pool = BY_TYPE[primary] || BY_TYPE['Neutro'];
  // Tomar hasta 3 de su tipo + 1 neutro para variedad
  const ofType = pool.slice(0, 3);
  const neutral = (BY_TYPE['Neutro'] || []).slice(0, 1);
  const attacks = [...ofType, ...neutral].slice(0, 4);
  // Si faltan, rellenar con cualquiera
  while (attacks.length < 4) attacks.push(ATTACKS_DB[0]);
  return {
    name, types, rarity: 'Rara',
    hp, atk, def, spd,
    ability: 'Ninguna',
    attacks: attacks.map(a => ({...a})),
  };
}

// 6 criaturas con STATS IDÉNTICAS (para que la diferencia esté solo en
// tipo + shapes, no en stats brutos). Esto aísla el efecto del balance shape.
const STD = { hp: 290, atk: 65, def: 50, spd: 65 };
const CREATURES = {
  Fuego:      makeCreature('Pyrotic',     ['Fuego'], STD.hp, STD.atk, STD.def, STD.spd),
  Agua:       makeCreature('Hydroclaw',   ['Agua'], STD.hp, STD.atk, STD.def, STD.spd),
  Naturaleza: makeCreature('Verdant',     ['Naturaleza'], STD.hp, STD.atk, STD.def, STD.spd),
  Rayo:       makeCreature('Voltaris',    ['Rayo'], STD.hp, STD.atk, STD.def, STD.spd),
  Tierra:     makeCreature('Geomorph',    ['Tierra'], STD.hp, STD.atk, STD.def, STD.spd),
  Hielo:      makeCreature('Frostlance',  ['Hielo'], STD.hp, STD.atk, STD.def, STD.spd),
};

// ============================================
// Round-robin: cada tipo vs cada otro tipo, N batallas, ver win rates.
// ============================================
const TYPES = Object.keys(CREATURES);
const N_BATTLES = 30; // por matchup
const matrix = {}; // matrix[A][B] = { winsA, winsB, draws, durations }

for (const a of TYPES) matrix[a] = {};

console.log('\n=== Round-robin (30 batallas por matchup) ===\n');

for (let i = 0; i < TYPES.length; i++) {
  for (let j = i + 1; j < TYPES.length; j++) {
    const tA = TYPES[i];
    const tB = TYPES[j];
    let winsA = 0, winsB = 0, draws = 0, totalDur = 0;
    for (let s = 0; s < N_BATTLES; s++) {
      // Equipo A: 3 copias de criatura tipo A. Igual B.
      const team1 = [CREATURES[tA], CREATURES[tA], CREATURES[tA]];
      const team2 = [CREATURES[tB], CREATURES[tB], CREATURES[tB]];
      const r = new SpatialCombatEngine(team1, team2, { seed: s + 100 }).simulate({ collectSnapshots: false });
      totalDur += r.durationMs;
      if (r.winner === 'player1') winsA++;
      else if (r.winner === 'player2') winsB++;
      else draws++;
    }
    matrix[tA][tB] = { winsA, winsB, draws, avgDur: Math.round(totalDur / N_BATTLES / 100) / 10 };
    matrix[tB][tA] = { winsA: winsB, winsB: winsA, draws, avgDur: matrix[tA][tB].avgDur };
    const pct = Math.round((winsA / N_BATTLES) * 100);
    const flag = (pct > 75 || pct < 25) ? '⚠️' : '  ';
    console.log(`${flag} ${tA.padEnd(11)} vs ${tB.padEnd(11)} → ${winsA}/${winsB}/${draws} (${pct}%/${100-pct}%) avg ${matrix[tA][tB].avgDur}s`);
  }
}

// Resumen por tipo: win rate global
console.log('\n=== WIN RATE GLOBAL POR TIPO ===\n');
const summary = {};
for (const t of TYPES) {
  let wins = 0, total = 0;
  for (const o of TYPES) {
    if (o === t) continue;
    if (matrix[t][o]) {
      wins += matrix[t][o].winsA;
      total += matrix[t][o].winsA + matrix[t][o].winsB + matrix[t][o].draws;
    }
  }
  summary[t] = { wins, total, pct: total > 0 ? Math.round((wins / total) * 100) : 0 };
}
const sorted = Object.entries(summary).sort((a, b) => b[1].pct - a[1].pct);
for (const [t, s] of sorted) {
  const pct = s.pct;
  const flag = pct > 65 ? '🔥 OP' : pct < 35 ? '❄️ Subpow' : '✓';
  console.log(`${flag.padEnd(10)} ${t.padEnd(12)} ${pct}% wins  (${s.wins}/${s.total})`);
}

// Test específico: tropa con ataques OP vs tropa con ataques mid
console.log('\n=== TEST OP CHECK: ¿algún ataque domina? ===\n');
// Tropa con ULTs (poder 110+) vs tropa con ataques mid (60-90)
const ULT_ATTACKS = ATTACKS_DB.filter(a => a.power >= 110);
const MID_ATTACKS = ATTACKS_DB.filter(a => a.power >= 60 && a.power < 90);
console.log(`Ults: ${ULT_ATTACKS.map(a => a.name + '/' + a.shape).join(', ')}`);
console.log(`Mids: ${MID_ATTACKS.map(a => a.name + '/' + a.shape).join(', ')}`);
