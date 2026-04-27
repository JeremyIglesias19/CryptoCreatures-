'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { ABILITIES } from '@/lib/gameData';

const TYPE_COLORS = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};
const STATUS_ICONS = { Quemar: '🔥', Veneno: '☠️', Paralisis: '⚡', Congelar: '❄️' };
const STATUS_COLORS = { Quemar: '#ef4444', Veneno: '#a855f7', Paralisis: '#eab308', Congelar: '#67e8f9' };
const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};

// ============ SFX ENGINE ============
function playTone(freq, dur, type = 'sine', vol = 0.1) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  } catch {}
}
function playNoise(vol, dur) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const bs = ctx.sampleRate * dur; const buf = ctx.createBuffer(1, bs, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < bs; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bs);
    const n = ctx.createBufferSource(); n.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    n.connect(g); g.connect(ctx.destination); n.start();
  } catch {}
}

const SFX = {
  attackHit() { playNoise(0.1, 0.15); playTone(150, 0.15, 'sawtooth', 0.12); },
  attackMiss() { playTone(300, 0.15, 'sine', 0.08); setTimeout(() => playTone(200, 0.2, 'sine', 0.06), 80); },
  superEffective() { playNoise(0.12, 0.18); playTone(200, 0.1, 'sawtooth', 0.15); setTimeout(() => { playTone(400, 0.15, 'square', 0.08); playTone(600, 0.2, 'sine', 0.06); }, 80); },
  heal() { playTone(523, 0.15, 'sine', 0.1); setTimeout(() => playTone(659, 0.15, 'sine', 0.1), 100); setTimeout(() => playTone(784, 0.25, 'sine', 0.08), 200); },
  statusEffect() { playTone(200, 0.2, 'square', 0.06); setTimeout(() => playTone(250, 0.15, 'square', 0.05), 100); },
  creatureKO() { playTone(400, 0.15, 'sawtooth', 0.1); setTimeout(() => playTone(250, 0.2, 'sawtooth', 0.1), 100); setTimeout(() => playTone(150, 0.35, 'sawtooth', 0.08), 200); },
  switchCreature() { playTone(400, 0.1, 'sine', 0.08); setTimeout(() => playTone(600, 0.15, 'sine', 0.08), 80); },
  victory() { [523,523,523,698,880,784,880,1047].forEach((f, i) => setTimeout(() => playTone(f, i === 7 ? 0.6 : 0.2, 'sine', 0.14), [0,100,200,350,500,650,750,900][i])); },
  defeat() { [440,392,349,311,262].forEach((f, i) => setTimeout(() => playTone(f, 0.35, 'sawtooth', 0.08), i * 120)); },
  resurrect() { [262,330,392,523].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'sine', 0.1), i * 150)); },
};

export default function BattleArena({ battleData, emit, on, playerId, onEnd }) {
  const [state, setState] = useState(battleData.state || null);
  const [side] = useState(battleData.side);
  const [opponent] = useState(battleData.opponent);
  const [log, setLog] = useState([{ text: '⚔️ ¡Empieza el combate!', type: 'info' }]);
  const [gameOver, setGameOver] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [floats, setFloats] = useState([]);
  const [p1Anim, setP1Anim] = useState('');
  const [p2Anim, setP2Anim] = useState('');
  const [atkLabel, setAtkLabel] = useState(null);
  const [arenaShake, setArenaShake] = useState(false);
  const logRef = useRef(null);
  const floatIdRef = useRef(0);

  const spawnFloat = useCallback((targetSide, text, style) => {
    const id = ++floatIdRef.current;
    setFloats(prev => [...prev, { id, targetSide, text, style }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500);
  }, []);

  const processEvents = useCallback((events, attacksUsed) => {
    if (!events || events.length === 0) return;
    const mySide = side;
    let delay = 0;
    const filtered = events.filter(e => e.type !== 'victory' && e.type !== 'defeat' && e.type !== 'gameOver');
    filtered.forEach((e) => {
      setTimeout(() => {
        const logEntry = formatEvent(e, mySide);
        if (logEntry && logEntry.text) setLog(prev => [...prev, logEntry]);
        const targetSide = e.side;
        const otherSide = targetSide === 'player1' ? 'player2' : 'player1';

        switch (e.type) {
          case 'attack': {
            if (e.frozen || e.paralyzed) {
              spawnFloat(targetSide, e.frozen ? '❄️ Congelado!' : '⚡ Paralizado!', 'status-block');
              SFX.statusEffect(); break;
            }
            if (e.frozenThaw) { spawnFloat(targetSide, '¡Descongelado!', 'heal'); break; }
            setAtkLabel({ side: targetSide, name: e.attack || '???', type: e.attackType });
            setTimeout(() => setAtkLabel(null), 800);
            if (targetSide === 'player1') { setP1Anim('lunge-right'); setTimeout(() => setP1Anim(''), 550); }
            else { setP2Anim('lunge-left'); setTimeout(() => setP2Anim(''), 550); }
            if (e.missed) { setTimeout(() => spawnFloat(otherSide, e.dodged ? 'Esquiva!' : '¡Fallo!', 'miss'), 200); SFX.attackMiss(); break; }
            if (e.dodged) { setTimeout(() => spawnFloat(otherSide, e.ethereal ? 'Fase Etérea!' : '¡Esquiva!', 'miss'), 200); SFX.attackMiss(); break; }
            setTimeout(() => {
              if (otherSide === 'player1') { setP1Anim('hit'); setTimeout(() => setP1Anim(''), 300); }
              else { setP2Anim('hit'); setTimeout(() => setP2Anim(''), 300); }
            }, 200);
            setTimeout(() => spawnFloat(otherSide, `-${e.damage}`, e.critical ? 'critical' : 'normal'), 250);
            if (e.effective > 1) { setTimeout(() => spawnFloat(otherSide, '¡Super Eficaz!', 'super-effective'), 500); SFX.superEffective(); setArenaShake(true); setTimeout(() => setArenaShake(false), 400); }
            else if (e.effective < 1) { setTimeout(() => spawnFloat(otherSide, 'Poco Eficaz...', 'not-effective'), 500); SFX.attackHit(); }
            else { SFX.attackHit(); }
            if (e.critical) setTimeout(() => spawnFloat(otherSide, '¡CRÍTICO!', 'critical-label'), 400);
            if (e.effect) setTimeout(() => { spawnFloat(otherSide, `${STATUS_ICONS[e.effect] || '⚠'} ${e.effect}!`, 'status-apply'); SFX.statusEffect(); }, 600);
            if (e.reactiveEffect) setTimeout(() => { spawnFloat(targetSide, `${STATUS_ICONS[e.reactiveEffect] || '⚠'} ${e.reactiveEffect}!`, 'reactive'); SFX.statusEffect(); }, 700);
            if (e.recoil > 0) setTimeout(() => spawnFloat(targetSide, `-${e.recoil}`, 'normal'), 600);
            if (e.mirrorDmg > 0) setTimeout(() => spawnFloat(targetSide, `-${e.mirrorDmg} Espejo!`, 'super-effective'), 600);
            if (e.absorbed) setTimeout(() => { spawnFloat(otherSide, `+${e.absorbed}`, 'heal'); SFX.heal(); }, 400);
            if (e.ironWillTriggered) setTimeout(() => spawnFloat(otherSide, '¡Voluntad de Hierro!', 'buff'), 500);
            if (e.shieldTriggered) setTimeout(() => spawnFloat(otherSide, '🛡 Escudo Natural!', 'shield'), 500);
            if (e.ecoBuffApplied) setTimeout(() => spawnFloat(targetSide, '🌊 Eco Elemental!', 'buff'), 550);
            break;
          }
          case 'ko': spawnFloat(targetSide, '💀 KO!', 'ko'); SFX.creatureKO(); break;
          case 'switch': spawnFloat(targetSide, `↪ ${e.creature}`, 'switch'); SFX.switchCreature(); break;
          case 'heal': spawnFloat(targetSide, `+${e.amount} HP`, 'heal'); SFX.heal(); break;
          case 'statusDmg': spawnFloat(targetSide, `${STATUS_ICONS[e.status] || ''} -${e.damage}`, 'status-dmg'); break;
          case 'statusCured': spawnFloat(targetSide, `✨ Libre de ${e.status}`, 'cured'); SFX.heal(); break;
          case 'resurrect': spawnFloat(targetSide, '✨ Resurrección!', 'resurrect'); SFX.resurrect(); break;
          case 'buff': case 'entry': spawnFloat(targetSide, `⬆ ${e.ability}`, 'buff'); break;
          case 'esporas': spawnFloat(targetSide === 'player1' ? 'player2' : 'player1', `🍄 ${e.status}!`, 'status-apply'); SFX.statusEffect(); break;
          case 'simbiosis': spawnFloat(targetSide === 'player1' ? 'player2' : 'player1', `☠ Simbiosis: ${e.status}!`, 'status-apply'); SFX.statusEffect(); break;
        }
      }, delay);
      delay += 150;
    });
  }, [side, spawnFloat]);

  useEffect(() => {
    if (!on) return;
    const unsubs = [
      on('battle:turnResult', (data) => { setState(data.state); processEvents(data.result?.events, data.attacks); }),
      on('battle:end', (data) => {
        setState(data.state);
        const won = data.winnerId === playerId;
        setGameOver({ won, eloChange: data.eloChange || 0, reason: data.reason });
        setLog(prev => [...prev, { text: won ? '🏆 ¡VICTORIA!' : '💀 Derrota...', type: won ? 'victory' : 'defeat' }]);
        if (won) SFX.victory(); else SFX.defeat();
      }),
    ];
    return () => unsubs.forEach(u => u?.());
  }, [on, playerId, processEvents]);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const changeSpeed = (s) => { setSpeed(s); emit('battle:speed', { speed: s }); };

  const myState = state ? state[side] : null;
  const enemySide = side === 'player1' ? 'player2' : 'player1';
  const enemyState = state ? state[enemySide] : null;
  const myActive = myState?.team?.find(c => c.isActive);
  const enemyActive = enemyState?.team?.find(c => c.isActive);
  const getFloats = (targetSide) => floats.filter(f => f.targetSide === targetSide);

  return (
    <div className="max-w-5xl mx-auto">
      <style jsx global>{`
        @keyframes floatUp { 0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; } 50% { transform: translateX(-50%) translateY(-40px) scale(1.1); opacity: 1; } 100% { transform: translateX(-50%) translateY(-90px) scale(0.8); opacity: 0; } }
        @keyframes lungeRight { 0% { transform: translateX(0) scale(1); } 30% { transform: translateX(50px) scale(1.15); } 60% { transform: translateX(50px) scale(1.15); } 100% { transform: translateX(0) scale(1); } }
        @keyframes lungeLeft { 0% { transform: translateX(0) scale(1); } 30% { transform: translateX(-50px) scale(1.15); } 60% { transform: translateX(-50px) scale(1.15); } 100% { transform: translateX(0) scale(1); } }
        @keyframes recoilHit { 0% { filter: brightness(1); } 15% { filter: brightness(3) saturate(0); transform: translateX(10px); } 30% { filter: brightness(1.5); transform: translateX(-7px); } 100% { filter: brightness(1); transform: translateX(0); } }
        @keyframes arenaShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px) rotate(-0.7deg); } 75% { transform: translateX(6px) rotate(0.7deg); } }
        @keyframes slideLog { 0% { transform: translateX(-12px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        @keyframes fadeInLabel { 0% { transform: translate(-50%,-50%) scale(0.6); opacity: 0; } 40% { transform: translate(-50%,-50%) scale(1.15); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.95; } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 15px rgba(124,58,237,0.15); } 50% { box-shadow: 0 0 30px rgba(124,58,237,0.3); } }
        @keyframes hpDrain { from { filter: brightness(1.5); } to { filter: brightness(1); } }
        @keyframes victoryPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes gameOverIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .float-dmg { position: absolute; top: 5px; left: 50%; transform: translateX(-50%); font-weight: 900; pointer-events: none; z-index: 100; text-shadow: 0 2px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.5); animation: floatUp 1.4s ease-out forwards; white-space: nowrap; letter-spacing: -0.5px; }
        .float-dmg.normal { font-size: 28px; color: #f87171; }
        .float-dmg.critical { font-size: 36px; color: #ff6b35; text-shadow: 0 0 25px rgba(255,107,53,0.8), 0 2px 8px rgba(0,0,0,0.9); }
        .float-dmg.critical-label { font-size: 20px; color: #facc15; text-shadow: 0 0 15px rgba(250,204,21,0.8); }
        .float-dmg.heal { font-size: 26px; color: #4ade80; text-shadow: 0 0 15px rgba(74,222,128,0.5); }
        .float-dmg.miss { font-size: 22px; color: #6b7280; font-style: italic; }
        .float-dmg.super-effective { font-size: 19px; color: #22c55e; text-shadow: 0 0 10px rgba(34,197,94,0.7); }
        .float-dmg.not-effective { font-size: 17px; color: #6b7280; font-style: italic; }
        .float-dmg.status-apply { font-size: 19px; color: #f97316; }
        .float-dmg.status-block { font-size: 20px; color: #67e8f9; }
        .float-dmg.status-dmg { font-size: 22px; color: #f97316; }
        .float-dmg.reactive { font-size: 18px; color: #ec4899; font-style: italic; }
        .float-dmg.ko { font-size: 32px; color: #ef4444; text-shadow: 0 0 20px rgba(239,68,68,0.8); }
        .float-dmg.switch { font-size: 17px; color: #38bdf8; }
        .float-dmg.buff { font-size: 17px; color: #c084fc; }
        .float-dmg.resurrect { font-size: 22px; color: #fbbf24; text-shadow: 0 0 18px rgba(251,191,36,0.7); }
        .float-dmg.shield { font-size: 19px; color: #60a5fa; text-shadow: 0 0 12px rgba(96,165,250,0.6); }
        .float-dmg.cured { font-size: 19px; color: #4ade80; text-shadow: 0 0 12px rgba(74,222,128,0.5); font-style: italic; }
        .creature-lunge-right { animation: lungeRight 0.5s ease-out; }
        .creature-lunge-left { animation: lungeLeft 0.5s ease-out; }
        .creature-hit { animation: recoilHit 0.35s ease-out; }
        .arena-shake { animation: arenaShake 0.35s ease-out; }
        .atk-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 14px; font-weight: 800; color: white; padding: 5px 16px; border-radius: 10px; pointer-events: none; z-index: 50; animation: fadeInLabel 0.6s ease-out forwards; white-space: nowrap; text-shadow: 0 1px 6px rgba(0,0,0,0.6); letter-spacing: 0.3px; }
        .log-entry-anim { animation: slideLog 0.2s ease-out; }
        .arena-glow { animation: pulseGlow 3s ease-in-out infinite; }
        .game-over-anim { animation: gameOverIn 0.5s ease-out; }
      `}</style>

      {/* ===== HEADER BAR ===== */}
      <div className="flex items-center justify-between mb-3">
        {/* My info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-blue-600/30 border border-purple-500/20 flex items-center justify-center text-[16px]">⚔️</div>
          <div>
            <p className="text-[14px] font-extrabold text-white">{myState?.username || 'Tu'}</p>
            <div className="flex gap-1.5 mt-0.5">
              {myState?.team?.map((c, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${c.currentHP > 0 ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-red-500/40'} ${c.isActive ? 'ring-1 ring-yellow-400 scale-125' : ''}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Center: Turn + Speed */}
        <div className="flex items-center gap-4">
          <div className="bg-[#0a0a20]/80 border border-white/[0.08] rounded-xl px-4 py-2 flex items-center gap-3">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Turno</span>
            <span className="text-[18px] font-extrabold text-white">{state?.turn || 1}</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <button key={s} onClick={() => changeSpeed(s)}
                className={`w-8 h-8 rounded-lg text-[11px] font-bold transition-all ${
                  speed === s ? 'bg-purple-500/30 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(124,58,237,0.3)]' : 'bg-white/[0.04] text-gray-600 border border-white/[0.06] hover:text-purple-300'
                }`}>
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Enemy info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[14px] font-extrabold text-white">{enemyState?.username || opponent?.username || 'Rival'}</p>
            <div className="flex gap-1.5 mt-0.5 justify-end">
              {enemyState?.team?.map((c, i) => (
                <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${c.currentHP > 0 ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'bg-red-500/40'} ${c.isActive ? 'ring-1 ring-yellow-400 scale-125' : ''}`} />
              ))}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/30 to-orange-600/30 border border-red-500/20 flex items-center justify-center text-[16px]">💀</div>
        </div>
      </div>

      {/* ===== ARENA ===== */}
      <div className={`relative rounded-3xl p-1 mb-3 ${arenaShake ? 'arena-shake' : ''}`}
        style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(59,130,246,0.1), rgba(124,58,237,0.15))' }}>
        <div className="bg-[#080818] rounded-[22px] p-6 arena-glow relative overflow-hidden">
          {/* Background effect */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle at 25% 50%, rgba(124,58,237,0.4), transparent 50%), radial-gradient(circle at 75% 50%, rgba(239,68,68,0.3), transparent 50%)' }} />

          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center relative z-10">
            {/* LEFT: Player side */}
            <CreatureBattlePanel
              creature={side === 'player1' ? myActive : enemyActive}
              teamData={side === 'player1' ? myState : enemyState}
              label={side === 'player1' ? (myState?.username || 'Tu') : (enemyState?.username || 'Rival')}
              isMe={side === 'player1'}
              animClass={p1Anim === 'lunge-right' ? 'creature-lunge-right' : p1Anim === 'hit' ? 'creature-hit' : ''}
              floats={getFloats('player1')}
              atkLabel={atkLabel?.side === 'player1' ? atkLabel : null}
              align="left"
            />

            {/* VS Divider */}
            <div className="flex flex-col items-center gap-2 px-2">
              <div className="w-[1px] h-16 bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
              <div className="text-[13px] font-black text-purple-500/50 tracking-[3px]">VS</div>
              <div className="w-[1px] h-16 bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
            </div>

            {/* RIGHT: Enemy side */}
            <CreatureBattlePanel
              creature={side === 'player2' ? myActive : enemyActive}
              teamData={side === 'player2' ? myState : enemyState}
              label={side === 'player2' ? (myState?.username || 'Tu') : (enemyState?.username || 'Rival')}
              isMe={side === 'player2'}
              animClass={p2Anim === 'lunge-left' ? 'creature-lunge-left' : p2Anim === 'hit' ? 'creature-hit' : ''}
              floats={getFloats('player2')}
              atkLabel={atkLabel?.side === 'player2' ? atkLabel : null}
              align="right"
            />
          </div>
        </div>
      </div>

      {/* ===== GAME OVER OVERLAY ===== */}
      {gameOver && (
        <div className="game-over-anim mb-3">
          <div className="relative rounded-3xl p-1"
            style={{ background: gameOver.won ? 'linear-gradient(135deg, rgba(234,179,8,0.3), rgba(249,115,22,0.2))' : 'linear-gradient(135deg, rgba(239,68,68,0.3), rgba(127,29,29,0.2))' }}>
            <div className="bg-[#080818] rounded-[22px] p-8 text-center relative overflow-hidden">
              {/* Background glow */}
              <div className="absolute inset-0" style={{
                background: gameOver.won
                  ? 'radial-gradient(circle at 50% 30%, rgba(234,179,8,0.1), transparent 60%)'
                  : 'radial-gradient(circle at 50% 30%, rgba(239,68,68,0.1), transparent 60%)'
              }} />

              <div className="relative z-10">
                <div className="text-[72px] mb-2" style={{ filter: gameOver.won ? 'drop-shadow(0 0 20px rgba(234,179,8,0.5))' : 'drop-shadow(0 0 20px rgba(239,68,68,0.5))' }}>
                  {gameOver.won ? '🏆' : '💀'}
                </div>
                <h2 className={`text-[36px] font-black mb-1 tracking-tight ${gameOver.won ? 'text-yellow-400' : 'text-red-400'}`}
                  style={{ textShadow: gameOver.won ? '0 0 30px rgba(234,179,8,0.4)' : '0 0 30px rgba(239,68,68,0.4)' }}>
                  {gameOver.won ? '¡VICTORIA!' : 'DERROTA'}
                </h2>
                {gameOver.reason === 'abandon' && <p className="text-gray-500 text-[13px] mb-3">El rival abandonó la batalla</p>}

                <div className="flex justify-center gap-6 my-5">
                  <div className={`px-6 py-3 rounded-2xl border ${
                    gameOver.won ? 'bg-green-500/[0.06] border-green-500/20' : 'bg-red-500/[0.06] border-red-500/20'
                  }`}>
                    <div className={`text-[28px] font-black ${gameOver.won ? 'text-green-400' : 'text-red-400'}`}>
                      {gameOver.won ? '+' : '-'}{gameOver.eloChange}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-[2px] font-bold">ELO</div>
                  </div>
                  <div className="px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="text-[28px] font-black text-white">
                      {myState?.team?.filter(c => c.currentHP > 0).length || 0}<span className="text-gray-600">/3</span>
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-[2px] font-bold">Vivos</div>
                  </div>
                  <div className="px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="text-[28px] font-black text-purple-400">{state?.turn || '?'}</div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-[2px] font-bold">Turnos</div>
                  </div>
                </div>

                <button onClick={onEnd}
                  className="mt-2 px-10 py-3.5 rounded-2xl text-[15px] font-bold text-white hover:scale-[1.03] transition-all"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 25px rgba(124,58,237,0.35)' }}>
                  Volver al Lobby
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== BATTLE LOG ===== */}
      <div className="rounded-2xl p-1" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))' }}>
        <div ref={logRef} className="bg-[#060614] rounded-[14px] p-4 max-h-52 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            <h4 className="text-[10px] uppercase tracking-[2px] text-gray-600 font-bold">Registro de batalla</h4>
          </div>
          {log.map((entry, i) => (
            <div key={i} className={`py-[4px] border-b border-white/[0.02] text-[12px] log-entry-anim ${
              entry.type === 'victory' ? 'text-yellow-400 font-extrabold text-[15px] py-2' :
              entry.type === 'defeat' ? 'text-red-400 font-extrabold text-[15px] py-2' :
              entry.type === 'damage' || entry.type === 'ko' ? 'text-red-400/80' :
              entry.type === 'heal' || entry.type === 'resurrect' ? 'text-green-400/80' :
              entry.type === 'effect' || entry.type === 'statusDmg' ? 'text-orange-400/80' :
              entry.type === 'buff' || entry.type === 'entry' ? 'text-purple-400/80' :
              'text-gray-500'
            }`}>
              {entry.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Creature Battle Panel (REDESIGNED)
// ============================================
function CreatureBattlePanel({ creature, teamData, label, isMe, animClass, floats, atkLabel, align }) {
  if (!creature) return <div className="text-center py-16 text-gray-700">Esperando...</div>;

  const hpPct = Math.max(0, Math.min(100, (creature.currentHP / creature.maxHP) * 100));
  const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#ef4444';
  const hpGlow = hpPct > 50 ? 'rgba(34,197,94,0.3)' : hpPct > 25 ? 'rgba(234,179,8,0.3)' : 'rgba(239,68,68,0.3)';
  const rarColor = RARITY_COLORS[creature.rarity] || '#8b5cf6';

  return (
    <div className={`text-center ${align === 'left' ? '' : ''}`}>
      {/* Player label */}
      <p className={`text-[10px] uppercase tracking-[2px] font-bold mb-3 ${isMe ? 'text-purple-400/60' : 'text-red-400/60'}`}>{label}</p>

      {/* Creature display */}
      <div className="relative inline-block mb-3">
        {/* Glow behind creature */}
        <div className="absolute inset-0 rounded-full blur-2xl opacity-20"
          style={{ background: rarColor, transform: 'scale(0.8)' }} />

        <div className={`relative transition-all ${animClass}`}>
          <CreatureAvatar name={creature.name} types={creature.types || []} rarity={creature.rarity || 'Comun'} size={130} />
        </div>

        {/* Floating damage numbers */}
        {floats.map(f => (
          <div key={f.id} className={`float-dmg ${f.style}`}>{f.text}</div>
        ))}
        {/* Attack label */}
        {atkLabel && (
          <div className="atk-label" style={{ background: TYPE_COLORS[atkLabel.type] || '#8b5cf6', boxShadow: `0 2px 15px ${TYPE_COLORS[atkLabel.type] || '#8b5cf6'}66` }}>
            ⚔ {atkLabel.name}
          </div>
        )}
      </div>

      {/* Name + Rarity */}
      <h3 className="text-[16px] font-black text-white tracking-tight">{creature.name}</h3>
      <div className="flex justify-center gap-1 mt-1 mb-2">
        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: rarColor + '20', color: rarColor }}>{creature.rarity}</span>
        {creature.types?.map(t => (
          <span key={t} className="text-[8px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: (TYPE_COLORS[t] || '#8b5cf6') + '18', color: TYPE_COLORS[t] || '#8b5cf6' }}>{t}</span>
        ))}
      </div>

      {/* HP Bar - Improved */}
      <div className="max-w-[200px] mx-auto">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[10px] font-bold text-gray-500">HP</span>
          <span className="text-[12px] font-mono font-bold" style={{ color: hpColor }}>
            {Math.max(0, Math.round(creature.currentHP))}<span className="text-gray-600">/{creature.maxHP}</span>
          </span>
        </div>
        <div className="w-full h-[10px] bg-white/[0.06] rounded-full overflow-hidden border border-white/[0.04]">
          <div className="h-full rounded-full transition-all duration-700 relative"
            style={{ width: `${hpPct}%`, background: `linear-gradient(90deg, ${hpColor}, ${hpColor}cc)`, boxShadow: `0 0 8px ${hpGlow}` }}>
            <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 60%)' }} />
          </div>
        </div>
      </div>

      {/* Status effect */}
      {creature.status && (
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border"
          style={{ background: (STATUS_COLORS[creature.status] || '#888') + '15', color: STATUS_COLORS[creature.status] || '#888', borderColor: (STATUS_COLORS[creature.status] || '#888') + '30' }}>
          {STATUS_ICONS[creature.status]} {creature.status}
        </div>
      )}

      {/* Ability */}
      {creature.ability && (
        <p className="text-[10px] text-purple-400/70 mt-1.5 font-medium" title={ABILITIES[creature.ability]?.desc || ''}>
          ★ {creature.ability}
        </p>
      )}

      {/* Team indicators */}
      <div className="flex justify-center gap-3 mt-3">
        {teamData?.team?.map((c, i) => {
          const cTypes = Array.isArray(c.types) ? c.types : [c.types];
          const alive = c.currentHP > 0;
          return (
            <div key={i} className={`flex flex-col items-center gap-1 transition-all ${c.isActive ? 'scale-110' : 'opacity-60'}`}
              title={`${c.name} (${Math.round(c.currentHP)}/${c.maxHP})`}>
              <div className={`rounded-lg overflow-hidden border-2 transition-all ${
                c.isActive ? 'border-yellow-400/60 shadow-[0_0_8px_rgba(234,179,8,0.3)]' :
                alive ? 'border-white/10' : 'border-red-500/20 grayscale'
              }`}>
                <CreatureAvatar name={c.name} types={cTypes} rarity={c.rarity} size={36} />
              </div>
              {/* Mini HP bar */}
              <div className="w-9 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(c.currentHP / c.maxHP) * 100}%`, background: c.currentHP / c.maxHP > 0.5 ? '#22c55e' : c.currentHP / c.maxHP > 0.25 ? '#eab308' : '#ef4444' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Event formatting
// ============================================
function formatEvent(event, mySide) {
  return { text: formatEventText(event, mySide), type: event.type };
}

function formatEventText(event, mySide) {
  const isMe = event.side === mySide;
  const who = isMe ? 'Tu' : 'Rival';

  switch (event.type) {
    case 'attack':
      if (event.frozen) return `${who} ${event.creature || ''} está congelado y no puede atacar`;
      if (event.frozenThaw) return `${who} ${event.creature || ''} se descongela!`;
      if (event.paralyzed) return `${who} ${event.creature || ''} está paralizado!`;
      if (event.missed) return `${who} usa ${event.attack} pero falla!`;
      if (event.dodged) return `${isMe ? 'Rival' : 'Tu criatura'} esquiva ${event.attack}!${event.ethereal ? ' [Fase Etérea]' : ''}`;
      let t = `${who} usa ${event.attack}: -${event.damage} daño`;
      if (event.critical) t += ' ¡CRÍTICO!';
      if (event.effective > 1) t += ' ¡Super efectivo!';
      if (event.effective < 1) t += ' Poco efectivo...';
      if (event.effect) t += ` [${event.effect}]`;
      if (event.reactiveEffect) t += ` → ${event.reactiveEffect}`;
      if (event.recoil > 0) t += ` (retroceso: -${event.recoil})`;
      if (event.mirrorDmg > 0) t += ` (espejo: -${event.mirrorDmg})`;
      if (event.absorbed) t += ` (+${event.absorbed} absorbido)`;
      if (event.ironWillTriggered) t += ' [Voluntad de Hierro]';
      return t;
    case 'ko': return `💀 ${event.creature} eliminado!`;
    case 'switch': return `${event.auto ? '⟲' : '🔄'} ${isMe ? 'Sacas a' : 'Rival saca a'} ${event.creature}`;
    case 'heal': return `💚 +${event.amount} HP [${event.ability}]`;
    case 'statusDmg': return `${STATUS_ICONS[event.status] || '⚠'} Daño por ${event.status}: -${event.damage}`;
    case 'statusCured': return `✨ Se cura de ${event.status}`;
    case 'resurrect': return `✨ ${event.creature} resucita!`;
    case 'buff': return `⬆ ${event.ability}${event.value ? ` (+${event.value}%)` : ''}`;
    case 'entry': return `⚡ ${event.creature}: ${event.ability}!${event.healed ? ` (cura ${event.amount} a ${event.healed})` : ''}`;
    case 'esporas': return `🍄 Esporas: ${event.target} sufre ${event.status}!`;
    case 'simbiosis': return `☠ Simbiosis: ${event.target} recibe ${event.status}!`;
    case 'victory': return null;
    case 'defeat': return null;
    case 'gameOver': return null;
    default: return null;
  }
}
