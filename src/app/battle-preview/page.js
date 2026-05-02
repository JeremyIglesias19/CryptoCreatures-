'use client';
import { useState } from 'react';
import SpatialBattleArena from '@/components/SpatialBattleArena';
import { ATTACKS_DB } from '@/lib/gameData';

// ============================================
// /battle-preview
// Página de desarrollo para iterar visualmente el sistema de combate espacial.
// Usa criaturas con ataques REALES de ATTACKS_DB (con shapes variados).
// NO está conectada al matchmaking real, NO afecta ELO.
// ============================================

const RNG_SEEDS = [1, 7, 42, 99, 777, 12345, 31337, 99999];

// Agrupar ataques por tipo (para asignar a cada criatura los suyos + 1 neutro)
const ATTACKS_BY_TYPE = {};
for (const a of ATTACKS_DB) {
  const t = a.type || 'Neutro';
  if (!ATTACKS_BY_TYPE[t]) ATTACKS_BY_TYPE[t] = [];
  ATTACKS_BY_TYPE[t].push(a);
}

// Construye una criatura con stats + 4 ataques: 3 de su tipo principal + 1 neutro
function makeCreature(name, types, rarity, hp, atk, def, spd) {
  const primary = types[0];
  const ofType = (ATTACKS_BY_TYPE[primary] || []).slice(0, 3);
  const neutral = (ATTACKS_BY_TYPE['Neutro'] || []).slice(0, 1);
  const attacks = [...ofType, ...neutral];
  while (attacks.length < 4) attacks.push(ATTACKS_DB[0]);
  return {
    name, types, rarity,
    hp, atk, def, spd,
    ability: 'Ninguna',
    attacks: attacks.slice(0, 4).map(a => ({ ...a })),
  };
}

// 6 criaturas demo. NO tienen preferred_role hardcoded — se genera aleatorio
// en useEffect al montar (simulando lo que pasaría al abrir un huevo).
// Mismo Gaiaroth puede salir aggressive en una sesión y kiter en otra.
const BASE_TEAM_BLUE = [
  makeCreature('Infernak', ['Fuego'], 'Rara', 280, 65, 40, 70),
  makeCreature('Leviatik', ['Agua'], 'Rara', 290, 65, 50, 60),
  makeCreature('Tidalmor', ['Agua', 'Hielo'], 'Legendaria', 400, 80, 70, 50),
];

const BASE_TEAM_RED = [
  makeCreature('Sylvanox', ['Naturaleza'], 'Rara', 280, 60, 45, 65),
  makeCreature('Voltaris', ['Rayo'], 'Rara', 290, 70, 40, 80),
  makeCreature('Gaiaroth', ['Tierra'], 'Legendaria', 400, 80, 80, 40),
];

const ROLES = ['aggressive', 'kiter', 'flanker', 'hybrid'];

// Asignación al "nacer del huevo": rol preferido aleatorio sin importar especie/rareza.
// 25% probabilidad por rol. En producción se guardaría en creatures.preferred_role.
function rollPreferredRole() {
  return ROLES[Math.floor(Math.random() * ROLES.length)];
}
const ROLE_INFO = {
  aggressive: { emoji: '🛡️', label: 'Aggressive', desc: 'Avanza al cuerpo a cuerpo siempre', color: '#ef4444' },
  kiter:      { emoji: '🏹', label: 'Kiter',      desc: 'Mantiene 320px, retrocede si te acercas', color: '#67e8f9' },
  flanker:    { emoji: '⚔️', label: 'Flanker',    desc: 'Mid-range táctico, lateralea', color: '#fb923c' },
  hybrid:     { emoji: '🔄', label: 'Hybrid',     desc: 'Adapta según contexto', color: '#a855f7' },
};

// Resumen visual de los shapes que tendrá cada equipo (para la UI)
function getShapesUsed(team) {
  const shapes = new Set();
  for (const c of team) for (const a of c.attacks) shapes.add(a.shape);
  return Array.from(shapes);
}

const SHAPE_INFO = {
  wave:       { emoji: '🌊', label: 'Wave', color: '#fb923c' },
  beam:       { emoji: '⚡', label: 'Beam', color: '#67e8f9' },
  area:       { emoji: '🟪', label: 'Area', color: '#f43f5e' },
  projectile: { emoji: '🎯', label: 'Projectile', color: '#a78bfa' },
  bounce:     { emoji: '🟢', label: 'Bounce', color: '#22c55e' },
  fan_3:      { emoji: '🔱', label: 'Fan-3', color: '#a78bfa' },
  fan_5:      { emoji: '🌟', label: 'Fan-5', color: '#a78bfa' },
  arrow:      { emoji: '🏹', label: 'Arrow', color: '#fef08a' },
  charge:     { emoji: '💥', label: 'Charge', color: '#ef4444' },
};

export default function BattlePreviewPage() {
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState(1);
  const [battleKey, setBattleKey] = useState(0);
  // Preferred roles de las criaturas — generados aleatoriamente al "nacer del huevo".
  // Cada vez que pulses "🎲 Re-roll" se generan nuevos (simulando abrir huevos distintos).
  const [bluePreferred, setBluePreferred] = useState(() => BASE_TEAM_BLUE.map(rollPreferredRole));
  const [redPreferred, setRedPreferred] = useState(() => BASE_TEAM_RED.map(rollPreferredRole));
  // Roles asignados por el jugador. Inicial: el preferred_role (config óptima).
  const [blueRoles, setBlueRoles] = useState(() => bluePreferred);
  const [redRoles, setRedRoles] = useState(() => redPreferred);

  // Re-roll: simula abrir nuevos huevos. Resetea TANTO preferred como current role.
  const rerollPreferredRoles = () => {
    const newBluePref = BASE_TEAM_BLUE.map(rollPreferredRole);
    const newRedPref = BASE_TEAM_RED.map(rollPreferredRole);
    setBluePreferred(newBluePref);
    setRedPreferred(newRedPref);
    setBlueRoles(newBluePref);
    setRedRoles(newRedPref);
    setBattleKey(k => k + 1);
  };

  // Build teams con preferred_role + role aplicados
  const TEAM_BLUE = BASE_TEAM_BLUE.map((c, i) => ({
    ...c, preferred_role: bluePreferred[i], role: blueRoles[i],
  }));
  const TEAM_RED = BASE_TEAM_RED.map((c, i) => ({
    ...c, preferred_role: redPreferred[i], role: redRoles[i],
  }));

  const blueShapes = getShapesUsed(TEAM_BLUE);
  const redShapes = getShapesUsed(TEAM_RED);
  const allShapes = Array.from(new Set([...blueShapes, ...redShapes]));

  return (
    <div className="min-h-screen p-6" style={{ background: '#070716' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-[32px] font-extrabold text-white tracking-tight mb-2">
            ⚔️ Battle Preview
          </h1>
          <p className="text-[13px] text-gray-500">
            Combate espacial v2 con ataques de ATTACKS_DB · 9 shapes activos
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <label className="text-[12px] text-gray-400">
            Seed:
            <select
              value={seed}
              onChange={(e) => { setSeed(Number(e.target.value)); setBattleKey(k => k + 1); }}
              className="ml-2 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-white text-[12px]"
            >
              {RNG_SEEDS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value={Math.floor(Math.random() * 1000000)}>Random</option>
            </select>
          </label>

          <label className="text-[12px] text-gray-400">
            Velocidad:
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="ml-2 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-white text-[12px]"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </label>

          <button
            onClick={() => setBattleKey(k => k + 1)}
            className="px-3 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[12px] font-bold"
          >
            🔄 Nueva batalla
          </button>

          <button
            onClick={rerollPreferredRoles}
            title="Simula abrir huevos nuevos: cada criatura recibe un preferred_role aleatorio"
            className="px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[12px] font-bold"
          >
            🎲 Re-roll roles preferidos
          </button>
        </div>

        {/* Battle */}
        <SpatialBattleArena
          key={battleKey}
          team1={TEAM_BLUE}
          team2={TEAM_RED}
          seed={seed}
          speed={speed}
        />

        {/* Composición de equipos con selectores de rol */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <TeamCard
            label="🟦 Equipo Azul" color="#3b82f6"
            team={TEAM_BLUE} roles={blueRoles}
            onRoleChange={(idx, role) => {
              const next = [...blueRoles]; next[idx] = role; setBlueRoles(next);
              setBattleKey(k => k + 1);
            }}
          />
          <TeamCard
            label="🟥 Equipo Rojo" color="#ef4444"
            team={TEAM_RED} roles={redRoles}
            onRoleChange={(idx, role) => {
              const next = [...redRoles]; next[idx] = role; setRedRoles(next);
              setBattleKey(k => k + 1);
            }}
          />
        </div>

        {/* Leyenda de shapes (solo los usados en esta batalla) */}
        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-[11px] uppercase tracking-[1.5px] text-purple-300 font-bold mb-2">
            Shapes en esta batalla
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px]">
            {allShapes.map(s => {
              const info = SHAPE_INFO[s] || { emoji: '?', label: s, color: '#fff' };
              return (
                <div key={s} className="flex items-center gap-2 text-gray-400">
                  <span className="text-[14px]">{info.emoji}</span>
                  <span style={{ color: info.color }}>{info.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 text-center">
          <p className="text-[11px] text-gray-600">
            Ruta: <code>/battle-preview</code> · Modo desarrollo · Lote 6 Fase 3
          </p>
        </div>
      </div>
    </div>
  );
}

function TeamCard({ label, color, team, roles, onRoleChange }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}30`,
      }}
    >
      <p className="text-[11px] uppercase tracking-[1.5px] font-bold mb-3" style={{ color }}>
        {label}
      </p>
      <div className="space-y-4">
        {team.map((c, i) => (
          <div key={i} className="text-[11px] pb-3 border-b border-white/[0.04] last:border-0">
            <p className="font-bold text-white mb-1">
              {c.name} <span className="text-gray-500 font-normal">· {c.types.join('/')} · {c.rarity}</span>
            </p>
            <p className="text-gray-500 text-[10px] mb-2">
              HP {c.hp} · ATK {c.atk} · DEF {c.def} · SPD {c.spd}
            </p>

            {/* Preferred role + Selector de rol asignado */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] uppercase text-gray-600 tracking-wider">Comportamiento</p>
                {c.preferred_role && (() => {
                  const prefInfo = ROLE_INFO[c.preferred_role];
                  const isMatching = roles[i] === c.preferred_role;
                  return (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                      style={{
                        background: isMatching ? '#22c55e22' : '#f59e0b22',
                        color: isMatching ? '#86efac' : '#fbbf24',
                        border: `1px solid ${isMatching ? '#22c55e44' : '#f59e0b44'}`,
                      }}
                      title={isMatching
                        ? `Afín al rol natural (+10% daño)`
                        : `Fuera de su rol natural (${prefInfo.label}) → -5% daño`}
                    >
                      {isMatching ? '★' : '⚠️'} Natural: {prefInfo.emoji} {prefInfo.label}
                    </span>
                  );
                })()}
              </div>
              <div className="flex gap-1 flex-wrap">
                {ROLES.map(r => {
                  const info = ROLE_INFO[r];
                  const selected = roles[i] === r;
                  const isPreferred = c.preferred_role === r;
                  return (
                    <button
                      key={r}
                      onClick={() => onRoleChange(i, r)}
                      title={info.desc + (isPreferred ? ' (rol natural)' : '')}
                      className="px-2 py-1 rounded text-[10px] font-bold transition relative"
                      style={{
                        background: selected ? `${info.color}30` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? info.color : 'rgba(255,255,255,0.08)'}`,
                        color: selected ? info.color : '#9ca3af',
                      }}
                    >
                      {info.emoji} {info.label}
                      {isPreferred && <span className="absolute -top-1 -right-1 text-[10px]">★</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ataques */}
            <div className="flex flex-wrap gap-1.5">
              {c.attacks.map((a, j) => {
                const info = SHAPE_INFO[a.shape] || { emoji: '?', color: '#888' };
                return (
                  <span
                    key={j}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]"
                    style={{
                      background: `${info.color}15`,
                      border: `1px solid ${info.color}30`,
                      color: info.color,
                    }}
                    title={`${a.name} (${a.type || 'Neutro'}) · poder ${a.power} · ${a.shape}`}
                  >
                    <span>{info.emoji}</span>
                    <span>{a.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
