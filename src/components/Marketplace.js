'use client';
import { useState, useEffect, useCallback } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { ABILITIES, RARITIES, rollQuality, getRarityKey } from '@/lib/gameData';

const TYPE_COLORS = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};
const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};
const TIER_STYLES = {
  'roll-sss': { bg: 'rgba(239,68,68,0.2)',  color: '#f87171' },
  'roll-ss':  { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24' },
  'roll-s':   { bg: 'rgba(168,85,247,0.17)', color: '#c084fc' },
  'roll-a':   { bg: 'rgba(34,197,94,0.16)',  color: '#4ade80' },
  'roll-b':   { bg: 'rgba(6,182,212,0.13)',  color: '#38bdf8' },
  'roll-c':   { bg: 'rgba(99,102,241,0.13)', color: '#818cf8' },
  'roll-d':   { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af' },
};

export default function Marketplace({ player, creatures, privyId, solanaWallet, onRefetch }) {
  const [subTab, setSubTab] = useState('browse'); // browse, my_listings, sell
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [filterRarity, setFilterRarity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [toast, setToast] = useState(null);
  const [sellModal, setSellModal] = useState(null);
  const [detailListing, setDetailListing] = useState(null);
  const [buyLoading, setBuyLoading] = useState(false);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const headers = { 'x-privy-id': privyId };

  // Fetch listings
  const fetchListings = useCallback(async (mine = false) => {
    setLoadingListings(true);
    try {
      const params = new URLSearchParams({ sort: sortBy });
      if (mine) params.set('mine', 'true');
      if (filterRarity !== 'all') params.set('rarity', filterRarity);
      params.set('type', 'fixed');

      const res = await fetch(`/api/marketplace/listings?${params}`, { headers });
      const data = await res.json();
      setListings(data.listings || []);
    } catch (err) { console.error(err); }
    setLoadingListings(false);
  }, [sortBy, filterRarity, subTab, privyId]);

  useEffect(() => {
    fetchListings(subTab === 'my_listings');
  }, [subTab, fetchListings]);

  // ============ CREATE LISTING ============
  const handleCreateListing = async (creatureId, listingType, priceSol, minBidSol, durationHours) => {
    try {
      const res = await fetch('/api/marketplace/listings', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatureId, listingType, priceSol, minBidSol, durationHours }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || 'Error', 'error');
      showToast('Criatura listada en el marketplace', 'success');
      setSellModal(null);
      fetchListings();
      onRefetch?.();
    } catch (err) { showToast('Error al crear listing', 'error'); }
  };

  // ============ CANCEL LISTING ============
  const handleCancel = async (listingId) => {
    try {
      const res = await fetch('/api/marketplace/listings', {
        method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (!res.ok) return showToast(data.error || 'Error', 'error');
      showToast('Listing cancelado', 'success');
      fetchListings(true);
      onRefetch?.();
    } catch (err) { showToast('Error al cancelar', 'error'); }
  };

  // ============ BUY (SOL) ============
  const handleBuy = async (listing) => {
    if (!solanaWallet) {
      return showToast('No se detectó wallet de Solana. Cierra sesión y vuelve a entrar.', 'error');
    }
    setBuyLoading(true);
    try {
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const conn = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com', 'confirmed');

      const escrowWallet = process.env.NEXT_PUBLIC_ESCROW_WALLET;
      if (!escrowWallet) throw new Error('Escrow wallet not configured');

      const walletAddress = solanaWallet.address;
      const priceLamports = Math.round(parseFloat(listing.price_sol) * LAMPORTS_PER_SOL);
      const senderPubkey = new PublicKey(walletAddress);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: new PublicKey(escrowWallet),
          lamports: priceLamports,
        })
      );
      tx.feePayer = senderPubkey;
      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // Sign & send via Privy wallet
      const txSignature = await solanaWallet.sendTransaction(tx, conn);

      // Notify server
      const res = await fetch('/api/marketplace/buy', {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, txSignature: String(txSignature), walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`¡Compra exitosa! ${listing.name} es tuya`, 'success');
      setDetailListing(null);
      fetchListings();
      onRefetch?.();
    } catch (err) {
      console.error('[BUY]', err);
      showToast(err.message || 'Error al comprar', 'error');
    }
    setBuyLoading(false);
  };

  const subTabs = [
    { id: 'browse', label: '🏪 Mercado' },
    { id: 'my_listings', label: '📋 Mis Ventas' },
    { id: 'sell', label: '💰 Vender' },
  ];

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-[3000] px-5 py-3 rounded-xl text-[13px] font-medium shadow-lg border backdrop-blur-xl ${
          toast.type === 'success' ? 'bg-green-500/15 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-400' :
          'bg-purple-500/15 border-purple-500/30 text-purple-400'
        }`}>{toast.msg}</div>
      )}

      <div className="text-center mb-6">
        <h2 className="text-[30px] font-extrabold tracking-tight mb-1">Marketplace</h2>
        <p className="text-gray-500 text-sm">Compra, vende y intercambia criaturas con SOL</p>
        {solanaWallet?.address && (
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="text-[11px] text-gray-600">Tu wallet:</span>
            <code className="text-[11px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded select-all cursor-pointer"
              onClick={() => { navigator.clipboard.writeText(solanaWallet.address); showToast('Dirección copiada', 'success'); }}
              title="Click para copiar">{solanaWallet.address.slice(0, 6)}...{solanaWallet.address.slice(-4)}</code>
            <button onClick={() => { navigator.clipboard.writeText(solanaWallet.address); showToast('Dirección copiada', 'success'); }}
              className="text-[10px] text-purple-500 hover:text-purple-300 transition">📋 Copiar</button>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex justify-center gap-[3px] mb-6 bg-[#0a0a20]/40 rounded-xl p-1 max-w-fit mx-auto">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 rounded-lg text-[12px] font-medium transition-all ${
              subTab === t.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/25' : 'text-gray-500 hover:text-purple-300'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Filters (for browse) */}
      {subTab === 'browse' && (
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex gap-[4px]">
            {['all', 'Comun', 'Poco Comun', 'Rara', 'Epica', 'Legendaria', 'Unica'].map(r => (
              <button key={r} onClick={() => setFilterRarity(r)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                  filterRarity === r ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' : 'bg-white/[0.03] border-white/[0.06] text-gray-500 hover:text-purple-300'
                }`}>{r === 'all' ? 'Todas' : r}</button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="bg-[#0d0d28] border border-[#1a1a3e] rounded-lg px-3 py-1.5 text-[11px] text-gray-300 outline-none ml-auto">
            <option value="newest">Mas recientes</option>
            <option value="price_asc">Precio: menor a mayor</option>
            <option value="price_desc">Precio: mayor a menor</option>
            <option value="ending_soon">Termina pronto</option>
          </select>
        </div>
      )}

      {/* BROWSE / AUCTIONS / MY LISTINGS */}
      {['browse', 'my_listings'].includes(subTab) && (
        <div>
          {loadingListings ? (
            <div className="text-center py-12 text-purple-400 animate-pulse">Cargando...</div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">🏪</div>
              <p className="text-gray-500">{subTab === 'my_listings' ? 'No tienes ventas activas' : 'No hay listings disponibles'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map(l => (
                <ListingCard key={l.id} listing={l} player={player}
                  onDetail={() => setDetailListing(l)}
                  onCancel={subTab === 'my_listings' ? () => handleCancel(l.id) : null}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* SELL TAB */}
      {subTab === 'sell' && (
        <div>
          <p className="text-gray-500 text-[13px] mb-4 text-center">Selecciona una criatura para vender</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {creatures.filter(c => !c.listed).map(c => {
              const types = Array.isArray(c.types) ? c.types : [c.types];
              const rarColor = RARITY_COLORS[c.rarity] || '#8b5cf6';
              return (
                <button key={c.id} onClick={() => setSellModal(c)}
                  className="bg-[#0a0a20]/60 border border-white/[0.06] rounded-xl p-4 text-center hover:border-purple-500/30 transition-all group">
                  <div className="flex justify-center mb-2">
                    <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={70} />
                  </div>
                  <p className="text-[13px] font-bold text-white">{c.name}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: rarColor + '22', color: rarColor }}>{c.rarity}</span>
                  <div className="flex justify-center gap-2 mt-1.5 text-[9px] text-gray-600">
                    <span>HP {c.hp}</span><span>ATK {c.atk}</span><span>SPD {c.spd}</span>
                  </div>
                  <div className="mt-2 text-[10px] text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click para vender
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SELL MODAL */}
      {sellModal && (
        <SellModal creature={sellModal} onClose={() => setSellModal(null)} onCreate={handleCreateListing} />
      )}

      {/* DETAIL / BUY MODAL */}
      {detailListing && (
        <DetailModal listing={detailListing} player={player} loading={buyLoading}
          onClose={() => setDetailListing(null)}
          onBuy={() => handleBuy(detailListing)}
        />
      )}

    </div>
  );
}

// ============================================
// LISTING CARD
// ============================================
function ListingCard({ listing, player, onDetail, onCancel }) {
  const types = Array.isArray(listing.types) ? listing.types : [listing.types];
  const rarColor = RARITY_COLORS[listing.rarity] || '#8b5cf6';
  const isMine = listing.seller_id === player.id;

  return (
    <div className="bg-[#0a0a20]/60 border border-white/[0.06] rounded-2xl p-4 hover:border-purple-500/20 transition-all cursor-pointer"
      onClick={onDetail}>
      <div className="flex items-start gap-4">
        <CreatureAvatar name={listing.name} types={types} rarity={listing.rarity} size={80} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-[14px] font-extrabold text-white truncate">{listing.name}</h3>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: rarColor + '22', color: rarColor }}>{listing.rarity}</span>
          </div>
          <div className="flex gap-1 mb-2">
            {types.map(t => (
              <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ background: (TYPE_COLORS[t] || '#8b5cf6') + '22', color: TYPE_COLORS[t] }}>{t}</span>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] text-gray-500 mb-2">
            <span>HP {listing.hp}</span><span>ATK {listing.atk}</span>
            <span>DEF {listing.def}</span><span>SPD {listing.spd}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-green-400">{parseFloat(listing.price_sol).toFixed(3)} SOL</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] text-gray-500">💰 Venta</span>
          </div>
        </div>
      </div>
      {isMine && (
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/[0.05]">
          <span className="text-[10px] text-gray-600">Tu listing</span>
          {onCancel && (
            <button onClick={e => { e.stopPropagation(); onCancel(); }}
              className="text-[11px] text-red-400 hover:text-red-300 font-medium">Cancelar</button>
          )}
        </div>
      )}
      {!isMine && (
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <span className="text-[10px] text-gray-600">Vendedor: {listing.seller_username}</span>
        </div>
      )}
    </div>
  );
}

// ============================================
// SELL MODAL
// ============================================
function SellModal({ creature, onClose, onCreate }) {
  const [price, setPrice] = useState('');
  const types = Array.isArray(creature.types) ? creature.types : [creature.types];
  const rarColor = RARITY_COLORS[creature.rarity] || '#8b5cf6';

  const submit = () => {
    const p = parseFloat(price);
    if (!p || p <= 0) return;
    onCreate(creature.id, 'fixed', p, null, null);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0c0c23] border border-white/10 rounded-3xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-extrabold text-white mb-4">Vender Criatura</h3>

        <div className="flex items-center gap-4 mb-5 bg-white/[0.03] rounded-xl p-3">
          <CreatureAvatar name={creature.name} types={types} rarity={creature.rarity} size={60} />
          <div>
            <p className="text-[14px] font-bold text-white">{creature.name}</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: rarColor + '22', color: rarColor }}>{creature.rarity}</span>
          </div>
        </div>

        {/* Price input */}
        <div className="mb-4">
          <label className="text-[11px] text-gray-500 mb-1 block">Precio (SOL)</label>
          <div className="relative">
            <input type="number" step="0.001" min="0.001" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="0.05"
              className="w-full bg-[#0d0d28] border border-[#1a1a3e] rounded-xl px-4 py-3 text-white text-[15px] font-bold outline-none focus:border-purple-500/40" />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-gray-500 font-medium">SOL</span>
          </div>
        </div>

        {/* Fee notice */}
        <p className="text-[10px] text-gray-600 mb-4">Comisión de plataforma: 5%. {price && parseFloat(price) > 0 ? `Recibirás ${(parseFloat(price) * 0.95).toFixed(4)} SOL` : ''}</p>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/[0.08] text-gray-400 font-medium text-[13px]">Cancelar</button>
          <button onClick={submit} disabled={!price || parseFloat(price) <= 0}
            className="flex-1 py-3 rounded-xl font-bold text-[13px] text-white disabled:opacity-40 transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
            💰 Listar en Venta
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// DETAIL / BUY MODAL
// ============================================
function DetailModal({ listing, player, loading, onClose, onBuy }) {
  const types = Array.isArray(listing.types) ? listing.types : [listing.types];
  const rarColor = RARITY_COLORS[listing.rarity] || '#8b5cf6';
  const isMine = listing.seller_id === player.id;

  const rarKey = getRarityKey(listing.rarity);
  const rar = RARITIES[rarKey];

  const getQuality = (key, value) => {
    if (!rar?.[key]) return null;
    return rollQuality(value, rar[key][0], rar[key][1]);
  };

  const attacks = typeof listing.attacks === 'string' ? JSON.parse(listing.attacks) : listing.attacks;
  const abilityData = ABILITIES[listing.ability] || {};

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#0c0c23] border border-white/10 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 text-gray-400 hover:text-white flex items-center justify-center">×</button>

        {/* Creature header */}
        <div className="flex items-center gap-5 mb-5">
          <CreatureAvatar name={listing.name} types={types} rarity={listing.rarity} size={100} />
          <div>
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1"
              style={{ background: rarColor + '22', color: rarColor }}>{listing.rarity}</span>
            <h2 className="text-2xl font-extrabold text-white">{listing.name}</h2>
            <div className="flex gap-1 mt-1">
              {types.map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: (TYPE_COLORS[t] || '#8b5cf6') + '22', color: TYPE_COLORS[t] }}>{t}</span>
              ))}
            </div>
            <p className="text-[11px] text-gray-600 mt-1">Vendedor: {listing.seller_username}</p>
          </div>
        </div>

        {/* Stats with tiers */}
        <div className="mb-4">
          {[{ label: 'HP', key: 'hp', color: '#22c55e' }, { label: 'ATK', key: 'atk', color: '#ef4444' },
            { label: 'DEF', key: 'def', color: '#3b82f6' }, { label: 'SPD', key: 'spd', color: '#eab308' }].map(s => {
            const q = getQuality(s.key, listing[s.key]);
            const ts = q ? TIER_STYLES[q.cls] : null;
            const min = rar?.[s.key]?.[0] || 0;
            const max = rar?.[s.key]?.[1] || 100;
            const pct = max > min ? ((listing[s.key] - min) / (max - min)) * 100 : 50;
            return (
              <div key={s.key} className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold w-7" style={{ color: s.color }}>{s.label}</span>
                <span className="text-[13px] font-extrabold text-white w-8">{listing[s.key]}</span>
                <div className="flex-1 h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: s.color }} />
                </div>
                <span className="text-[8px] text-gray-600 w-14 text-right">{min}-{max}</span>
                {q && ts && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ background: ts.bg, color: ts.color }}>{q.label}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Attacks */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {attacks?.map(a => (
            <div key={a.name} className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-2">
              <span className="text-[11px] font-bold text-white">{a.name}</span>
              <div className="flex items-center gap-1 mt-0.5">
                {a.type && <span className="text-[8px] px-1 py-0.5 rounded" style={{ background: (TYPE_COLORS[a.type] || '#8b5cf6') + '22', color: TYPE_COLORS[a.type] }}>{a.type}</span>}
                <span className="text-[8px] text-gray-500">{a.power}pw {a.accuracy}%</span>
              </div>
            </div>
          ))}
        </div>

        {/* Ability */}
        {listing.ability && (
          <div className="bg-[#12122a] border border-white/[0.05] rounded-lg p-3 mb-5">
            <span className="text-[12px] font-bold text-purple-400">★ {listing.ability}</span>
            <p className="text-[10px] text-gray-500 mt-0.5">{abilityData.desc || ''}</p>
          </div>
        )}

        {/* Price & Actions */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-500">Precio</span>
              <div className="text-[22px] font-extrabold text-green-400">{parseFloat(listing.price_sol).toFixed(3)} SOL</div>
            </div>
            {!isMine && (
              <button onClick={onBuy} disabled={loading}
                className="px-6 py-2.5 rounded-lg text-[13px] font-bold text-white disabled:opacity-40 hover:scale-[1.02] transition-all"
                style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}>
                {loading ? 'Procesando...' : '💰 Comprar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

