// ============================================
// Datos del juego compartidos entre cliente y servidor
// ============================================

export const TYPES = ['Fuego','Agua','Naturaleza','Rayo','Tierra','Hielo'];

export const TYPE_ADVANTAGE = {
  Fuego:['Naturaleza','Hielo'], Agua:['Fuego','Tierra'],
  Naturaleza:['Agua','Tierra'], Rayo:['Agua','Hielo'],
  Tierra:['Fuego','Rayo'], Hielo:['Naturaleza','Tierra']
};

export const TYPE_DISADVANTAGE = {
  Fuego:['Agua','Tierra'], Agua:['Naturaleza','Rayo'],
  Naturaleza:['Fuego','Hielo'], Rayo:['Tierra','Naturaleza'],
  Tierra:['Agua','Naturaleza'], Hielo:['Fuego','Rayo']
};

export const CREATURE_TYPES = {
  'Chispita':['Fuego'],'Gotelix':['Agua'],'Brotix':['Naturaleza'],'Voltik':['Rayo'],'Rokko':['Tierra'],'Frostik':['Hielo'],
  'Llamix':['Fuego'],'Burbulix':['Agua'],'Espinox':['Naturaleza'],'Zappix':['Rayo'],'Dunik':['Tierra'],'Copalix':['Hielo'],
  'Cenizak':['Fuego','Tierra'],'Charquix':['Agua','Naturaleza'],'Ventik':['Hielo','Rayo'],
  'Pyronix':['Fuego'],'Maretix':['Agua'],'Florix':['Naturaleza'],'Thundrak':['Rayo'],'Golemik':['Tierra'],'Glaciara':['Hielo'],
  'Magmox':['Fuego','Tierra'],'Torrentis':['Agua','Hielo'],'Espotrix':['Naturaleza','Rayo'],'Terrark':['Tierra','Naturaleza'],
  'Ignidra':['Fuego'],'Leviatik':['Agua'],'Sylvanox':['Naturaleza'],'Voltaris':['Rayo'],'Titanrok':['Tierra'],
  'Cryomantis':['Hielo','Naturaleza'],'Infernak':['Fuego','Rayo'],
  'Phoenarak':['Fuego','Hielo'],'Abyssara':['Agua','Tierra'],'Thorndrake':['Naturaleza','Rayo'],
  'Seismora':['Tierra','Hielo'],'Tempestis':['Rayo','Agua'],
  'Soldraxis':['Fuego','Rayo'],'Tidalmor':['Agua','Hielo'],'Gaiaroth':['Naturaleza','Tierra'],
  'Nexus Prime':['Rayo','Fuego'],'Abyssal Monarch':['Agua','Hielo'],'Yggdrasoul':['Naturaleza','Tierra']
};

export const CREATURE_POOL = {
  common: ['Brotix','Burbulix','Cenizak','Charquix','Chispita','Copalix','Dunik','Espinox','Frostik','Gotelix','Llamix','Rokko','Ventik','Voltik','Zappix'],
  uncommon: ['Espotrix','Florix','Glaciara','Golemik','Magmox','Maretix','Pyronix','Terrark','Thundrak','Torrentis'],
  rare: ['Cryomantis','Ignidra','Infernak','Leviatik','Sylvanox','Titanrok','Voltaris'],
  epic: ['Phoenarak','Abyssara','Thorndrake','Seismora','Tempestis'],
  legendary: ['Soldraxis','Tidalmor','Gaiaroth'],
  unique: ['Nexus Prime','Abyssal Monarch','Yggdrasoul'],
};

export const RARITIES = {
  common:    { name: 'Comun',        color: '#9ca3af', chance: 0.45, hp:[80,130],  atk:[28,48],   def:[25,45],  spd:[22,42] },
  uncommon:  { name: 'Poco Comun',   color: '#22c55e', chance: 0.28, hp:[140,195], atk:[52,75],   def:[48,70],  spd:[46,68] },
  rare:      { name: 'Rara',         color: '#3b82f6', chance: 0.17, hp:[205,270], atk:[82,108],  def:[78,102], spd:[76,98] },
  epic:      { name: 'Epica',        color: '#a855f7', chance: 0.075,hp:[280,345], atk:[115,142], def:[110,136],spd:[108,132] },
  legendary: { name: 'Legendaria',   color: '#eab308', chance: 0.0245,hp:[360,430],atk:[148,178], def:[142,170],spd:[138,165] },
  unique:    { name: 'Unica',        color: '#ef4444', chance: 0.0005,hp:[415,490],atk:[170,205], def:[163,196],spd:[158,190] },
};

// Stat tier quality based on position within rarity range
export function rollQuality(value, min, max) {
  const pct = (value - min) / (max - min);
  if (pct >= 0.97) return { label: 'SSS', cls: 'roll-sss' };
  if (pct >= 0.93) return { label: 'SS',  cls: 'roll-ss' };
  if (pct >= 0.90) return { label: 'S',   cls: 'roll-s' };
  if (pct >= 0.80) return { label: 'A',   cls: 'roll-a' };
  if (pct >= 0.65) return { label: 'B',   cls: 'roll-b' };
  if (pct >= 0.40) return { label: 'C',   cls: 'roll-c' };
  return                   { label: 'D',   cls: 'roll-d' };
}

// Get rarity key from rarity display name
export function getRarityKey(rarityName) {
  return Object.keys(RARITIES).find(k => RARITIES[k].name === rarityName) || 'common';
}

// ============================================
// Tipos y análisis de equipo (reutiliza TYPE_ADVANTAGE/TYPE_DISADVANTAGE declarados arriba).
// ============================================
export const ALL_TYPES = TYPES;

// ============================================
// Análisis de equipo
// Devuelve:
//  - attackCoverage: para cada tipo defensor, qué % de los ataques del equipo son super efectivos
//  - defenseWeakness: para cada tipo atacante, qué % de las criaturas del equipo lo reciben super efectivo
//  - statsAgg: HP total, avg ATK/DEF/SPD, tier medio (SSS-D)
// ============================================
export function analyzeTeam(team) {
  if (!Array.isArray(team) || team.length === 0) return null;

  // Ataques del equipo (flatten). Defensivo: si el JSON está corrupto lo ignoramos
  // en lugar de tirar la función entera; así la UI no se rompe si la DB devuelve raro.
  const attacks = [];
  for (const c of team) {
    let rawAttacks = c?.attacks;
    if (typeof rawAttacks === 'string') {
      try { rawAttacks = JSON.parse(rawAttacks); } catch { rawAttacks = null; }
    }
    if (Array.isArray(rawAttacks)) attacks.push(...rawAttacks);
  }

  // Cobertura ofensiva: por cada tipo enemigo, contamos cuántos ataques lo cubren bien
  const attackCoverage = {};
  for (const defType of ALL_TYPES) {
    let effective = 0;
    for (const atk of attacks) {
      if (!atk.type) continue; // ataques neutros se ignoran
      if (TYPE_ADVANTAGE[atk.type]?.includes(defType)) effective++;
    }
    attackCoverage[defType] = {
      count: effective,
      pct: attacks.length > 0 ? Math.round((effective / attacks.length) * 100) : 0,
    };
  }

  // Debilidades defensivas: por cada tipo atacante, cuántas criaturas del equipo son débiles
  const defenseWeakness = {};
  for (const atkType of ALL_TYPES) {
    let weak = 0;
    let resist = 0;
    for (const c of team) {
      const cTypes = Array.isArray(c.types) ? c.types : [c.types];
      let mult = 1;
      for (const ct of cTypes) {
        if (TYPE_ADVANTAGE[atkType]?.includes(ct)) mult *= 1.5;
        if (TYPE_DISADVANTAGE[atkType]?.includes(ct)) mult *= 0.65;
      }
      if (mult > 1) weak++;
      else if (mult < 1) resist++;
    }
    defenseWeakness[atkType] = { weak, resist, neutral: team.length - weak - resist };
  }

  // Stats agregados
  const hp = team.reduce((s, c) => s + (c.hp || 0), 0);
  const atkAvg = Math.round(team.reduce((s, c) => s + (c.atk || 0), 0) / team.length);
  const defAvg = Math.round(team.reduce((s, c) => s + (c.def || 0), 0) / team.length);
  const spdAvg = Math.round(team.reduce((s, c) => s + (c.spd || 0), 0) / team.length);

  // Tier medio: promedio de percentiles de las 4 stats dentro del rango de cada rareza
  let sumPct = 0;
  let count = 0;
  for (const c of team) {
    const rKey = getRarityKey(c.rarity);
    const r = RARITIES[rKey];
    if (!r) continue;
    for (const k of ['hp', 'atk', 'def', 'spd']) {
      const range = r[k];
      if (!range) continue;
      const [min, max] = range;
      if (max <= min) continue;
      sumPct += Math.max(0, Math.min(1, (c[k] - min) / (max - min)));
      count++;
    }
  }
  const avgPct = count > 0 ? sumPct / count : 0;
  let tierLabel = 'D';
  if (avgPct >= 0.97) tierLabel = 'SSS';
  else if (avgPct >= 0.93) tierLabel = 'SS';
  else if (avgPct >= 0.90) tierLabel = 'S';
  else if (avgPct >= 0.80) tierLabel = 'A';
  else if (avgPct >= 0.65) tierLabel = 'B';
  else if (avgPct >= 0.40) tierLabel = 'C';

  return {
    attackCoverage,
    defenseWeakness,
    statsAgg: { hp, atkAvg, defAvg, spdAvg, tier: tierLabel },
  };
}

export const ATTACKS_DB = [
  {name:'Fogonazo',type:'Fuego',power:85,accuracy:90,effect:'Quemar',effectChance:20},
  {name:'Brasas Vivas',type:'Fuego',power:55,accuracy:100,effect:null,effectChance:0},
  {name:'Ignicion',type:'Fuego',power:110,accuracy:75,effect:'Quemar',effectChance:30},
  {name:'Canon Abisal',type:'Agua',power:90,accuracy:85,effect:null,effectChance:0},
  {name:'Salpicon',type:'Agua',power:50,accuracy:100,effect:null,effectChance:0},
  {name:'Tsunami',type:'Agua',power:110,accuracy:75,effect:null,effectChance:0},
  {name:'Filo Silvestre',type:'Naturaleza',power:80,accuracy:95,effect:null,effectChance:0},
  {name:'Esporada',type:'Naturaleza',power:45,accuracy:100,effect:'Veneno',effectChance:40},
  {name:'Tormenta Solar',type:'Naturaleza',power:115,accuracy:70,effect:null,effectChance:0},
  {name:'Electropulso',type:'Rayo',power:90,accuracy:90,effect:'Paralisis',effectChance:15},
  {name:'Arco Voltaico',type:'Rayo',power:50,accuracy:100,effect:'Paralisis',effectChance:10},
  {name:'Fulgor Electrico',type:'Rayo',power:120,accuracy:65,effect:'Paralisis',effectChance:25},
  {name:'Sacudida Sismica',type:'Tierra',power:95,accuracy:85,effect:null,effectChance:0},
  {name:'Fango Explosivo',type:'Tierra',power:55,accuracy:100,effect:null,effectChance:0},
  {name:'Grieta Abisal',type:'Tierra',power:120,accuracy:75,effect:null,effectChance:0},
  {name:'Alud Gelido',type:'Hielo',power:85,accuracy:90,effect:'Congelar',effectChance:15},
  {name:'Prisma Glacial',type:'Hielo',power:70,accuracy:95,effect:'Congelar',effectChance:10},
  {name:'Cero Absoluto',type:'Hielo',power:120,accuracy:70,effect:'Congelar',effectChance:25},
  {name:'Golpe Rapido',type:null,power:45,accuracy:100,effect:null,effectChance:0},
  {name:'Arremetida',type:null,power:60,accuracy:95,effect:null,effectChance:0},
];

export const ABILITIES = {
  'Furia Ardiente': {cat:'Ofensiva',desc:'ATK +20% cuando HP < 30%'},
  'Golpe Critico+': {cat:'Ofensiva',desc:'15% prob. de dano x1.5'},
  'Versatilidad': {cat:'Ofensiva',desc:'Ataque no efectivo? El siguiente hace dano neutro'},
  'Predador': {cat:'Ofensiva',desc:'+25% dano a rivales con < 50% HP'},
  'Primer Golpe': {cat:'Ofensiva',desc:'Primer ataque hace +30% dano'},
  'Rabia Creciente': {cat:'Ofensiva',desc:'ATK +8% cada turno (max 40%)'},
  'Penetracion': {cat:'Ofensiva',desc:'Ignora 20% de DEF rival'},
  'Sed de Sangre': {cat:'Ofensiva',desc:'ATK +15% tras eliminar rival'},
  'Impetu Salvaje': {cat:'Ofensiva',desc:'Ataques con poder > 100 tienen +10% precision'},
  'Marca de Caza': {cat:'Ofensiva',desc:'Primer ataque marca al rival: +10% dano al mismo objetivo'},
  'Golpe Fantasma': {cat:'Ofensiva',desc:'Ataques sin tipo hacen +100% dano'},
  'Escamas Gruesas': {cat:'Defensiva',desc:'Reduce todo el dano recibido 10%'},
  'Cicatrizacion': {cat:'Defensiva',desc:'Recupera 5% HP al final del turno'},
  'Absorcion': {cat:'Defensiva',desc:'Ataque de su tipo = recupera 25% como HP'},
  'Escudo Natural': {cat:'Defensiva',desc:'Primer golpe recibido hace -50% dano'},
  'Piel Dura': {cat:'Defensiva',desc:'Atacante recibe 10% retroceso'},
  'Voluntad de Hierro': {cat:'Defensiva',desc:'No KO de un golpe si HP > 50%'},
  'Purificacion': {cat:'Defensiva',desc:'Estados duran 1 turno menos'},
  'Caparazon Espejo': {cat:'Defensiva',desc:'1 vez: refleja 30% dano de ataque super efectivo'},
  'Fortaleza Interior': {cat:'Defensiva',desc:'Mientras tenga estado negativo, DEF +25%'},
  'Nexo Vital': {cat:'Defensiva',desc:'Al entrar, cura 15% HP a la reserva con menos vida'},
  'Velocista': {cat:'Velocidad',desc:'SPD +30% en el primer turno'},
  'Esquiva': {cat:'Velocidad',desc:'10% de esquivar cualquier ataque'},
  'Iniciativa': {cat:'Velocidad',desc:'Siempre primero con ataques de poder < 60'},
  'Prevision': {cat:'Velocidad',desc:'-30% dano de ataques super efectivos'},
  'Impaciente': {cat:'Velocidad',desc:'SPD +15% pero precision -5%'},
  'Emboscada': {cat:'Velocidad',desc:'Al entrar tras KO aliado: +50% SPD y +15% dano en turno 1'},
  'Reflejo Instintivo': {cat:'Velocidad',desc:'Si rival usa ataque de poder > 90, actua primero'},
  'Cuerpo Toxico': {cat:'Estado',desc:'20% de envenenar al ser atacado'},
  'Aura Helada': {cat:'Estado',desc:'15% de congelar al ser atacado'},
  'Chispazo Reactivo': {cat:'Estado',desc:'20% de paralizar al ser atacado'},
  'Cuerpo Llameante': {cat:'Estado',desc:'20% de quemar al ser atacado'},
  'Anticuerpos': {cat:'Estado',desc:'No puede ser envenenado'},
  'Anticongelante': {cat:'Estado',desc:'No puede ser congelado'},
  'Esporas Latentes': {cat:'Estado',desc:'Al ser derrotada, aplica estado aleatorio al rival'},
  'Simbiosis Toxica': {cat:'Estado',desc:'Estados propios -1 turno; al curarse, rival recibe ese estado'},
  'Dualidad': {cat:'Especial',desc:'STAB potenciado: x1.5 en vez de x1.25'},
  'Agotamiento': {cat:'Especial',desc:'Rival gasta doble usos de ataque'},
  'Aura Dominante': {cat:'Especial',desc:'Rivales de menor rareza: -10% stats'},
  'Resurreccion': {cat:'Especial',desc:'Revive 1 vez con 25% HP'},
  'Eco Elemental': {cat:'Especial',desc:'Ataque super efectivo: aliado recibe +15% ATK 2 turnos'},
  'Fase Eterea': {cat:'Especial',desc:'1 vez: esquiva un ataque al 100%'},
  'Resonancia': {cat:'Especial',desc:'Si el aliado anterior compartia tipo, ATK y DEF +10%'},
};
