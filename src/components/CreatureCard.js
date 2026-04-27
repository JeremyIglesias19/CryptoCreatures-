'use client';
import CreatureAvatar from './CreatureAvatar';
import { RARITIES, getRarityKey, rollQuality } from '@/lib/gameData';

const RARITY_COLORS = {
  'Comun': { border: 'border-gray-500/30', bg: 'bg-gray-500/5', text: 'text-gray-400', glow: '' },
  'Poco Comun': { border: 'border-green-500/30', bg: 'bg-green-500/5', text: 'text-green-400', glow: 'rarity-poco-comun' },
  'Rara': { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-400', glow: 'rarity-rara' },
  'Epica': { border: 'border-purple-500/30', bg: 'bg-purple-500/5', text: 'text-purple-400', glow: 'rarity-epica' },
  'Legendaria': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', text: 'text-yellow-400', glow: 'rarity-legendaria' },
  'Unica': { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', glow: 'rarity-unica' },
};

// Tier label + color derived from avg quality of 4 stats.
// Reutiliza la misma escala que rollQuality (SSS/SS/S/A/B/C/D).
const TIER_STYLES = {
  SSS: { bg: 'rgba(239,68,68,0.25)',   color: '#f87171', shadow: '0 0 10px rgba(239,68,68,0.5)' },
  SS:  { bg: 'rgba(245,158,11,0.22)',  color: '#fbbf24', shadow: '0 0 8px rgba(245,158,11,0.35)' },
  S:   { bg: 'rgba(168,85,247,0.22)',  color: '#c084fc', shadow: 'none' },
  A:   { bg: 'rgba(34,197,94,0.2)',    color: '#4ade80', shadow: 'none' },
  B:   { bg: 'rgba(6,182,212,0.18)',   color: '#38bdf8', shadow: 'none' },
  C:   { bg: 'rgba(99,102,241,0.18)',  color: '#818cf8', shadow: 'none' },
  D:   { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af', shadow: 'none' },
};

function computeOverallTier(creature) {
  const rarKey = getRarityKey(creature.rarity);
  const rar = RARITIES[rarKey];
  if (!rar) return null;
  const keys = ['hp', 'atk', 'def', 'spd'];
  // Calcula el percentil medio dentro del rango de la rareza
  let sum = 0;
  let count = 0;
  for (const k of keys) {
    const range = rar[k];
    if (!range) continue;
    const [min, max] = range;
    if (max <= min) continue;
    const pct = Math.max(0, Math.min(1, (creature[k] - min) / (max - min)));
    sum += pct;
    count++;
  }
  if (count === 0) return null;
  const avgPct = sum / count;
  // Reutilizamos la escala de rollQuality
  if (avgPct >= 0.97) return 'SSS';
  if (avgPct >= 0.93) return 'SS';
  if (avgPct >= 0.90) return 'S';
  if (avgPct >= 0.80) return 'A';
  if (avgPct >= 0.65) return 'B';
  if (avgPct >= 0.40) return 'C';
  return 'D';
}

const TYPE_STYLES = {
  Fuego: 'type-fuego', Agua: 'type-agua', Naturaleza: 'type-naturaleza',
  Rayo: 'type-rayo', Tierra: 'type-tierra', Hielo: 'type-hielo',
};

export default function CreatureCard({ creature, selected, onSelect, onDetail, onToggleFavorite, compact = false }) {
  const r = RARITY_COLORS[creature.rarity] || RARITY_COLORS['Comun'];
  const types = Array.isArray(creature.types) ? creature.types : [creature.types];
  const attacks = typeof creature.attacks === 'string' ? JSON.parse(creature.attacks) : creature.attacks;
  const tier = computeOverallTier(creature);
  const tierStyle = tier ? TIER_STYLES[tier] : null;
  const isFav = !!creature.is_favorite;

  return (
    <div
      onClick={onSelect}
      className={`creature-card cursor-pointer rounded-xl border ${r.border} ${r.bg} ${r.glow} p-4 relative
        ${selected ? 'ring-2 ring-purple-400 border-purple-400/50' : 'hover:border-purple-500/30'}
        transition-all`}
    >
      {/* Tier badge (esquina superior izquierda) */}
      {tier && tierStyle && (
        <div className="absolute top-2 left-2 text-[10px] font-extrabold px-1.5 py-0.5 rounded z-10 tracking-wide"
          style={{ background: tierStyle.bg, color: tierStyle.color, boxShadow: tierStyle.shadow }}
          title={`Calidad general: ${tier}`}>
          {tier}
        </div>
      )}

      {/* Favorito (esquina superior derecha, fuera del check de selección) */}
      {onToggleFavorite && !selected && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm z-10 transition-all"
          style={{
            background: isFav ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.04)',
            color: isFav ? '#f472b6' : '#6b7280',
            border: `1px solid ${isFav ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.06)'}`,
          }}
          title={isFav ? 'Quitar de favoritos' : 'Marcar como favorita'}
          aria-label={isFav ? 'Quitar de favoritos' : 'Marcar como favorita'}
        >
          {isFav ? '♥' : '♡'}
        </button>
      )}

      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-xs font-bold z-10">
          ✓
        </div>
      )}

      {/* Avatar SVG procedural */}
      <div className="w-full flex justify-center mb-3">
        <CreatureAvatar name={creature.name} types={types} rarity={creature.rarity} size={140} />
      </div>

      {/* Nombre + Rareza */}
      <h3 className="font-bold text-sm truncate">{creature.name}</h3>
      <p className={`text-xs ${r.text} mb-2`}>{creature.rarity}</p>

      {/* Tipos */}
      <div className="flex gap-1 mb-2 flex-wrap">
        {types.map(t => (
          <span key={t} className={`${TYPE_STYLES[t]} text-xs px-2 py-0.5 rounded-full`}>{t}</span>
        ))}
      </div>

      {!compact && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-400 mb-2">
            <span>HP: <span className="text-white font-medium">{creature.hp}</span></span>
            <span>ATK: <span className="text-red-400 font-medium">{creature.atk}</span></span>
            <span>DEF: <span className="text-blue-400 font-medium">{creature.def}</span></span>
            <span>SPD: <span className="text-yellow-400 font-medium">{creature.spd}</span></span>
          </div>

          {/* Habilidad */}
          <div className="text-xs bg-dark-900/50 rounded-md px-2 py-1 text-purple-300 truncate mb-2">
            ★ {creature.ability}
          </div>

          {/* Ataques */}
          <div className="flex flex-wrap gap-1 mb-2">
            {attacks?.map(a => (
              <span key={a.name} className="text-[10px] bg-dark-900/30 px-1.5 py-0.5 rounded text-gray-400 border border-white/5">
                {a.name}
              </span>
            ))}
          </div>

          {/* Detail button */}
          {onDetail && (
            <button onClick={(e) => { e.stopPropagation(); onDetail(); }}
              className="w-full py-1.5 rounded-lg text-[11px] font-medium text-gray-500 bg-white/[0.03] border border-white/[0.06] hover:text-purple-300 hover:border-purple-500/20 transition-all">
              Ver detalle
            </button>
          )}
        </>
      )}
    </div>
  );
}
