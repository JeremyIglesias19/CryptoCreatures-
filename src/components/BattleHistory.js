'use client';
import { useState, useEffect, useCallback } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { useApi } from '@/lib/api';

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};

export default function BattleHistory({ privyId }) {
  const api = useApi();
  const [battles, setBattles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalWins, setTotalWins] = useState(0);
  const [totalLosses, setTotalLosses] = useState(0);
  const [expanded, setExpanded] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/battles?page=${page}&limit=15`);
      const data = await res.json();
      setBattles(data.battles || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      // Wins/losses agregados de todas las páginas (no solo la visible)
      setTotalWins(data.totalWins || 0);
      setTotalLosses(data.totalLosses || 0);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [page, privyId, api]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Stats summary (totales reales de la DB, no de la página actual)
  const wins = totalWins;
  const losses = totalLosses;

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora mismo';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="text-[30px] font-extrabold tracking-tight mb-1">Historial de Batallas</h2>
        <p className="text-gray-500 text-sm">Tu registro de combates</p>
      </div>

      {/* Summary bar */}
      <div className="flex justify-center gap-4 mb-6">
        <div className="bg-[#0a0a20]/60 border border-white/[0.06] rounded-xl px-5 py-3 text-center">
          <p className="text-[11px] text-gray-500">Total</p>
          <p className="text-[20px] font-extrabold text-white">{total}</p>
        </div>
        <div className="bg-green-500/[0.06] border border-green-500/20 rounded-xl px-5 py-3 text-center">
          <p className="text-[11px] text-green-500">Victorias</p>
          <p className="text-[20px] font-extrabold text-green-400">{wins}</p>
        </div>
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl px-5 py-3 text-center">
          <p className="text-[11px] text-red-500">Derrotas</p>
          <p className="text-[20px] font-extrabold text-red-400">{losses}</p>
        </div>
      </div>

      {/* Battle list */}
      {loading ? (
        <div className="text-center py-12 text-purple-400 animate-pulse">Cargando historial...</div>
      ) : battles.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">⚔️</div>
          <p className="text-gray-500">No tienes batallas registradas</p>
          <p className="text-gray-600 text-[12px] mt-1">¡Ve a pelear para llenar tu historial!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {battles.map(battle => (
            <BattleRow key={battle.id} battle={battle} expanded={expanded === battle.id}
              onToggle={() => setExpanded(expanded === battle.id ? null : battle.id)}
              formatDate={formatDate} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg text-[12px] font-bold border border-white/[0.08] text-gray-400 disabled:opacity-30 hover:text-white transition">
            ← Anterior
          </button>
          <span className="text-[12px] text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-lg text-[12px] font-bold border border-white/[0.08] text-gray-400 disabled:opacity-30 hover:text-white transition">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}

// Individual battle row
function BattleRow({ battle, expanded, onToggle, formatDate }) {
  const myTeam = Array.isArray(battle.myTeam) ? battle.myTeam : [];
  const opponentTeam = Array.isArray(battle.opponentTeam) ? battle.opponentTeam : [];

  return (
    <div className={`border rounded-2xl transition-all cursor-pointer ${
      battle.won
        ? 'bg-green-500/[0.04] border-green-500/15 hover:border-green-500/30'
        : 'bg-red-500/[0.04] border-red-500/15 hover:border-red-500/30'
    }`} onClick={onToggle}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Result badge */}
        <div className={`w-[52px] h-[52px] rounded-xl flex flex-col items-center justify-center shrink-0 ${
          battle.won ? 'bg-green-500/15' : 'bg-red-500/15'
        }`}>
          <span className="text-[18px]">{battle.won ? '🏆' : '💀'}</span>
          <span className={`text-[9px] font-extrabold ${battle.won ? 'text-green-400' : 'text-red-400'}`}>
            {battle.won ? 'WIN' : 'LOSE'}
          </span>
        </div>

        {/* Battle info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[14px] font-bold text-white truncate">vs {battle.opponentName}</span>
            <span className="text-[10px] text-gray-600">ELO {battle.opponentElo}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span>⚔️ {battle.turns} turnos</span>
            <span className={`font-bold ${battle.eloChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {battle.eloChange >= 0 ? '+' : ''}{battle.eloChange} ELO
            </span>
          </div>
        </div>

        {/* Team preview (small avatars) */}
        <div className="flex -space-x-2 shrink-0">
          {myTeam.slice(0, 3).map((c, i) => {
            const types = Array.isArray(c.types) ? c.types : [c.types];
            return (
              <div key={i} className="w-[32px] h-[32px] rounded-full border-2 border-[#0c0c23] overflow-hidden">
                <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={32} />
              </div>
            );
          })}
        </div>

        {/* Time + expand */}
        <div className="text-right shrink-0">
          <p className="text-[10px] text-gray-600">{formatDate(battle.finishedAt)}</p>
          <span className={`text-[10px] text-gray-600 transition-transform inline-block ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-white/[0.05] px-4 py-4">
          <div className="grid grid-cols-2 gap-6">
            {/* My team */}
            <div>
              <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wider">Tu equipo</p>
              <div className="space-y-2">
                {myTeam.map((c, i) => {
                  const types = Array.isArray(c.types) ? c.types : [c.types];
                  const rarColor = RARITY_COLORS[c.rarity] || '#8b5cf6';
                  return (
                    <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-2">
                      <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{c.name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full"
                            style={{ background: rarColor + '22', color: rarColor }}>{c.rarity}</span>
                          {types.map(t => (
                            <span key={t} className="text-[8px] text-gray-500">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-[9px] text-gray-500">
                        <div>HP {c.hp}</div>
                        <div>ATK {c.atk}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Opponent team */}
            <div>
              <p className="text-[10px] text-gray-500 font-bold mb-2 uppercase tracking-wider">Equipo rival</p>
              <div className="space-y-2">
                {opponentTeam.map((c, i) => {
                  const types = Array.isArray(c.types) ? c.types : [c.types];
                  const rarColor = RARITY_COLORS[c.rarity] || '#8b5cf6';
                  return (
                    <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-2">
                      <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{c.name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full"
                            style={{ background: rarColor + '22', color: rarColor }}>{c.rarity}</span>
                          {types.map(t => (
                            <span key={t} className="text-[8px] text-gray-500">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-[9px] text-gray-500">
                        <div>HP {c.hp}</div>
                        <div>ATK {c.atk}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
