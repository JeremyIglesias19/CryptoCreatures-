'use client';
import { useState, useEffect } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePlayer } from '@/hooks/usePlayer';
import { useSocket } from '@/hooks/useSocket';
import { useSolBalance } from '@/hooks/useSolBalance';
import { useTeamPresets } from '@/hooks/useTeamPresets';
import { useNotifications } from '@/hooks/useNotifications';
import CreatureCard from '@/components/CreatureCard';
import CreatureAvatar from '@/components/CreatureAvatar';
import BattleArena from '@/components/BattleArena';
import Matchmaking from '@/components/Matchmaking';
import EggShop from '@/components/EggShop';
import Bestiary from '@/components/Bestiary';
import Marketplace from '@/components/Marketplace';
import BattleHistory from '@/components/BattleHistory';
import TeamPresetsBar from '@/components/TeamPresetsBar';
import TeamAnalysisPanel from '@/components/TeamAnalysisPanel';
import NotificationBell from '@/components/NotificationBell';
import ProfileEditModal from '@/components/ProfileEditModal';
import { CollectionIcon, EggsIcon, MarketIcon, BestiaryIcon, BattleIcon, HistoryIcon, RankingIcon } from '@/components/TabIcons';
import { CREATURE_POOL, CREATURE_TYPES, ABILITIES, RARITIES, rollQuality, getRarityKey } from '@/lib/gameData';
import { useApi } from '@/lib/api';

export default function GamePage() {
  const { authenticated, logout, user } = usePrivy();
  const { ready: solanaReady, wallets: solanaWallets, createWallet: createSolanaWallet } = useSolanaWallets();
  const router = useRouter();
  const searchParams = useSearchParams();
  const api = useApi();
  const { player, creatures, loading, refetch, patchCreature, dailyRemaining, dailyLimit } = usePlayer();
  const { presets: teamPresets, createPreset, deletePreset } = useTeamPresets(user?.id);
  const { connected, authed, emit, on, socketReady } = useSocket();
  const { notifications, unread: unreadNotifs, markRead, markAllRead } = useNotifications(user?.id, on);
  const solWalletAddress = solanaWallets?.[0]?.address || player?.wallet_address || null;
  const { balance: solBalance } = useSolBalance(solWalletAddress);
  const [tab, setTab] = useState('collection');
  const [battleState, setBattleState] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState([]);
  const [sortBy, setSortBy] = useState('rarity_desc');
  const [filterRarity, setFilterRarity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailCreature, setDetailCreature] = useState(null);
  const [claimSessionId, setClaimSessionId] = useState(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  // Encontrar la criatura del avatar elegido (si existe y aún la posee el usuario)
  const avatarCreature = (player?.avatar_creature_id != null)
    ? creatures.find(c => c.id === player.avatar_creature_id)
    : null;

  // Detectar retorno desde Stripe Checkout
  useEffect(() => {
    if (!searchParams) return;
    const sess = searchParams.get('egg_session');
    const cancelled = searchParams.get('egg_cancel');
    if (sess) {
      setClaimSessionId(sess);
      setTab('eggs');
    } else if (cancelled) {
      setTab('eggs');
      // Limpiar el query param
      router.replace('/game');
    }
  }, [searchParams, router]);

  const handleClaimHandled = () => {
    setClaimSessionId(null);
    // Quitar query param de la URL sin navegar
    if (typeof window !== 'undefined' && window.location.search) {
      router.replace('/game');
    }
    refetch();
  };

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

  // --- Team presets: cargar / guardar ---
  const handleLoadPreset = (preset) => {
    const ids = Array.isArray(preset.creature_ids) ? preset.creature_ids : [];
    const valid = ids.filter(id => creatures.some(c => c.id === id));
    setSelectedTeam(valid.slice(0, 3));
  };

  const handleSavePreset = async (name, ids) => createPreset(name, ids);

  // --- Auto-pick: 3 criaturas por criterio ---
  // Calcula el overall % (promedio 4 stats) igual que rollQuality para comparar.
  const overallPct = (c) => {
    const r = RARITIES[getRarityKey(c.rarity)];
    if (!r) return 0;
    let sum = 0, count = 0;
    for (const k of ['hp', 'atk', 'def', 'spd']) {
      const range = r[k];
      if (!range) continue;
      const [min, max] = range;
      if (max <= min) continue;
      sum += Math.max(0, Math.min(1, (c[k] - min) / (max - min)));
      count++;
    }
    return count > 0 ? sum / count : 0;
  };

  const autoPick = (mode) => {
    if (creatures.length < 3) return;
    let sorted;
    switch (mode) {
      case 'atk':
        sorted = [...creatures].sort((a, b) => b.atk - a.atk);
        break;
      case 'tier':
        sorted = [...creatures].sort((a, b) => overallPct(b) - overallPct(a));
        break;
      case 'favorites': {
        const favs = creatures.filter(c => c.is_favorite);
        if (favs.length < 3) return; // no hay suficientes; botón se desactiva en UI
        sorted = favs;
        break;
      }
      default:
        return;
    }
    setSelectedTeam(sorted.slice(0, 3).map(c => c.id));
  };

  // Sorting
  const rarityOrder = { 'Unica': 6, 'Legendaria': 5, 'Epica': 4, 'Rara': 3, 'Poco Comun': 2, 'Comun': 1 };
  const sortedCreatures = [...creatures].sort((a, b) => {
    switch (sortBy) {
      case 'favorite': {
        // Favoritos primero, luego por rareza descendente
        const af = a.is_favorite ? 1 : 0;
        const bf = b.is_favorite ? 1 : 0;
        if (af !== bf) return bf - af;
        return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
      }
      case 'rarity_desc': return (rarityOrder[b.rarity] || 0) - (rarityOrder[a.rarity] || 0);
      case 'rarity_asc': return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0);
      case 'atk_desc': return b.atk - a.atk;
      case 'atk_asc': return a.atk - b.atk;
      case 'newest': return b.id - a.id;
      case 'oldest': return a.id - b.id;
      default: return 0;
    }
  });

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCreatures = sortedCreatures.filter(c => {
    if (filterRarity !== 'all' && c.rarity !== filterRarity) return false;
    if (filterType !== 'all') {
      const cTypes = Array.isArray(c.types) ? c.types : [c.types];
      if (!cTypes.includes(filterType)) return false;
    }
    if (normalizedQuery && !c.name.toLowerCase().includes(normalizedQuery)) return false;
    return true;
  });

  // Toggle favorito: optimistic — UI cambia al instante, rollback si falla la API.
  const handleToggleFavorite = async (creatureId) => {
    const current = creatures.find(c => c.id === creatureId);
    const next = !current?.is_favorite;
    patchCreature(creatureId, { is_favorite: next });
    // Actualiza también la modal si está abierta apuntando a esta criatura
    setDetailCreature(prev => (prev && prev.id === creatureId ? { ...prev, is_favorite: next } : prev));
    try {
      const res = await api(`/api/creatures/${creatureId}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: next }),
      });
      if (!res.ok) throw new Error('patch failed');
    } catch (err) {
      console.error('[Favorite] rollback:', err);
      patchCreature(creatureId, { is_favorite: !next });
      setDetailCreature(prev => (prev && prev.id === creatureId ? { ...prev, is_favorite: !next } : prev));
    }
  };

  const tabs = [
    { id: 'collection', label: 'Coleccion', Icon: CollectionIcon },
    { id: 'eggs', label: 'Huevos', Icon: EggsIcon },
    { id: 'marketplace', label: 'Mercado', Icon: MarketIcon },
    { id: 'bestiary', label: 'Bestiario', Icon: BestiaryIcon },
    { id: 'battle', label: 'Combate', Icon: BattleIcon },
    { id: 'history', label: 'Historial', Icon: HistoryIcon },
    { id: 'ranking', label: 'Ranking', Icon: RankingIcon },
  ];

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-[62px] bg-[#060612]/70 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-4 md:px-8 z-50 gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-purple-400 to-sky-400 bg-clip-text text-transparent whitespace-nowrap">
            CryptoCreatures
          </span>
          <div className="flex gap-[2px] overflow-x-auto scrollbar-hide">
            {tabs.map(t => {
              const isActive = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-[10px] text-[13px] font-medium transition-all whitespace-nowrap ${
                    isActive ? 'text-purple-400 bg-purple-500/[0.12]' : 'text-[#6666aa] hover:text-purple-300 hover:bg-purple-500/10'
                  }`}>
                  <t.Icon active={isActive} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right side: stats + CTA + user */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Streak (solo si > 0) */}
          {(player.streak_days ?? 0) > 0 && (
            <NavChip title={`${player.streak_days} día${player.streak_days === 1 ? '' : 's'} consecutivo${player.streak_days === 1 ? '' : 's'}`} color="#fb923c">
              <span>🔥</span>
              <span className="font-bold" style={{ color: '#fb923c' }}>{player.streak_days}</span>
            </NavChip>
          )}

          {/* Combates diarios */}
          <NavChip title={`Combates ranked hoy: ${dailyLimit - dailyRemaining}/${dailyLimit}`} color={dailyRemaining > 0 ? '#4ade80' : '#f87171'}>
            <span style={{ fontSize: 11 }}>⚔</span>
            <span className="font-bold" style={{ color: dailyRemaining > 0 ? '#4ade80' : '#f87171' }}>
              {dailyLimit - dailyRemaining}/{dailyLimit}
            </span>
          </NavChip>

          {/* SOL balance */}
          {solWalletAddress && (
            <NavChip title={`Wallet: ${solWalletAddress.slice(0, 4)}...${solWalletAddress.slice(-4)}`} color="#14F195">
              <span style={{ color: '#14F195', fontWeight: 900 }}>◎</span>
              <span className="font-bold text-white">
                {solBalance != null ? solBalance.toFixed(3) : '—'}
              </span>
            </NavChip>
          )}

          {/* ELO */}
          <NavChip color="#a855f7">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">ELO</span>
            <span className="font-extrabold" style={{ color: '#a855f7' }}>{player.elo}</span>
          </NavChip>

          {/* Campana de notificaciones */}
          <NotificationBell
            notifications={notifications}
            unread={unreadNotifs}
            markRead={markRead}
            markAllRead={markAllRead}
          />

          {/* Avatar + Username (clickable → abre modal de edición) */}
          <button
            onClick={() => setProfileModalOpen(true)}
            className="flex items-center gap-2 group"
            title="Editar perfil"
          >
            {avatarCreature ? (
              <CreatureAvatar
                name={avatarCreature.name}
                types={avatarCreature.types}
                rarity={avatarCreature.rarity}
                size={32}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-white text-[14px]"
                style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)' }}
              >
                {(player.username || '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-[13px] text-gray-300 group-hover:text-white font-medium hidden md:inline max-w-[120px] truncate transition">
              {player.username}
            </span>
          </button>

          {/* CTA JUGAR (ocultado si ya estás en combate) */}
          {tab !== 'battle' && (
            <button
              onClick={() => setTab('battle')}
              className="px-4 py-[7px] rounded-xl text-[13px] font-extrabold text-white flex items-center gap-1.5 transition-transform hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                boxShadow: '0 0 20px rgba(239,68,68,0.4)',
              }}
            >
              ⚔ JUGAR
            </button>
          )}

          {/* Logout */}
          <button onClick={() => { logout(); router.push('/'); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-1">Salir</button>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto pt-[82px] pb-12 px-8 relative z-[1]">

        {/* ===== COLECCION ===== */}
        {tab === 'collection' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-[30px] font-extrabold tracking-tight">
                Mi Coleccion <span className="text-[16px] text-gray-500 font-normal">({creatures.length})</span>
              </h2>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#0d0d28] border border-[#1a1a3e] rounded-xl px-4 py-2 text-[13px] text-gray-300 outline-none">
                <option value="favorite">♥ Favoritos primero</option>
                <option value="rarity_desc">Mayor rareza primero</option>
                <option value="rarity_asc">Menor rareza primero</option>
                <option value="newest">Mas recientes</option>
                <option value="oldest">Mas antiguas</option>
                <option value="atk_desc">Mayor ATK</option>
                <option value="atk_asc">Menor ATK</option>
              </select>
            </div>

            {/* Team presets bar (solo si el usuario tiene ≥3 criaturas) */}
            {creatures.length >= 3 && (
              <TeamPresetsBar
                presets={teamPresets}
                selectedTeam={selectedTeam}
                creatures={creatures}
                onLoad={handleLoadPreset}
                onSave={handleSavePreset}
                onDelete={deletePreset}
              />
            )}

            {/* Auto-pick rápido */}
            {creatures.length >= 3 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-[11px] uppercase tracking-[1.5px] text-gray-500 font-medium">Auto-pick:</span>
                <button onClick={() => autoPick('atk')}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-red-500/10 border border-red-500/20 text-red-300 hover:bg-red-500/20 transition-all">
                  Top ATK
                </button>
                <button onClick={() => autoPick('tier')}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-all">
                  Top tier
                </button>
                <button
                  onClick={() => autoPick('favorites')}
                  disabled={creatures.filter(c => c.is_favorite).length < 3}
                  title={creatures.filter(c => c.is_favorite).length < 3 ? 'Necesitas al menos 3 criaturas favoritas' : 'Elige tus 3 favoritas'}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-pink-500/10 border border-pink-500/20 text-pink-300 hover:bg-pink-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  ♥ Mis favoritas
                </button>
                {selectedTeam.length > 0 && (
                  <button onClick={() => setSelectedTeam([])}
                    className="ml-auto px-3 py-1.5 rounded-lg text-[11px] font-medium text-gray-500 hover:text-white transition-all">
                    Limpiar selección
                  </button>
                )}
              </div>
            )}

            {/* Búsqueda por nombre */}
            <div className="mb-3 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre..."
                className="w-full md:w-80 bg-[#0d0d28] border border-[#1a1a3e] rounded-xl px-4 py-2 text-[13px] text-gray-300 outline-none focus:border-purple-500/40 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute top-2 right-3 md:right-auto md:left-[300px] text-gray-500 hover:text-white text-sm"
                  aria-label="Limpiar búsqueda"
                >×</button>
              )}
            </div>

            {/* Filtros de rareza */}
            <div className="flex gap-[6px] mb-3 flex-wrap">
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

            {/* Filtros de tipo */}
            <div className="flex gap-[6px] mb-5 flex-wrap">
              {[
                { key: 'all', label: 'Todos los tipos', color: '#8b5cf6' },
                { key: 'Fuego', label: 'Fuego', color: '#ef4444' },
                { key: 'Agua', label: 'Agua', color: '#3b82f6' },
                { key: 'Naturaleza', label: 'Naturaleza', color: '#22c55e' },
                { key: 'Rayo', label: 'Rayo', color: '#eab308' },
                { key: 'Tierra', label: 'Tierra', color: '#a0845c' },
                { key: 'Hielo', label: 'Hielo', color: '#67e8f9' },
              ].map(t => {
                const active = filterType === t.key;
                return (
                  <button key={t.key} onClick={() => setFilterType(t.key)}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border"
                    style={{
                      background: active ? `${t.color}22` : 'rgba(255,255,255,0.03)',
                      borderColor: active ? `${t.color}66` : 'rgba(255,255,255,0.07)',
                      color: active ? t.color : '#6b7280',
                    }}>
                    {t.label}
                  </button>
                );
              })}
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

            {/* Análisis del equipo (solo con los 3 seleccionados) */}
            {selectedTeam.length === 3 && (
              <TeamAnalysisPanel
                team={selectedTeam
                  .map(id => creatures.find(c => c.id === id))
                  .filter(Boolean)}
              />
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
                  onToggleFavorite={() => handleToggleFavorite(c.id)}
                />
              ))}
              {filteredCreatures.length === 0 && creatures.length === 0 && (
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
              {filteredCreatures.length === 0 && creatures.length > 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="text-4xl mb-3 opacity-60">🔍</div>
                  <h3 className="text-white font-medium mb-1">Ningún resultado</h3>
                  <p className="text-gray-500 text-sm mb-4">Prueba a cambiar los filtros o limpiar la búsqueda.</p>
                  <button onClick={() => { setSearchQuery(''); setFilterRarity('all'); setFilterType('all'); }}
                    className="px-5 py-2 rounded-xl text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all">
                    Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== HUEVOS ===== */}
        {tab === 'eggs' && (
          <EggShop
            player={player}
            onPurchase={refetch}
            claimSessionId={claimSessionId}
            onClaimHandled={handleClaimHandled}
          />
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
            <Matchmaking selectedTeam={selectedTeam} creatures={creatures} emit={emit} on={on} connected={connected && authed} socketReady={socketReady} privyId={user?.id} />
          )
        )}

        {/* ===== HISTORIAL ===== */}
        {tab === 'history' && (
          <BattleHistory privyId={user?.id} />
        )}

        {/* ===== RANKING ===== */}
        {tab === 'ranking' && <RankingTab currentPlayerId={player.id} />}
      </main>

      {/* ===== CREATURE DETAIL MODAL ===== */}
      {detailCreature && (
        <CreatureDetailModal
          creature={detailCreature}
          privyId={user?.id}
          onClose={() => setDetailCreature(null)}
          onToggleFavorite={() => handleToggleFavorite(detailCreature.id)}
        />
      )}

      {/* ===== PROFILE EDIT MODAL ===== */}
      <ProfileEditModal
        player={player}
        creatures={creatures}
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}

// ============================================
// NavChip: pill compacta para stats de la navbar
// ============================================
function NavChip({ children, title, color = '#a855f7' }) {
  return (
    <div
      title={title}
      className="flex items-center gap-1.5 px-2.5 py-[5px] rounded-lg text-[12px] whitespace-nowrap"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}22`,
      }}
    >
      {children}
    </div>
  );
}

// ============================================
// Modal de detalle de criatura
// ============================================
function CreatureDetailModal({ creature, privyId, onClose, onToggleFavorite }) {
  const api = useApi();
  const types = Array.isArray(creature.types) ? creature.types : [creature.types];
  const attacks = typeof creature.attacks === 'string' ? JSON.parse(creature.attacks) : creature.attacks;
  const abilityData = ABILITIES[creature.ability] || {};
  const rarityKey = getRarityKey(creature.rarity);
  const rar = RARITIES[rarityKey];
  const [battleHistory, setBattleHistory] = useState(null); // null = cargando, [] = vacío
  const [historyError, setHistoryError] = useState(false);

  // Cargar historial de combates de esta criatura al abrir la modal
  useEffect(() => {
    if (!creature?.id || !privyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/api/creatures/${creature.id}/battles`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        if (!cancelled) setBattleHistory(data.battles || []);
      } catch (err) {
        if (!cancelled) {
          setBattleHistory([]);
          setHistoryError(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [creature?.id, privyId, api]);

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
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className="absolute top-4 right-14 w-8 h-8 rounded-full flex items-center justify-center text-base transition-all"
              style={{
                background: creature.is_favorite ? 'rgba(236,72,153,0.2)' : 'rgba(255,255,255,0.05)',
                color: creature.is_favorite ? '#f472b6' : '#9ca3af',
                border: `1px solid ${creature.is_favorite ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
              title={creature.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorita'}
              aria-label={creature.is_favorite ? 'Quitar de favoritos' : 'Marcar como favorita'}
            >
              {creature.is_favorite ? '♥' : '♡'}
            </button>
          )}
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
        <div className="px-6 pb-4">
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

        {/* Historial de combates */}
        <div className="px-6 pb-6">
          <h4 className="text-[11px] uppercase tracking-[2px] text-gray-500 font-medium mb-3">Últimos combates</h4>
          {battleHistory === null ? (
            <div className="text-[12px] text-gray-500">Cargando historial…</div>
          ) : battleHistory.length === 0 ? (
            <div className="text-[12px] text-gray-500 italic">
              {historyError ? 'No se pudo cargar el historial.' : 'Esta criatura aún no ha combatido.'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {battleHistory.map(b => {
                const win = b.result === 'win';
                const color = win ? '#22c55e' : '#ef4444';
                const bg = win ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
                const border = win ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)';
                const date = b.finishedAt ? new Date(b.finishedAt) : null;
                const dateStr = date ? date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '';
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-[12px]"
                    style={{ background: bg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-3">
                      <span className="font-bold" style={{ color }}>
                        {win ? 'Victoria' : 'Derrota'}
                      </span>
                      <span className="text-gray-400">vs {b.opponent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-[11px]">{b.turns}t</span>
                      <span className="font-mono font-bold" style={{ color }}>
                        {b.eloChange >= 0 ? '+' : ''}{b.eloChange}
                      </span>
                      <span className="text-gray-600 text-[10px]">{dateStr}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Ranking
// ============================================
const RANK_TIERS = [
  { name: 'Maestro', minElo: 1500, color: '#ef4444', glow: 'rgba(239,68,68,0.3)', icon: '👑' },
  { name: 'Diamante', minElo: 1300, color: '#67e8f9', glow: 'rgba(103,232,249,0.3)', icon: '💎' },
  { name: 'Platino', minElo: 1150, color: '#a78bfa', glow: 'rgba(167,139,250,0.25)', icon: '⚜️' },
  { name: 'Oro', minElo: 1000, color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', icon: '🏅' },
  { name: 'Plata', minElo: 850, color: '#d1d5db', glow: 'rgba(209,213,219,0.15)', icon: '🥈' },
  { name: 'Bronce', minElo: 0, color: '#d97706', glow: 'rgba(217,119,6,0.15)', icon: '🥉' },
];
function getRankTier(elo) { return RANK_TIERS.find(t => elo >= t.minElo) || RANK_TIERS[RANK_TIERS.length - 1]; }

function RankingTab({ currentPlayerId }) {
  const router = useRouter();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ranking').then(r => r.json()).then(data => { setRankings(data.players || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const goToProfile = (username) => {
    if (!username) return;
    router.push(`/profile/${encodeURIComponent(username)}`);
  };

  if (loading) return <div className="text-center py-12 text-gray-400 animate-pulse">Cargando ranking...</div>;

  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);
  // Podium order: 2nd, 1st, 3rd (visual layout: silver-gold-bronze)
  // With 2 players: 1st on left (taller), 2nd on right
  // With 3 players: 2nd left, 1st center, 3rd right
  let podiumOrder, podiumHeights, podiumColors, podiumLabels, podiumGlows;
  if (top3.length >= 3) {
    podiumOrder = [top3[1], top3[0], top3[2]];
    podiumHeights = [140, 180, 110];
    podiumColors = ['#d1d5db', '#fbbf24', '#d97706'];
    podiumLabels = ['2°', '1°', '3°'];
    podiumGlows = ['rgba(209,213,219,0.15)', 'rgba(251,191,36,0.3)', 'rgba(217,119,6,0.15)'];
  } else if (top3.length === 2) {
    podiumOrder = [top3[0], top3[1]];
    podiumHeights = [180, 140];
    podiumColors = ['#fbbf24', '#d1d5db'];
    podiumLabels = ['1°', '2°'];
    podiumGlows = ['rgba(251,191,36,0.3)', 'rgba(209,213,219,0.15)'];
  } else {
    podiumOrder = [top3[0]];
    podiumHeights = [180];
    podiumColors = ['#fbbf24'];
    podiumLabels = ['1°'];
    podiumGlows = ['rgba(251,191,36,0.3)'];
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        @keyframes rk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes rk-glow { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes rk-slide { from { opacity:0; transform:translateY(15px); } to { opacity:1; transform:translateY(0); } }
        @keyframes rk-crown { 0%,100% { transform: rotate(-5deg) scale(1); } 50% { transform: rotate(5deg) scale(1.1); } }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36, animation: 'rk-slide 0.5s ease-out' }}>
        <div style={{ fontSize: 42, marginBottom: 8, animation: 'rk-float 3s ease-in-out infinite' }}>🏆</div>
        <h2 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px', margin: '0 0 6px 0',
          background: 'linear-gradient(135deg, #fbbf24, #f59e0b, #d97706)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>Ranking Global</h2>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Compite y sube en la clasificacion</p>
      </div>

      {/* Podium - Top 3 */}
      {top3.length >= 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16,
          marginBottom: 36, padding: '0 20px', animation: 'rk-slide 0.6s ease-out',
        }}>
          {podiumOrder.map((p, i) => {
            if (!p) return null;
            const tier = getRankTier(p.elo);
            const isMe = p.id === currentPlayerId;
            const isFirst = podiumLabels[i] === '1°';
            const wr = p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
            return (
              <div key={p.id} style={{ textAlign: 'center', flex: '0 0 auto', width: isFirst ? 170 : 140 }}>
                {/* Crown for #1 */}
                {podiumLabels[i] === '1°' && (
                  <div style={{ fontSize: 32, marginBottom: 4, animation: 'rk-crown 2s ease-in-out infinite' }}>👑</div>
                )}
                {/* Player card */}
                <div style={{
                  background: isMe
                    ? 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.08))'
                    : 'linear-gradient(135deg, rgba(20,20,50,0.8), rgba(15,15,40,0.6))',
                  border: `2px solid ${isMe ? 'rgba(168,85,247,0.4)' : podiumColors[i] + '44'}`,
                  borderRadius: 20, padding: '20px 12px 16px', position: 'relative',
                  boxShadow: isFirst ? `0 0 40px ${podiumGlows[i]}, 0 8px 30px rgba(0,0,0,0.3)` : `0 4px 20px rgba(0,0,0,0.2)`,
                  animation: `rk-float ${3 + i * 0.3}s ease-in-out infinite`,
                  animationDelay: `${i * 0.15}s`,
                }}>
                  {/* Rank number */}
                  <div style={{
                    position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                    width: 28, height: 28, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${podiumColors[i]}, ${podiumColors[i]}aa)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900, color: '#000',
                    boxShadow: `0 2px 10px ${podiumColors[i]}55`,
                  }}>
                    {podiumLabels[i]}
                  </div>

                  {/* Avatar circle */}
                  <div style={{
                    width: isFirst ? 72 : 60, height: isFirst ? 72 : 60,
                    borderRadius: '50%', margin: '0 auto 10px',
                    background: `linear-gradient(135deg, ${tier.color}33, ${tier.color}11)`,
                    border: `2px solid ${tier.color}55`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isFirst ? 32 : 26,
                  }}>
                    {tier.icon}
                  </div>

                  {/* Username (clickable → perfil público) */}
                  <button
                    onClick={() => goToProfile(p.username)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, margin: '0 0 4px 0', width: '100%',
                      fontSize: 13, fontWeight: 800,
                      color: isMe ? '#c084fc' : '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                    title={`Ver perfil de ${p.username}`}
                  >
                    {p.username}
                    {isMe && <span style={{ fontSize: 9, color: '#a855f7', marginLeft: 4 }}>(TU)</span>}
                  </button>

                  {/* ELO */}
                  <p style={{
                    fontSize: isFirst ? 22 : 18, fontWeight: 900, margin: '0 0 2px 0',
                    color: podiumColors[i],
                    textShadow: `0 0 15px ${podiumColors[i]}44`,
                  }}>{p.elo}</p>

                  {/* Tier badge */}
                  <span style={{
                    display: 'inline-block', fontSize: 9, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 999,
                    background: `${tier.color}18`, color: tier.color,
                    border: `1px solid ${tier.color}30`,
                    marginBottom: 6,
                  }}>{tier.name}</span>

                  {/* Stats */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontSize: 10, color: '#6b7280' }}>
                    <span>{p.wins}V/{p.losses}D</span>
                    <span style={{ color: wr >= 50 ? '#4ade80' : '#f87171' }}>{wr}%</span>
                  </div>
                </div>

                {/* Podium base */}
                <div style={{
                  height: podiumHeights[i] * 0.35,
                  background: `linear-gradient(180deg, ${podiumColors[i]}22, ${podiumColors[i]}08)`,
                  borderLeft: `1px solid ${podiumColors[i]}22`,
                  borderRight: `1px solid ${podiumColors[i]}22`,
                  borderBottom: `2px solid ${podiumColors[i]}33`,
                  borderRadius: '0 0 12px 12px',
                  marginTop: -2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 900, color: `${podiumColors[i]}33`,
                }}>
                  {podiumLabels[i]}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rest of rankings */}
      <div style={{
        background: 'rgba(10,10,30,0.5)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 20, overflow: 'hidden',
        animation: 'rk-slide 0.7s ease-out',
      }}>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 80px',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', color: '#4b5563',
        }}>
          <span>#</span>
          <span>Jugador</span>
          <span style={{ textAlign: 'right' }}>ELO</span>
          <span style={{ textAlign: 'right' }}>V/D</span>
          <span style={{ textAlign: 'right' }}>Win Rate</span>
        </div>

        {/* Include top 3 in the list too (for reference) + rest */}
        {rankings.map((p, i) => {
          const tier = getRankTier(p.elo);
          const isMe = p.id === currentPlayerId;
          const wr = p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0;
          return (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: '60px 1fr 100px 80px 80px',
              padding: '12px 20px', alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: isMe
                ? 'linear-gradient(90deg, rgba(168,85,247,0.1), rgba(139,92,246,0.03))'
                : 'transparent',
              borderLeft: isMe ? '3px solid #a855f7' : '3px solid transparent',
              transition: 'all 0.2s ease',
              animation: `rk-slide 0.5s ease-out`,
              animationDelay: `${Math.min(i, 10) * 0.05}s`,
              animationFillMode: 'both',
            }}
            onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
            onMouseLeave={e => { if (!isMe) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Position */}
              <span style={{
                fontSize: 14, fontWeight: 800, fontFamily: 'monospace',
                color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : i === 2 ? '#d97706' : '#4b5563',
              }}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
              </span>

              {/* Player info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                {/* Tier icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: `${tier.color}15`, border: `1px solid ${tier.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>
                  {tier.icon}
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <button
                    onClick={() => goToProfile(p.username)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, margin: 0, textAlign: 'left',
                      fontSize: 13, fontWeight: 700,
                      color: isMe ? '#c084fc' : '#fff',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                    title={`Ver perfil de ${p.username}`}
                  >
                    {p.username}
                    {isMe && <span style={{ fontSize: 9, color: '#a855f7', marginLeft: 6, fontWeight: 800 }}>TU</span>}
                  </button>
                  <span style={{
                    fontSize: 9, fontWeight: 600, color: tier.color,
                    opacity: 0.7,
                  }}>{tier.name}</span>
                </div>
              </div>

              {/* ELO */}
              <span style={{
                textAlign: 'right', fontSize: 15, fontWeight: 900,
                color: tier.color,
              }}>{p.elo}</span>

              {/* W/L */}
              <span style={{
                textAlign: 'right', fontSize: 12, color: '#6b7280', fontWeight: 600,
              }}>
                <span style={{ color: '#4ade80' }}>{p.wins}</span>
                <span style={{ color: '#374151' }}>/</span>
                <span style={{ color: '#f87171' }}>{p.losses}</span>
              </span>

              {/* Win Rate */}
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: wr >= 50 ? '#4ade80' : '#f87171',
                }}>{wr}%</span>
                {/* Mini bar */}
                <div style={{
                  width: '100%', height: 3, borderRadius: 2,
                  background: 'rgba(255,255,255,0.06)', marginTop: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${wr}%`,
                    background: wr >= 50
                      ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                      : 'linear-gradient(90deg, #ef4444, #f87171)',
                  }} />
                </div>
              </div>
            </div>
          );
        })}

        {rankings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#4b5563' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>🏆</div>
            <p style={{ fontSize: 14, margin: 0 }}>Aun no hay jugadores en el ranking</p>
          </div>
        )}
      </div>
    </div>
  );
}
