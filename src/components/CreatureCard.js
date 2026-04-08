'use client';
import CreatureAvatar from './CreatureAvatar';

const RARITY_COLORS = {
  'Comun': { border: 'border-gray-500/30', bg: 'bg-gray-500/5', text: 'text-gray-400', glow: '' },
  'Poco Comun': { border: 'border-green-500/30', bg: 'bg-green-500/5', text: 'text-green-400', glow: 'rarity-poco-comun' },
  'Rara': { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-400', glow: 'rarity-rara' },
  'Epica': { border: 'border-purple-500/30', bg: 'bg-purple-500/5', text: 'text-purple-400', glow: 'rarity-epica' },
  'Legendaria': { border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', text: 'text-yellow-400', glow: 'rarity-legendaria' },
  'Unica': { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', glow: 'rarity-unica' },
};

const TYPE_STYLES = {
  Fuego: 'type-fuego', Agua: 'type-agua', Naturaleza: 'type-naturaleza',
  Rayo: 'type-rayo', Tierra: 'type-tierra', Hielo: 'type-hielo',
};

export default function CreatureCard({ creature, selected, onSelect, onDetail, compact = false }) {
  const r = RARITY_COLORS[creature.rarity] || RARITY_COLORS['Comun'];
  const types = Array.isArray(creature.types) ? creature.types : [creature.types];
  const attacks = typeof creature.attacks === 'string' ? JSON.parse(creature.attacks) : creature.attacks;

  return (
    <div
      onClick={onSelect}
      className={`creature-card cursor-pointer rounded-xl border ${r.border} ${r.bg} ${r.glow} p-4 relative
        ${selected ? 'ring-2 ring-purple-400 border-purple-400/50' : 'hover:border-purple-500/30'}
        transition-all`}
    >
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
