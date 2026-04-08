'use client';
import { useState, useEffect } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/hooks/usePlayer';
import { useSocket } from '@/hooks/useSocket';
import CreatureCard from '@/components/CreatureCard';
import CreatureAvatar from '@/components/CreatureAvatar';
import BattleArena from '@/components/BattleArena';
import Matchmaking from '@/components/Matchmaking';
import EggShop from '@/components/EggShop';
import Bestiary from '@/components/Bestiary';
import Marketplace from '@/components/Marketplace';
import { CREATURE_POOL, CREATURE_TYPES, ABILITIES, RARITIES, rollQuality, getRarityKey } from '@/lib/gameData';

export default function GamePage() {
  const { authenticated, logout, user } = usePrivy();
  const { ready: solanaReady, wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();
  const router = useRouter();
  const { player, creatures, loading, refetch } = usePlayer();
  const { connected, authed, emit, on, socketReady } = useSocket();
  const [tab, setTab] = useState('collection');
  const [battleState, setBattleState] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [sortBy, setSortBy] = useState('rarity_desc');
  const [filterRarity, setFilterRarity] = useState('all');
  const [detailCreature, setDetailCreature] = useState(null);

  useEffect(() => {
    if (!authenticated && !loading) router.push('/');
  }, [authenticated, loading, router]);

  // Auto-create Solana wallet if user doesn't have one
  useEffect(() => {
    if (!authenticated || !user || !solanaReady) return;
    // Check if user already has a Solana embedded wallet in linkedAccounts
    const hasSolanaWallet = user.linkedAccounts?.some(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'solana'
    );
    console.log('[GamePage] Solana wallets ready:', solanaReady, 'wallets:', solanaWallets?.length, 'hasLinked:', hasSolanaWallet);
    if (solanaWallets?.length === 0 && !hasSolanaWallet && createSolanaWallet) {
      console.log('[GamePage] No Solana wallet found, creating...');
      createSolanaWallet().then((wallet) => {
        console.log('[GamePage] Solana wallet created:', wallet?.address);
      }).catch(err => {
        console.log('[GamePage] Wallet creation skipped:', err.message);
      });
    }
  }, [authenticated, user, solanaReady, solanaWallets, createSolanaWallet]);

  useEffect(() => {
    if (!on || !socketReady) return;
    console.log('[GamePage] Registering battle:start listener, socketReady:', socketReady);
    const unsub = on('battle:start', (data) => {
      console.log('[GamePage] battle:start received!', data.battleId);
      setBattleState(data);
      setTab('battle');
    });
    return () => unsub?.();
  }, [on, socketReady]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-purple-400 text-xl animate-pulse">Cargando...</div>
      </div>
    );
  }
  if (!player) return null;

  const toggleTeamMember = (creatureId) => {
    setSelectedTeam(prev => {
      if (prev.includes(creatureId)) return prev.filter(id => id !== creatureId);
      if (prev.length >= 3) return prev;
      return [...prev, creatureId];
    });
  };

  // Sorting
  const rarityOrder = { 'Unica': 6, 'Legendaria': 5, 'Epica': 4, 'Rara': 3, 'Poco Comun': 2, 'Comun': 1 };
  const sortedCreatures = [...creatures].sort((a, b) => {
    switch (sortBy) {
      case 'rarity_desc': return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
      case 'rarity_asc': return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
      case 'atk_desc': return b.atk - a.atk;
      case 'atk_asc': return a.atk - b.atk;
      case 'newest': return b.id - a.id;
      case 'oldest': return a.id - b.id;
      default: return 0;
    }
  });

  const filteredCreatures = filterRarity === 'all'
    ? sortedCreatures
    : sortedCreatures.filter(c => c.rarity === filterRarity);

  const tabs = [
    { id: 'collection', label: '🐲 Coleccion', icon: '🐲' },
    { id: 'eggs', label: '🥚 Huevos', icon: '🥚' },
    { id: 'marketplace', label: '🏪 Mercado', icon: '🏪' },
    { id: 'bestiary', label: '📖 Bestiario', icon: '📖' },
    { id: 'battle', label: '⚔️ Combate', icon: '⚔️' },
    { id: 'ranking', label: '🏆 Ranking', icon: '🏆' },
  ];

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-[62px] bg-[#060612]/70 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-4">
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-purple-400 to-sky-400 bg-clip-text text-transparent">
            CryptoCreatures
          </span>
          <div className="flex gap-[2px]">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3.5 py-[7px] rounded-[10px] text-[13px] font-medium transition-all ${
                  tab === t.id ? 'text-purple-400 bg-purple-500/[0.12]' : 'text-[#6666aa] hover:text-purple-300 hover:bg-purple-500/10'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-[13px] text-gray-400">
            <span className="text-yellow-400 font-bold">{player.gems}</span> 💎
            <span className="ml-3 text-green-400 font-bold">{player.energy}</span> ⚡
            <span className="ml-3">ELO: <span className="text-purple-400 font-extrabold">{player.elo}</span></span>
          </span>
          <span className="text-[13px] text-gray-300 font-medium">{player.username}</span>
          <button onClick={() => { logout(); router.push('/'); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors">Salir</button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto pt-[82px] pb-12 px-8 relative z-[1]">

        {/* ===== COLECCION ===== */}
        {tab === 'collection' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[30px] font-extrabold tracking-tight">
                Mi Coleccion <span className="text-[16px] text-gray-500 font-normal">({creatures.length})</span>
              </h2>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#0d0d28] border border-[#1a1a3e] rounded-xl px-4 py-2 text-[13px] text-gray-300 outline-none">
                <option value="rarity_desc">Mayor rareza primero</option>
                <option value="rarity_asc">Menor rareza primero</option>
                <option value="newest">Mas recientes</option>
                <option value="oldest">Mas antiguas</option>
                <option value="atk_desc">Mayor ATK</option>
                <option value="atk_asc">Menor ATK</option>
              </select>
            </div>

            {/* Filtros de rareza */}
            <div className="flex gap-[6px] mb-5 flex-wrap">
              {['all', 'Comun', 'Poco Comun', 'Rara', 'Epica', 'Legendaria', 'Unica'].map(r => (
                <button key={r} onClick={() => setFilterRarity(r)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                    filterRarity === r
                      ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                      : 'bg-white/[0.03] border-white/[0.07] text-gray-500 hover:border-purple-500/20 hover:text-purple-300'
                  }`}>
                  {r === 'all' ? 'Todas' : r}
                </button>
              ))}
            </div>

            {/* Team selector */}
            {selectedTeam.length > 0 && (
              <div className="bg-[#0d0d28] border border-purple-500/20 rounded-2xl p-4 mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-gray-400">Equipo:</span>
                  {selectedTeam.map(id => {
                    const c = creatures.find(cr => cr.id === id);
                    if (!c) return null;
                    const types = Array.isArray(c.types) ? c.types : [c.types];
                    return (
                      <div key={id} className="flex items-center gap-2 bg-purple-500/10 px-3 py-1 rounded-full">
                        <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={24} />
                        <span className="text-xs font-medium">{c.name}</span>
                      </div>
                    );
                  })}
                  <span className="text-xs text-gray-500">{selectedTeam.length}/3</span>
                </div>
                {selectedTeam.length === 3 && (
                  <button onClick={() => setTab('battle')}
                    className="px-6 py-2 rounded-xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                    ⚔️ Buscar Combate
                  </button>
                )}
              </div>
            )}

            {/* Grid de criaturas */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredCreatures.map(c => (
                <CreatureCard
                  key={c.id}
                  creature={c}
                  selected={selectedTeam.includes(c.id)}
                  onSelect={() => toggleTeamMember(c.id)}
                  onDetail={() => setDetailCreature(c)}
                />
              ))}
              {filteredCreatures.length === 0 && (
                <div className="col-span-full text-center py-16">
                  <div className="text-5xl mb-4">🥚</div>
                  <h3 className="text-white font-bold mb-2">Sin criaturas aun</h3>
                  <p className="text-gray-500 text-sm mb-4">Abre tu primer huevo para empezar tu coleccion</p>
                  <button onClick={() => setTab('eggs')}
                    className="px-7 py-3 rounded-3xl text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 20px rgba(124,58,237,0.35)' }}>
                    Ir a Huevos
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== HUEVOS ===== */}
        {tab === 'eggs' && (
          <EggShop player={player} onPurchase={refetch} />
        )}

        {/* ===== MARKETPLACE ===== */}
        {tab === 'marketplace' && (
          <Marketplace player={player} creatures={creatures} privyId={user?.id}
            solanaWallet={solanaWallets?.[0] || null}
            onRefetch={refetch} />
        )}

        {/* ===== BESTIARIO ===== */}
        {tab === 'bestiary' && (
          <Bestiary creatures={creatures} />
        )}

        {/* ===== COMBATE ===== */}
        {tab === 'battle' && (
          battleState ? (
            <BattleArena battleData={battleState} emit={emit} on={on} playerId={battleState.playerId || player.id} onEnd={() => { setBattleState(null); refetch(); }} />
          ) : (
            <Matchmaking selectedTeam={selectedTeam} creatures={creatures} emit={emit} on={on} connected={connected && authed} socketReady={socketReady} />
          )
        )}

        {/* ===== RANKING ===== */}
        {tab === 'ranking' && <RankingTab />}
      </main>

      {/* ===== CREATURE DETAIL MODAL ===== */}
      {detailCreature && (
        <CreatureDetailModal creature={detailCreature} onClose={() => setDetailCreature(null)} />
      )}
    </div>
  );
}

// ============================================
// Modal de detalle de criatura
// ============================================
function CreatureDetailModal({ creature, onClose }) {
  const types = Array.isArray(creature.types) ? creature.types : [creature.types];
  const attacks = typeof creature.attacks === 'string' ? JSON.parse(creature.attacks) : creature.attacks;
  const abilityData = ABILITIES[creature.ability] || {};
  const rarityKey = getRarityKey(creature.rarity);
  const rar = RARITIES[rarityKey];

  const TYPE_COLORS = {
    Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
    Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
  };
  const CAT_COLORS = {
    Ofensiva: '#ef4444', Defensiva: '#3b82f6', Velocidad: '#eab308',
    Estado: '#a855f7', Especial: '#f59e0b',
  };
  const TIER_STYLES = {
    'roll-sss': { bg: 'rgba(239,68,68,0.2)',  color: '#f87171', shadow: '0 0 8px rgba(239,68,68,0.35)' },
    'roll-ss':  { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24', shadow: '0 0 6px rgba(245,158,11,0.25)' },
    'roll-s':   { bg: 'rgba(168,85,247,0.17)', color: '#c084fc', shadow: 'none' },
    'roll-a':   { bg: 'rgba(34,197,94,0.16)',  color: '#4ade80', shadow: 'none' },
    'roll-b':   { bg: 'rgba(6,182,212,0.13)',  color: '#38bdf8', shadow: 'none' },
    'roll-c':   { bg: 'rgba(99,102,241,0.13)', color: '#818cf8', shadow: 'none' },
    'roll-d':   { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', shadow: 'none' },
  };
  const STAT_COLORS = { hp: '#22c55e', atk: '#ef4444', def: '#3b82f6', spd: '#eab308' };

  const getQuality = (statKey) => {
    if (!rar || !rar[statKey]) return null;
    return rollQuality(creature[statKey], rar[statKey][0], rar[statKey][1]);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0c0c23] border border-white/10 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="relative p-6 pb-4">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center text-lg">×</button>
          <div className="flex items-start gap-5">
            <div className="relative">
              <CreatureAvatar name={creature.name} types={types} rarity={creature.rarity} size={120} />
            </div>
            <div className="pt-2">
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold mb-2"
                style={{ background: (rar?.color || '#8b5cf6') + '22', color: rar?.color || '#8b5cf6' }}>
                {creature.rarity}
              </span>
              <h2 className="text-2xl font-extrabold text-white mb-1">{creature.name}</h2>
              <div className="flex gap-1.5">
                {types.map(t => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: (TYPE_COLORS[t] || '#8b5cf6') + '22', color: TYPE_COLORS[t] || '#8b5cf6', border: `1px solid ${(TYPE_COLORS[t] || '#8b5cf6')}33` }}>
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-gray-600 mt-2">{creature.wins || 0}V / {creature.losses || 0}D</p>
            </div>
          </div>
        </div>

        {/* Stats with tier system */}
        <div className="px-6 pb-4">
          <h4 className="text-[11px] uppercase tracking-[2px] text-gray-500 font-medium mb-3">Estadisticas</h4>
          {[
            { label: 'HP', key: 'hp' },
            { label: 'ATK', key: 'atk' },
            { label: 'DEF', key: 'def' },
            { label: 'SPD', key: 'spd' },
          ].map(s => {
            const quality = getQuality(s.key);
            const tierStyle = quality ? TIER_STYLES[quality.cls] : null;
            const min = rar?.[s.key]?.[0] || 0;
            const max = rar?.[s.key]?.[1] || 100;
            const value = creature[s.key];
            const pct = max > min ? ((value - min) / (max - min)) * 100 : 50;
            const color = STAT_COLORS[s.key];

            return (
              <div key={s.key} className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold w-7" style={{ color }}>{s.label}</span>
                    <span className="text-[15px] font-extrabold text-white">{value}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-600 font-mono">{min} — {max}</span>
                    {quality && tierStyle && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded"
                        style={{ background: tierStyle.bg, color: tierStyle.color, boxShadow: tierStyle.shadow }}>
                        {quality.label}
                      </span>
                    )}
                  </div>
                </div>
                {/* Bar with range markers */}
                <div className="relative h-[8px] bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Ataques */}
        <div className="px-6 pb-4">
          <h4 className="text-[11px] uppercase tracking-[2px] text-gray-500 font-medium mb-3">Ataques</h4>
          <div className="grid grid-cols-2 gap-2">
            {attacks?.map(a => (
              <div key={a.name} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-bold text-white">{a.name}</span>
                  <span className="text-[10px] text-gray-500">{a.power} PWR</span>
                </div>
                <div className="flex items-center gap-2">
                  {a.type && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: (TYPE_COLORS[a.type] || '#8b5cf6') + '22', color: TYPE_COLORS[a.type] }}>{a.type}</span>}
                  <span className="text-[9px] text-gray-500">{a.accuracy}% prec.</span>
                  {a.effect && <span className="text-[9px] text-yellow-400">{a.effect} {a.effectChance}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Habilidad */}
        <div className="px-6 pb-6">
          <h4 className="text-[11px] uppercase tracking-[2px] text-gray-500 font-medium mb-3">Habilidad Pasiva</h4>
          <div className="bg-[#12122a] border border-white/[0.06] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: (CAT_COLORS[abilityData.cat] || '#8b5cf6') + '22', color: CAT_COLORS[abilityData.cat] || '#8b5cf6' }}>
                {abilityData.cat || 'Especial'}
              </span>
              <span className="text-[14px] font-bold text-white">★ {creature.ability}</span>
            </div>
            <p className="text-[12px] text-gray-400 leading-relaxed">{abilityData.desc || ''}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Ranking
// ============================================
function RankingTab() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ranking').then(r => r.json()).then(data => { setRankings(data.players || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400 animate-pulse">Cargando ranking...</div>;

  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-[30px] font-extrabold tracking-tight mb-2">🏆 Ranking Global</h2>
        <p className="text-gray-500 text-sm">Compite y sube en la clasificacion</p>
      </div>
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden backdrop-blur-lg">
        <table className="w-full">
          <thead>
            <tr className="text-gray-500 text-[11px] uppercase tracking-wider border-b border-white/[0.06]">
              <th className="px-6 py-4 text-left">#</th>
              <th className="px-6 py-4 text-left">Jugador</th>
              <th className="px-6 py-4 text-right">ELO</th>
              <th className="px-6 py-4 text-right">V/D</th>
              <th className="px-6 py-4 text-right">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((p, i) => (
              <tr key={p.id} className="border-b border-white/[0.04] hover:bg-purple-500/[0.04] transition-colors">
                <td className="px-6 py-3 text-gray-400 font-mono">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </td>
                <td className="px-6 py-3 font-medium text-white">{p.username}</td>
                <td className="px-6 py-3 text-right text-purple-400 font-extrabold">{p.elo}</td>
                <td className="px-6 py-3 text-right text-gray-400">{p.wins}/{p.losses}</td>
                <td className="px-6 py-3 text-right">
                  <span className={p.wins + p.losses > 0 && p.wins / (p.wins + p.losses) > 0.5 ? 'text-green-400' : 'text-red-400'}>
                    {p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0}%
                  </span>
                </td>
              </tr>
            ))}
            {rankings.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">Aun no hay jugadores en el ranking</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
