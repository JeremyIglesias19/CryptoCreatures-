'use client';
import { useState } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { CREATURE_POOL, CREATURE_TYPES, ABILITIES } from '@/lib/gameData';

const TYPE_COLORS = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};

const RARITY_META = {
  common: { label: 'Comun', color: '#9ca3af' },
  uncommon: { label: 'Poco Comun', color: '#22c55e' },
  rare: { label: 'Rara', color: '#3b82f6' },
  epic: { label: 'Epica', color: '#a855f7' },
  legendary: { label: 'Legendaria', color: '#eab308' },
  unique: { label: 'Unica', color: '#ef4444' },
};

export default function Bestiary({ creatures }) {
  const [filter, setFilter] = useState('all'); // all | discovered | undiscovered
  const [rarityFilter, setRarityFilter] = useState('all');

  // Build full bestiary from CREATURE_POOL
  const allCreatures = [];
  for (const [rarityKey, names] of Object.entries(CREATURE_POOL)) {
    const meta = RARITY_META[rarityKey];
    for (const name of names) {
      const types = CREATURE_TYPES[name] || ['???'];
      const discovered = creatures.some(c => c.name === name);
      allCreatures.push({ name, types, rarity: meta.label, rarityKey, rarityColor: meta.color, discovered });
    }
  }

  const discoveredCount = allCreatures.filter(c => c.discovered).length;
  const totalCount = allCreatures.length;
  const progressPct = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

  // Filter
  let filtered = allCreatures;
  if (filter === 'discovered') filtered = filtered.filter(c => c.discovered);
  if (filter === 'undiscovered') filtered = filtered.filter(c => !c.discovered);
  if (rarityFilter !== 'all') filtered = filtered.filter(c => c.rarityKey === rarityFilter);

  return (
    <div>
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-[30px] font-extrabold tracking-tight mb-2">
          Bestiario <span className="bg-gradient-to-r from-purple-400 to-sky-400 bg-clip-text text-transparent">CryptoCreatures</span>
        </h2>
        <p className="text-gray-500 text-sm mb-6">Descubre las {totalCount} criaturas del universo. Abre huevos para completar tu enciclopedia.</p>

        {/* Progress bar */}
        <div className="max-w-md mx-auto">
          <div className="flex justify-between text-[12px] text-gray-400 mb-1">
            <span>{discoveredCount} / {totalCount} descubiertas</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-1000"
              style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #7c3aed, #38bdf8)' }} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-[6px] mb-3 flex-wrap justify-center">
        {['all', 'discovered', 'undiscovered'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
              filter === f ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/[0.03] border-white/[0.07] text-gray-500 hover:text-purple-300'
            }`}>
            {f === 'all' ? 'Todas' : f === 'discovered' ? 'Descubiertas' : 'Sin descubrir'}
          </button>
        ))}
      </div>
      <div className="flex gap-[6px] mb-6 flex-wrap justify-center">
        {['all', ...Object.keys(RARITY_META)].map(r => (
          <button key={r} onClick={() => setRarityFilter(r)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
              rarityFilter === r ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/[0.03] border-white/[0.07] text-gray-500 hover:text-purple-300'
            }`}>
            {r === 'all' ? 'Todas' : RARITY_META[r]?.label || r}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map(c => (
          <div key={c.name}
            className={`rounded-2xl border p-3 text-center transition-all ${
              c.discovered
                ? 'bg-white/[0.03] border-white/[0.07] hover:border-purple-500/30 hover:translate-y-[-4px]'
                : 'bg-black/20 border-white/[0.04] opacity-50'
            }`}>
            {c.discovered ? (
              <>
                <div className="flex justify-center">
                  <CreatureAvatar name={c.name} types={c.types} rarity={c.rarity} size={100} />
                </div>
                <h4 className="text-[13px] font-bold text-white mt-2 truncate">{c.name}</h4>
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                  style={{ background: c.rarityColor + '22', color: c.rarityColor }}>
                  {c.rarity}
                </span>
                <div className="flex justify-center gap-1 mt-1">
                  {c.types.map(t => (
                    <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{ background: (TYPE_COLORS[t] || '#888') + '22', color: TYPE_COLORS[t] || '#888' }}>
                      {t}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="w-[100px] h-[100px] mx-auto rounded-xl bg-white/[0.03] flex items-center justify-center text-3xl text-gray-700">
                  ?
                </div>
                <h4 className="text-[13px] font-bold text-gray-600 mt-2">???</h4>
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                  style={{ background: c.rarityColor + '15', color: c.rarityColor + '88' }}>
                  {c.rarity}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">No hay criaturas que coincidan con los filtros</div>
      )}
    </div>
  );
}
