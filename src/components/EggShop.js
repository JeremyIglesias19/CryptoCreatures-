'use client';
import { useState, useRef, useCallback } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { ABILITIES, RARITIES, rollQuality, getRarityKey } from '@/lib/gameData';

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};
const TYPE_COLORS_MAP = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};
const STAT_COLORS = { hp: '#22c55e', atk: '#ef4444', def: '#3b82f6', spd: '#eab308' };
const TIER_STYLES = {
  'roll-sss': { bg: 'rgba(239,68,68,0.2)',  color: '#f87171', shadow: '0 0 8px rgba(239,68,68,0.35)' },
  'roll-ss':  { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24', shadow: '0 0 6px rgba(245,158,11,0.25)' },
  'roll-s':   { bg: 'rgba(168,85,247,0.17)', color: '#c084fc', shadow: 'none' },
  'roll-a':   { bg: 'rgba(34,197,94,0.16)',  color: '#4ade80', shadow: 'none' },
  'roll-b':   { bg: 'rgba(6,182,212,0.13)',  color: '#38bdf8', shadow: 'none' },
  'roll-c':   { bg: 'rgba(99,102,241,0.13)', color: '#818cf8', shadow: 'none' },
  'roll-d':   { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', shadow: 'none' },
};
const ABILITY_CAT_COLORS = {
  'Ofensiva': '#ef4444', 'Defensiva': '#3b82f6', 'Velocidad': '#eab308',
  'Estado': '#a855f7', 'Especial': '#f59e0b',
};

// ============ SOUND EFFECTS ============
function playShakeSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 220;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(g); g.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.08);
    setTimeout(() => {
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.type = 'triangle'; o2.frequency.value = 260;
      g2.gain.setValueAtTime(0.12, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      o2.connect(g2); g2.connect(ctx.destination); o2.start(); o2.stop(ctx.currentTime + 0.06);
    }, 100);
  } catch {}
}
function playCrackSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const bs = ctx.sampleRate * 0.15; const buf = ctx.createBuffer(1, bs, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
    const n = ctx.createBufferSource(); n.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    n.connect(g); g.connect(ctx.destination); n.start();
    const osc = ctx.createOscillator(); const g2 = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 180;
    g2.gain.setValueAtTime(0.2, ctx.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(g2); g2.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.2);
  } catch {}
}
function playExplosionSweep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [330, 440, 554, 659, 880].forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; const t = ctx.currentTime + i * 0.06;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
    });
  } catch {}
}
function playRevealSound(rarity) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      'Comun': [523, 659], 'Poco Comun': [523, 659, 784], 'Rara': [523, 659, 784, 1047],
      'Epica': [440, 554, 659, 784, 880], 'Legendaria': [440, 554, 659, 784, 880, 1047, 1175],
      'Unica': [440, 523, 587, 659, 784, 880, 1047, 1175],
    };
    (notes[rarity] || notes['Comun']).forEach((f, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = rarity === 'Unica' ? 'sine' : 'triangle'; o.frequency.value = f;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.15, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.4);
      if (rarity === 'Unica') {
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = f * 1.005;
        g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.08, t + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o2.connect(g2); g2.connect(ctx.destination); o2.start(t); o2.stop(t + 0.5);
      }
    });
  } catch {}
}

// ============ TOOLTIP COMPONENT ============
function Tooltip({ show, x, y, children }) {
  if (!show) return null;
  // Position tooltip avoiding edges
  let left = x + 14, top = y - 10;
  if (typeof window !== 'undefined') {
    if (left + 260 > window.innerWidth) left = x - 260;
    if (top + 150 > window.innerHeight) top = window.innerHeight - 160;
    if (top < 8) top = 8;
  }
  return (
    <div className="fixed z-[9999] pointer-events-none"
      style={{ left, top, opacity: 1, transform: 'translateY(0)', transition: 'opacity .15s, transform .15s' }}>
      <div className="rounded-xl border border-white/10 px-3.5 py-2.5 text-[12px] leading-relaxed max-w-[260px]"
        style={{ background: 'rgba(10,10,28,0.97)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', color: '#e0e0f0' }}>
        {children}
      </div>
    </div>
  );
}

export default function EggShop({ player, onPurchase }) {
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [revealedCreature, setRevealedCreature] = useState(null);
  const [rarityKeyResult, setRarityKeyResult] = useState('common');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [glowColor, setGlowColor] = useState('transparent');
  const [glowOpacity, setGlowOpacity] = useState(0);
  const [showCracks, setShowCracks] = useState(false);
  const [flashColor, setFlashColor] = useState(null);
  const [animatedStats, setAnimatedStats] = useState({ hp: 0, atk: 0, def: 0, spd: 0 });
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: null });
  const particleContainerRef = useRef(null);

  const spawnParticles = useCallback((color, count) => {
    const container = particleContainerRef.current;
    if (!container) return;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const angle = (360 / count) * i + Math.random() * 20;
      const dist = 60 + Math.random() * 80;
      const size = 4 + Math.random() * 6;
      const dur = 500 + Math.random() * 400;
      p.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size * 2}px ${color};pointer-events:none;z-index:10;`;
      container.appendChild(p);
      const rad = angle * Math.PI / 180;
      p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(rad) * dist}px), calc(-50% + ${Math.sin(rad) * dist}px)) scale(0.2)`, opacity: 0 },
      ], { duration: dur, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => p.remove(), dur);
    }
  }, []);

  const screenFlash = useCallback((color) => {
    setFlashColor(color);
    setTimeout(() => setFlashColor(null), 350);
  }, []);

  const animateStats = useCallback((creature) => {
    const targets = { hp: creature.hp, atk: creature.atk, def: creature.def, spd: creature.spd };
    ['hp', 'atk', 'def', 'spd'].forEach((key, idx) => {
      setTimeout(() => {
        const start = Date.now(); const dur = 600;
        const step = () => {
          const t = Math.min((Date.now() - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          setAnimatedStats(prev => ({ ...prev, [key]: Math.round(eased * targets[key]) }));
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, idx * 100);
    });
  }, []);

  // Tooltip handlers
  const showStatTooltip = (e, statKey, value, rarKey) => {
    const rar = RARITIES[rarKey];
    const min = rar[statKey][0]; const max = rar[statKey][1];
    const q = rollQuality(value, min, max);
    const ts = TIER_STYLES[q.cls];
    setTooltip({
      show: true, x: e.clientX, y: e.clientY,
      content: (
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-gray-500 font-bold mb-1.5">{statKey.toUpperCase()}</div>
          <div className="flex justify-between gap-3 mb-0.5">
            <span className="text-[#7777aa]">Valor</span>
            <span className="font-bold" style={{ color: STAT_COLORS[statKey] }}>{value}</span>
          </div>
          <div className="flex justify-between gap-3 mb-0.5">
            <span className="text-[#7777aa]">Rango</span>
            <span className="font-bold text-[#38bdf8]">{min} - {max}</span>
          </div>
          <div className="h-px bg-white/[0.07] my-1.5" />
          <div className="flex justify-between items-center gap-3">
            <span className="text-[#7777aa]">Tier</span>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md"
              style={{ background: ts.bg, color: ts.color, boxShadow: ts.shadow }}>
              {q.label}
            </span>
          </div>
        </div>
      ),
    });
  };

  const showAbilityTooltip = (e, abilityName) => {
    const data = ABILITIES[abilityName];
    if (!data) return;
    const catColor = ABILITY_CAT_COLORS[data.cat] || '#fbbf24';
    setTooltip({
      show: true, x: e.clientX, y: e.clientY,
      content: (
        <div>
          <div className="text-[12px] font-bold mb-0.5" style={{ color: catColor }}>{abilityName}</div>
          <div className="text-[10px] uppercase tracking-[1px] mb-1.5" style={{ color: catColor + '88' }}>{data.cat}</div>
          <div className="text-[11px] leading-relaxed" style={{ color: '#9999bb' }}>{data.desc}</div>
        </div>
      ),
    });
  };

  const showAttackTooltip = (e, attack) => {
    const typeColor = TYPE_COLORS_MAP[attack.type] || '#9ca3af';
    setTooltip({
      show: true, x: e.clientX, y: e.clientY,
      content: (
        <div>
          <div className="text-[10px] uppercase tracking-[1.5px] text-gray-500 font-bold mb-1.5">{attack.name}</div>
          <div className="flex justify-between gap-3 mb-0.5">
            <span className="text-[#7777aa]">Tipo</span>
            <span className="font-bold" style={{ color: typeColor }}>{attack.type || 'Neutro'}</span>
          </div>
          <div className="flex justify-between gap-3 mb-0.5">
            <span className="text-[#7777aa]">Poder</span>
            <span className="font-bold text-[#38bdf8]">{attack.power}</span>
          </div>
          <div className="flex justify-between gap-3 mb-0.5">
            <span className="text-[#7777aa]">Precision</span>
            <span className="font-bold text-[#38bdf8]">{attack.accuracy}%</span>
          </div>
          {attack.effect && (
            <>
              <div className="h-px bg-white/[0.07] my-1.5" />
              <div className="text-[11px] text-[#c4b5fd]">{attack.effect} ({attack.effectChance || attack.effect_chance}%)</div>
            </>
          )}
        </div>
      ),
    });
  };

  const hideTooltip = () => setTooltip({ show: false, x: 0, y: 0, content: null });
  const moveTooltip = (e) => { if (tooltip.show) setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY })); };

  const buyAndOpenEgg = async () => {
    setConfirmOpen(false);
    setOpening(true);
    setPhase('shaking');
    setShowCracks(false);
    setGlowOpacity(0);
    setGlowColor('transparent');
    setStatusText('Conectando con Solana...');
    setAnimatedStats({ hp: 0, atk: 0, def: 0, spd: 0 });

    const apiPromise = fetch('/api/eggs/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-privy-id': player.privy_id },
    }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)));

    await new Promise(r => setTimeout(r, 500));
    playShakeSound();

    await new Promise(r => setTimeout(r, 800));

    let apiData;
    try { apiData = await apiPromise; }
    catch (err) { alert(err.error || 'Error al abrir huevo'); setOpening(false); setPhase('idle'); return; }

    const rarColor = RARITY_COLORS[apiData.creature.rarity] || '#8b5cf6';
    setRarityKeyResult(apiData.rarity || getRarityKey(apiData.creature.rarity));
    setGlowColor(rarColor);
    setGlowOpacity(0.6);
    setStatusText('Generando VRF on-chain...');

    await new Promise(r => setTimeout(r, 700));
    setPhase('shaking-hard');
    setShowCracks(true);
    setGlowOpacity(1);
    playCrackSound();
    setStatusText('¡Eclosionando!');

    await new Promise(r => setTimeout(r, 700));
    setPhase('exploding');
    screenFlash(rarColor);
    playExplosionSweep();
    const pc = apiData.creature.rarity === 'Unica' ? 30 : apiData.creature.rarity === 'Legendaria' ? 24 : 18;
    spawnParticles(rarColor, pc);

    await new Promise(r => setTimeout(r, 400));
    setRevealedCreature(apiData.creature);
    setPhase('revealed');
    animateStats(apiData.creature);
    playRevealSound(apiData.creature.rarity);
  };

  const closeReveal = () => {
    setOpening(false); setPhase('idle'); setRevealedCreature(null);
    setGlowOpacity(0); setShowCracks(false); setFlashColor(null);
    hideTooltip();
    onPurchase();
  };

  // Compute stat tiers for revealed creature
  const getStatTier = (statKey) => {
    if (!revealedCreature) return null;
    const rar = RARITIES[rarityKeyResult];
    if (!rar || !rar[statKey]) return null;
    return rollQuality(revealedCreature[statKey], rar[statKey][0], rar[statKey][1]);
  };

  const getStatRange = (statKey) => {
    const rar = RARITIES[rarityKeyResult];
    if (!rar || !rar[statKey]) return [0, 100];
    return rar[statKey];
  };

  const getStatBarPct = (statKey) => {
    if (!revealedCreature) return 0;
    const [min, max] = getStatRange(statKey);
    return Math.min(100, Math.max(0, ((revealedCreature[statKey] - min) / (max - min)) * 100));
  };

  // Parse attacks (might be JSON string or array)
  const getAttacks = () => {
    if (!revealedCreature) return [];
    let atks = revealedCreature.attacks;
    if (typeof atks === 'string') {
      try { atks = JSON.parse(atks); } catch { return []; }
    }
    return Array.isArray(atks) ? atks : [];
  };

  return (
    <div onMouseMove={moveTooltip}>
      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes eggShake {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          15% { transform: translate(-3px, 0) rotate(-6deg); }
          30% { transform: translate(2px, 0) rotate(4deg); }
          45% { transform: translate(-2px, 0) rotate(-4deg); }
          60% { transform: translate(3px, 0) rotate(6deg); }
          75% { transform: translate(-1px, 0) rotate(-2deg); }
        }
        @keyframes eggShakeHard {
          0%,100% { transform: translate(0,0) rotate(0deg); }
          10% { transform: translate(-4px, -2px) rotate(-10deg); }
          20% { transform: translate(4px, 1px) rotate(8deg); }
          30% { transform: translate(-4px, 0) rotate(-8deg); }
          40% { transform: translate(3px, -1px) rotate(10deg); }
          50% { transform: translate(-3px, 2px) rotate(-6deg); }
          60% { transform: translate(4px, 0) rotate(8deg); }
          70% { transform: translate(-2px, -2px) rotate(-10deg); }
          80% { transform: translate(3px, 1px) rotate(6deg); }
          90% { transform: translate(-4px, 0) rotate(-8deg); }
        }
        @keyframes eggExplode { 0% { transform: scale(1); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes auraPulse {
          0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.5; }
          50% { transform: translate(-50%,-50%) scale(1.15); opacity: 0.8; }
        }
        @keyframes revealIn { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes screenFlash { 0% { opacity: 0.8; } 100% { opacity: 0; } }
        @keyframes floatBadge { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes statPop { 0% { transform: scale(0.5); opacity: 0; } 70% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes barGrow { 0% { width: 0%; } 100% { width: var(--bar-target); } }
        .egg-shake { animation: eggShake 0.3s ease-in-out infinite; }
        .egg-shake-hard { animation: eggShakeHard 0.15s ease-in-out infinite; }
        .egg-explode { animation: eggExplode 0.4s ease-out forwards; }
        .aura-pulse { animation: auraPulse 1.8s ease-in-out infinite; }
        .reveal-in { animation: revealIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .float-badge { animation: floatBadge 0.4s ease-out forwards; }
        .stat-pop { animation: statPop 0.3s ease-out forwards; }
        .bar-grow { animation: barGrow 0.8s cubic-bezier(.23,1,.32,1) forwards; }
      `}</style>

      <div className="text-center mb-10">
        <h2 className="text-[30px] font-extrabold tracking-tight mb-2">Tienda de Huevos</h2>
        <p className="text-gray-500 text-sm">Abre huevos para descubrir nuevas criaturas</p>
      </div>

      {/* Egg Card */}
      <div className="flex justify-center mb-8">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-3xl p-8 text-center max-w-[340px] w-full backdrop-blur-lg transition-all hover:translate-y-[-6px] hover:border-gray-500/40 hover:shadow-lg">
          <div className="w-[120px] h-[150px] mx-auto mb-5 flex items-center justify-center">
            <div className="w-[100px] h-[130px] rounded-[50%_50%_50%_50%/60%_60%_40%_40%] relative overflow-hidden"
              style={{ background: 'linear-gradient(160deg, #4b5563, #9ca3af)' }}>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[38px] font-extrabold text-white/25">?</span>
            </div>
          </div>
          <h3 className="text-[17px] text-white font-bold mb-1">Huevo</h3>
          <div className="text-[26px] font-extrabold text-sky-400 my-2 tracking-tight">
            50 <small className="text-[12px] text-gray-500 font-medium">gemas</small>
          </div>
          <div className="flex justify-between text-[12px] text-gray-500 my-3">
            <span>x1 Criatura</span><span>Todas las rarezas</span>
          </div>
          <button onClick={() => setConfirmOpen(true)} disabled={player.gems < 50}
            className="w-full py-3.5 rounded-[14px] text-[14px] font-bold text-white transition-all hover:scale-[1.03] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #4b5563, #374151)' }}>
            {player.gems < 50 ? 'Sin gemas suficientes' : 'Comprar Huevo'}
          </button>
        </div>
      </div>

      {/* DEV: Add gems */}
      <div className="flex justify-center mb-6">
        <button onClick={async () => {
          const res = await fetch('/api/dev/gems', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ privyId: player.privy_id, amount: 5000 }) });
          if (res.ok) { const d = await res.json(); alert(`+5000 gemas! Total: ${d.gems}`); onPurchase(); }
          else { const e = await res.json().catch(() => ({})); alert('Error: ' + (e.error || 'fallo')); }
        }} className="px-4 py-2 rounded-lg text-[12px] font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all">
          DEV: +5000 Gemas
        </button>
      </div>

      {/* Probability bar */}
      <div className="bg-[#0d0d28] border border-[#1a1a3e] rounded-2xl p-6 max-w-2xl mx-auto">
        <h3 className="text-[16px] text-white font-bold mb-4">Probabilidades por huevo</h3>
        <div className="flex h-8 rounded-lg overflow-hidden mb-3">
          <div className="flex items-center justify-center text-[11px] text-white font-semibold" style={{ width: '45%', background: '#9ca3af' }}>Comun 45%</div>
          <div className="flex items-center justify-center text-[11px] text-white font-semibold" style={{ width: '28%', background: '#22c55e' }}>Poco Comun 28%</div>
          <div className="flex items-center justify-center text-[11px] text-white font-semibold" style={{ width: '17%', background: '#3b82f6' }}>Rara 17%</div>
          <div className="flex items-center justify-center text-[9px] text-white font-semibold" style={{ width: '7.5%', background: '#a855f7' }}>Epica</div>
          <div className="flex items-center justify-center text-[8px] text-white font-semibold" style={{ width: '2.45%', background: '#eab308' }}>L</div>
          <div style={{ width: '0.05%', background: '#ef4444', minWidth: '4px' }} />
        </div>
        <div className="flex gap-4 flex-wrap text-[12px] text-gray-500">
          {[['Comun', '45%', '#9ca3af'], ['Poco Comun', '28%', '#22c55e'], ['Rara', '17%', '#3b82f6'], ['Epica', '7.5%', '#a855f7'], ['Legendaria', '2.45%', '#eab308'], ['Unica', '0.05%', '#ef4444']].map(([n, p, c]) => (
            <span key={n}><span style={{ color: c }}>●</span> {n} {p}</span>
          ))}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[2500] flex items-center justify-center" onClick={() => setConfirmOpen(false)}>
          <div className="bg-[#0c0c23]/95 border border-purple-500/20 rounded-3xl p-8 max-w-[380px] w-[90%] text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-white text-xl font-extrabold mb-2">Confirmar compra</h3>
            <div className="bg-white/[0.04] rounded-[14px] p-4 my-4 text-left text-[13px] text-gray-400 leading-relaxed">
              <p>x1 Huevo</p>
              <p className="mt-1"><strong className="text-white">Coste:</strong> 50 gemas</p>
              <p className="mt-1"><strong className="text-white">Gemas restantes:</strong> {player.gems - 50}</p>
            </div>
            <div className="flex gap-2.5 mt-5">
              <button onClick={() => setConfirmOpen(false)}
                className="flex-1 py-3.5 rounded-[14px] text-[14px] font-bold bg-white/[0.06] text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all">Cancelar</button>
              <button onClick={buyAndOpenEgg}
                className="flex-1 py-3.5 rounded-[14px] text-[14px] font-bold text-white transition-all hover:brightness-110 hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>Comprar</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ EGG OPENING MODAL ============ */}
      {opening && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center overflow-y-auto py-6"
          style={{ background: 'radial-gradient(ellipse at center, #0c0c23 0%, #000 100%)' }}>

          {flashColor && (
            <div className="absolute inset-0 z-[3100] pointer-events-none"
              style={{ background: flashColor, animation: 'screenFlash 0.35s ease-out forwards' }} />
          )}

          {/* EGG PHASE */}
          {phase !== 'revealed' && (
            <div className="relative flex flex-col items-center">
              <div className="absolute top-1/2 left-1/2 w-[280px] h-[280px] rounded-full blur-[60px] transition-all duration-700 -translate-x-1/2 -translate-y-1/2"
                style={{ background: glowColor, opacity: glowOpacity }} />
              <div ref={particleContainerRef} className="absolute top-1/2 left-1/2 w-0 h-0 z-10" />
              <div className={`relative z-[5] ${phase === 'shaking' ? 'egg-shake' : phase === 'shaking-hard' ? 'egg-shake-hard' : phase === 'exploding' ? 'egg-explode' : ''}`}>
                <div className="w-[120px] h-[155px] rounded-[50%_50%_50%_50%/60%_60%_40%_40%] relative overflow-hidden"
                  style={{
                    background: `linear-gradient(160deg, ${glowOpacity > 0 ? glowColor : '#4b5563'}, ${glowOpacity > 0 ? glowColor + '88' : '#9ca3af'})`,
                    boxShadow: glowOpacity > 0 ? `0 0 ${40 + glowOpacity * 30}px ${glowColor}66` : 'none',
                    transition: 'background 0.5s, box-shadow 0.5s',
                  }}>
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[42px] font-extrabold text-white/25">?</span>
                  {showCracks && (
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 155" fill="none">
                      <path d="M60 0 L55 30 L65 50 L50 75 L70 95 L55 120 L60 155" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.9"/>
                      <path d="M50 75 L30 85 L25 95" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                      <path d="M65 50 L85 55 L95 65" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                      <path d="M70 95 L90 100 L95 110" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                      <path d="M55 30 L35 35 L25 45" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
                    </svg>
                  )}
                </div>
              </div>
              <p className="mt-8 text-[14px] text-gray-400 animate-pulse z-10">{statusText}</p>
            </div>
          )}

          {/* REVEAL PHASE */}
          {phase === 'revealed' && revealedCreature && (
            <div className="relative flex flex-col items-center reveal-in max-w-[420px] w-[92%]">
              {/* Aura */}
              <div className="absolute top-[120px] left-1/2 w-[300px] h-[300px] rounded-full blur-[80px] aura-pulse"
                style={{ background: RARITY_COLORS[revealedCreature.rarity], transform: 'translate(-50%, -50%)', opacity: 0.6 }} />

              {/* Rarity badge */}
              <div className="float-badge inline-block px-5 py-2 rounded-full text-[14px] font-extrabold mb-4 z-10"
                style={{
                  background: (RARITY_COLORS[revealedCreature.rarity] || '#8b5cf6') + '22',
                  color: RARITY_COLORS[revealedCreature.rarity],
                  border: `2px solid ${RARITY_COLORS[revealedCreature.rarity]}55`,
                  textShadow: `0 0 20px ${RARITY_COLORS[revealedCreature.rarity]}`,
                }}>
                {revealedCreature.rarity}
              </div>

              {/* Avatar */}
              <div className="flex justify-center mb-4 z-10">
                <CreatureAvatar name={revealedCreature.name}
                  types={Array.isArray(revealedCreature.types) ? revealedCreature.types : [revealedCreature.types]}
                  rarity={revealedCreature.rarity} size={170} />
              </div>

              {/* Name */}
              <h3 className="text-[26px] font-extrabold text-white mb-1 z-10"
                style={{ textShadow: `0 0 30px ${RARITY_COLORS[revealedCreature.rarity]}66` }}>
                {revealedCreature.name}
              </h3>

              {/* Types */}
              <div className="flex justify-center gap-2 mb-4 z-10">
                {(Array.isArray(revealedCreature.types) ? revealedCreature.types : [revealedCreature.types]).map(t => (
                  <span key={t} className="text-[12px] px-3 py-1.5 rounded-full font-bold"
                    style={{ background: (TYPE_COLORS_MAP[t] || '#8b5cf6') + '25', color: TYPE_COLORS_MAP[t] || '#8b5cf6', border: `1px solid ${TYPE_COLORS_MAP[t] || '#8b5cf6'}44` }}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Stats with bars + tier badges */}
              <div className="w-full z-10 mb-4">
                {[
                  { key: 'hp', label: 'HP' },
                  { key: 'atk', label: 'ATK' },
                  { key: 'def', label: 'DEF' },
                  { key: 'spd', label: 'SPD' },
                ].map((s, i) => {
                  const tier = getStatTier(s.key);
                  const [min, max] = getStatRange(s.key);
                  const ts = tier ? TIER_STYLES[tier.cls] : null;
                  return (
                    <div key={s.key}
                      className="flex items-center gap-2 mb-2.5 cursor-pointer stat-pop"
                      style={{ animationDelay: `${i * 0.1}s` }}
                      onMouseEnter={(e) => showStatTooltip(e, s.key, revealedCreature[s.key], rarityKeyResult)}
                      onMouseLeave={hideTooltip}>
                      {/* Label */}
                      <span className="w-[34px] text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex-shrink-0">{s.label}</span>
                      {/* Bar container */}
                      <div className="flex-1 flex flex-col gap-0.5">
                        <div className="w-full h-[7px] bg-white/[0.06] rounded overflow-hidden">
                          <div className="h-full rounded bar-grow"
                            style={{ '--bar-target': `${getStatBarPct(s.key)}%`, background: STAT_COLORS[s.key], animationDelay: `${0.4 + i * 0.12}s`, animationFillMode: 'both' }} />
                        </div>
                        <div className="flex justify-between text-[9px] text-gray-600">
                          <span>{min}</span><span>{max}</span>
                        </div>
                      </div>
                      {/* Value */}
                      <span className="w-[30px] text-[13px] font-extrabold text-right flex-shrink-0" style={{ color: STAT_COLORS[s.key] }}>
                        {animatedStats[s.key]}
                      </span>
                      {/* Tier badge */}
                      {tier && ts && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md flex-shrink-0"
                          style={{ background: ts.bg, color: ts.color, boxShadow: ts.shadow, letterSpacing: '0.5px' }}>
                          {tier.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Attacks grid */}
              <div className="w-full grid grid-cols-2 gap-2 mb-4 z-10">
                {getAttacks().map((atk, i) => {
                  const typeColor = TYPE_COLORS_MAP[atk.type] || '#9ca3af';
                  return (
                    <div key={i}
                      className="bg-white/[0.04] border border-white/[0.07] rounded-lg px-3 py-2 cursor-pointer transition-all hover:bg-white/[0.08] hover:border-white/[0.12]"
                      onMouseEnter={(e) => showAttackTooltip(e, atk)}
                      onMouseLeave={hideTooltip}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: typeColor }} />
                        <span className="text-[11px] text-white font-semibold truncate">{atk.name}</span>
                      </div>
                      <div className="flex gap-2 mt-0.5 text-[9px] text-gray-500">
                        <span>POW {atk.power}</span>
                        <span>ACC {atk.accuracy}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ability */}
              <div className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 mb-5 z-10 cursor-pointer transition-all hover:bg-white/[0.07] hover:border-white/[0.12]"
                onMouseEnter={(e) => showAbilityTooltip(e, revealedCreature.ability)}
                onMouseLeave={hideTooltip}>
                <div className="flex items-center gap-2">
                  <span className="text-[13px]">★</span>
                  <span className="text-purple-400 font-bold text-[13px]">{revealedCreature.ability}</span>
                  {ABILITIES[revealedCreature.ability] && (
                    <span className="text-[11px] text-gray-500 ml-auto">{ABILITIES[revealedCreature.ability].cat}</span>
                  )}
                </div>
                {ABILITIES[revealedCreature.ability] && (
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{ABILITIES[revealedCreature.ability].desc}</p>
                )}
              </div>

              {/* CTA */}
              <button onClick={closeReveal}
                className="w-full max-w-[280px] py-3.5 rounded-xl text-[15px] font-bold text-white z-10 transition-all hover:scale-[1.03] hover:brightness-110"
                style={{
                  background: `linear-gradient(135deg, ${RARITY_COLORS[revealedCreature.rarity] || '#8b5cf6'}, ${RARITY_COLORS[revealedCreature.rarity] || '#8b5cf6'}88)`,
                  boxShadow: `0 4px 25px ${RARITY_COLORS[revealedCreature.rarity] || '#8b5cf6'}44`,
                }}>
                Anadir a Coleccion
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating tooltip */}
      <Tooltip show={tooltip.show} x={tooltip.x} y={tooltip.y}>
        {tooltip.content}
      </Tooltip>
    </div>
  );
}
