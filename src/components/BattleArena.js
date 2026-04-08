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
  const [floats, setFloats] = useState([]); // floating damage numbers
  const [p1Anim, setP1Anim] = useState(''); // lunge-right, hit, etc.
  const [p2Anim, setP2Anim] = useState('');
  const [atkLabel, setAtkLabel] = useState(null); // { side, name, type }
  const [arenaShake, setArenaShake] = useState(false);
  const logRef = useRef(null);
  const floatIdRef = useRef(0);

  // Floating damage spawn
  const spawnFloat = useCallback((targetSide, text, style) => {
    const id = ++floatIdRef.current;
    setFloats(prev => [...prev, { id, targetSide, text, style }]);
    setTimeout(() => setFloats(prev => prev.filter(f => f.id !== id)), 1500);
  }, []);

  // Process battle events into animations
  const processEvents = useCallback((events, attacksUsed) => {
    if (!events || events.length === 0) return;
    const mySide = side;

    let delay = 0;
    // Filter out victory/defeat events - these are handled by battle:end
    const filtered = events.filter(e => e.type !== 'victory' && e.type !== 'defeat' && e.type !== 'gameOver');
    filtered.forEach((e) => {
      setTimeout(() => {
        // Log entry
        const logEntry = formatEvent(e, mySide);
        if (logEntry && logEntry.text) setLog(prev => [...prev, logEntry]);

        const targetSide = e.side; // 'player1' or 'player2'
        const otherSide = targetSide === 'player1' ? 'player2' : 'player1';

        switch (e.type) {
          case 'attack': {
            if (e.frozen || e.paralyzed) {
              spawnFloat(targetSide, e.frozen ? '❄️ Congelado!' : '⚡ Paralizado!', 'status-block');
              SFX.statusEffect();
              break;
            }
            if (e.frozenThaw) {
              spawnFloat(targetSide, '¡Descongelado!', 'heal');
              break;
            }

            // Show attack label
            setAtkLabel({ side: targetSide, name: e.attack || '???', type: e.attackType });
            setTimeout(() => setAtkLabel(null), 800);

            // Lunge animation for attacker
            if (targetSide === 'player1') {
              setP1Anim('lunge-right'); setTimeout(() => setP1Anim(''), 550);
            } else {
              setP2Anim('lunge-left'); setTimeout(() => setP2Anim(''), 550);
            }

            if (e.missed) {
              setTimeout(() => spawnFloat(otherSide, e.dodged ? 'Esquiva!' : '¡Fallo!', 'miss'), 200);
              SFX.attackMiss();
              break;
            }
            if (e.dodged) {
              setTimeout(() => spawnFloat(otherSide, e.ethereal ? 'Fase Etérea!' : '¡Esquiva!', 'miss'), 200);
              SFX.attackMiss();
              break;
            }

            // Hit animation for defender
            setTimeout(() => {
              if (otherSide === 'player1') { setP1Anim('hit'); setTimeout(() => setP1Anim(''), 300); }
              else { setP2Anim('hit'); setTimeout(() => setP2Anim(''), 300); }
            }, 200);

            // Damage number
            setTimeout(() => spawnFloat(otherSide, `-${e.damage}`, e.critical ? 'critical' : 'normal'), 250);

            // Effectiveness
            if (e.effective > 1) {
              setTimeout(() => spawnFloat(otherSide, '¡Super Eficaz!', 'super-effective'), 500);
              SFX.superEffective();
              setArenaShake(true); setTimeout(() => setArenaShake(false), 400);
            } else if (e.effective < 1) {
              setTimeout(() => spawnFloat(otherSide, 'Poco Eficaz...', 'not-effective'), 500);
              SFX.attackHit();
            } else {
              SFX.attackHit();
            }

            if (e.critical) setTimeout(() => spawnFloat(otherSide, '¡CRÍTICO!', 'critical-label'), 400);

            // Status applied
            if (e.effect) {
              setTimeout(() => {
                spawnFloat(otherSide, `${STATUS_ICONS[e.effect] || '⚠'} ${e.effect}!`, 'status-apply');
                SFX.statusEffect();
              }, 600);
            }

            // Reactive effects
            if (e.reactiveEffect) {
              setTimeout(() => {
                spawnFloat(targetSide, `${STATUS_ICONS[e.reactiveEffect] || '⚠'} ${e.reactiveEffect}!`, 'reactive');
                SFX.statusEffect();
              }, 700);
            }

            // Recoil
            if (e.recoil > 0) {
              setTimeout(() => spawnFloat(targetSide, `-${e.recoil}`, 'normal'), 600);
            }

            // Mirror damage
            if (e.mirrorDmg > 0) {
              setTimeout(() => spawnFloat(targetSide, `-${e.mirrorDmg} Espejo!`, 'super-effective'), 600);
            }

            // Absorbed
            if (e.absorbed) {
              setTimeout(() => { spawnFloat(otherSide, `+${e.absorbed}`, 'heal'); SFX.heal(); }, 400);
            }

            // Iron will
            if (e.ironWillTriggered) {
              setTimeout(() => spawnFloat(otherSide, '¡Voluntad de Hierro!', 'buff'), 500);
            }
            break;
          }
          case 'ko':
            spawnFloat(targetSide, '💀 KO!', 'ko');
            SFX.creatureKO();
            break;
          case 'switch':
            spawnFloat(targetSide, `↪ ${e.creature}`, 'switch');
            SFX.switchCreature();
            break;
          case 'heal':
            spawnFloat(targetSide, `+${e.amount} HP`, 'heal');
            SFX.heal();
            break;
          case 'statusDmg':
            spawnFloat(targetSide, `${STATUS_ICONS[e.status] || ''} -${e.damage}`, 'status-dmg');
            break;
          case 'resurrect':
            spawnFloat(targetSide, '✨ Resurrección!', 'resurrect');
            SFX.resurrect();
            break;
          case 'buff':
          case 'entry':
            spawnFloat(targetSide, `⬆ ${e.ability}`, 'buff');
            break;
          case 'esporas':
            spawnFloat(targetSide === 'player1' ? 'player2' : 'player1', `🍄 ${e.status}!`, 'status-apply');
            SFX.statusEffect();
            break;
        }
      }, delay);
      delay += 150; // stagger events
    });
  }, [side, spawnFloat]);

  // Listen to battle events
  useEffect(() => {
    if (!on) return;
    const unsubs = [
      on('battle:turnResult', (data) => {
        setState(data.state);
        processEvents(data.result?.events, data.attacks);
      }),
      on('battle:end', (data) => {
        setState(data.state);
        const won = data.winnerId === playerId;
        setGameOver({ won, eloChange: data.eloChange || 0, reason: data.reason });
        setLog(prev => [...prev, {
          text: won ? '🏆 ¡VICTORIA!' : '💀 Derrota...',
          type: won ? 'victory' : 'defeat',
        }]);
        if (won) SFX.victory(); else SFX.defeat();
      }),
    ];
    return () => unsubs.forEach(u => u?.());
  }, [on, playerId, processEvents]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Speed change
  const changeSpeed = (s) => {
    setSpeed(s);
    emit('battle:speed', { speed: s });
  };

  const myState = state ? state[side] : null;
  const enemySide = side === 'player1' ? 'player2' : 'player1';
  const enemyState = state ? state[enemySide] : null;
  const myActive = myState?.team?.find(c => c.isActive);
  const enemyActive = enemyState?.team?.find(c => c.isActive);

  // Get floats for a side
  const getFloats = (targetSide) => floats.filter(f => f.targetSide === targetSide);

  return (
    <div className="max-w-4xl mx-auto">
      <style jsx global>{`
        @keyframes floatUp { 0% { transform: translateX(-50%) translateY(0); opacity: 1; } 100% { transform: translateX(-50%) translateY(-80px); opacity: 0; } }
        @keyframes lungeRight { 0% { transform: translateX(0) scale(1); } 30% { transform: translateX(40px) scale(1.1); } 60% { transform: translateX(40px) scale(1.1); } 100% { transform: translateX(0) scale(1); } }
        @keyframes lungeLeft { 0% { transform: translateX(0) scale(1); } 30% { transform: translateX(-40px) scale(1.1); } 60% { transform: translateX(-40px) scale(1.1); } 100% { transform: translateX(0) scale(1); } }
        @keyframes recoilHit { 0% { filter: brightness(1); } 15% { filter: brightness(2.5) saturate(0); transform: translateX(8px); } 30% { filter: brightness(1.5); transform: translateX(-5px); } 100% { filter: brightness(1); transform: translateX(0); } }
        @keyframes arenaShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px) rotate(-0.5deg); } 75% { transform: translateX(4px) rotate(0.5deg); } }
        @keyframes slideLog { 0% { transform: translateX(-10px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
        @keyframes fadeInLabel { 0% { transform: translate(-50%,-50%) scale(0.7); opacity: 0; } 50% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; } 100% { transform: translate(-50%,-50%) scale(1); opacity: 0.9; } }
        .float-dmg { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-weight: 900; pointer-events: none; z-index: 100; text-shadow: 0 2px 10px rgba(0,0,0,0.9); animation: floatUp 1.4s ease-out forwards; white-space: nowrap; }
        .float-dmg.normal { font-size: 26px; color: #f87171; }
        .float-dmg.critical { font-size: 32px; color: #ff6b35; text-shadow: 0 0 20px rgba(255,107,53,0.7); }
        .float-dmg.critical-label { font-size: 18px; color: #facc15; text-shadow: 0 0 12px rgba(250,204,21,0.7); }
        .float-dmg.heal { font-size: 24px; color: #4ade80; text-shadow: 0 0 12px rgba(74,222,128,0.4); }
        .float-dmg.miss { font-size: 20px; color: #8888bb; font-style: italic; }
        .float-dmg.super-effective { font-size: 18px; color: #22c55e; font-weight: 700; text-shadow: 0 0 8px rgba(34,197,94,0.6); }
        .float-dmg.not-effective { font-size: 16px; color: #6b7280; font-style: italic; }
        .float-dmg.status-apply { font-size: 17px; color: #f97316; font-weight: 600; }
        .float-dmg.status-block { font-size: 18px; color: #67e8f9; font-weight: 700; }
        .float-dmg.status-dmg { font-size: 20px; color: #f97316; }
        .float-dmg.reactive { font-size: 17px; color: #ec4899; font-style: italic; }
        .float-dmg.ko { font-size: 28px; color: #ef4444; text-shadow: 0 0 15px rgba(239,68,68,0.7); }
        .float-dmg.switch { font-size: 16px; color: #38bdf8; }
        .float-dmg.buff { font-size: 16px; color: #c084fc; }
        .float-dmg.resurrect { font-size: 20px; color: #fbbf24; text-shadow: 0 0 15px rgba(251,191,36,0.6); }
        .creature-lunge-right { animation: lungeRight 0.5s ease-out; }
        .creature-lunge-left { animation: lungeLeft 0.5s ease-out; }
        .creature-hit { animation: recoilHit 0.35s ease-out; }
        .arena-shake { animation: arenaShake 0.35s ease-out; }
        .atk-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 13px; font-weight: 800; color: white; padding: 4px 12px; border-radius: 8px; pointer-events: none; z-index: 50; animation: fadeInLabel 0.6s ease-out forwards; white-space: nowrap; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
        .log-entry-anim { animation: slideLog 0.2s ease-out; }
      `}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-4 bg-[#0a0a20]/80 backdrop-blur-xl border border-white/[0.06] rounded-2xl px-5 py-3">
        <div className="text-[13px]">
          <span className="text-white font-bold">{myState?.username || 'Tu'}</span>
          <span className="text-purple-400 font-extrabold mx-2">VS</span>
          <span className="text-white font-bold">{enemyState?.username || opponent?.username || 'Rival'}</span>
        </div>
        {/* Speed controls */}
        <div className="flex items-center gap-1">
          {[1, 2, 3].map(s => (
            <button key={s} onClick={() => changeSpeed(s)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                speed === s ? 'bg-purple-500/30 text-purple-300 border border-purple-500/30' : 'bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-purple-300'
              }`}>
              x{s}
            </button>
          ))}
        </div>
        <div className="text-[12px] text-gray-500">Turno {state?.turn || 1}</div>
      </div>

      {/* ARENA */}
      <div className={`bg-[#0a0a20]/60 backdrop-blur-xl border border-purple-500/10 rounded-2xl p-6 mb-4 ${arenaShake ? 'arena-shake' : ''}`}>
        <div className="grid grid-cols-2 gap-8">
          {/* --- LEFT: PLAYER 1 (or 'me' perspective) --- */}
          <CreatureBattlePanel
            creature={side === 'player1' ? myActive : enemyActive}
            teamData={side === 'player1' ? myState : enemyState}
            label={side === 'player1' ? (myState?.username || 'Tu') : (enemyState?.username || 'Rival')}
            isMe={side === 'player1'}
            animClass={p1Anim === 'lunge-right' ? 'creature-lunge-right' : p1Anim === 'hit' ? 'creature-hit' : ''}
            floats={getFloats('player1')}
            atkLabel={atkLabel?.side === 'player1' ? atkLabel : null}
          />
          {/* VS */}
          <CreatureBattlePanel
            creature={side === 'player2' ? myActive : enemyActive}
            teamData={side === 'player2' ? myState : enemyState}
            label={side === 'player2' ? (myState?.username || 'Tu') : (enemyState?.username || 'Rival')}
            isMe={side === 'player2'}
            animClass={p2Anim === 'lunge-left' ? 'creature-lunge-left' : p2Anim === 'hit' ? 'creature-hit' : ''}
            floats={getFloats('player2')}
            atkLabel={atkLabel?.side === 'player2' ? atkLabel : null}
          />
        </div>
      </div>

      {/* GAME OVER */}
      {gameOver && (
        <div className="bg-[#0a0a20]/90 border border-purple-500/15 rounded-2xl p-8 text-center mb-4">
          <div className="text-[60px] mb-3">{gameOver.won ? '🏆' : '💀'}</div>
          <h2 className={`text-3xl font-extrabold mb-2 ${gameOver.won ? 'text-yellow-400' : 'text-red-400'}`}>
            {gameOver.won ? '¡VICTORIA!' : 'Derrota'}
          </h2>
          {gameOver.reason === 'abandon' && <p className="text-gray-500 text-sm mb-2">El rival abandonó</p>}
          <div className="flex justify-center gap-8 my-4">
            <div className="text-center">
              <div className={`text-[22px] font-extrabold ${gameOver.won ? 'text-green-400' : 'text-red-400'}`}>
                {gameOver.won ? '+' : '-'}{gameOver.eloChange}
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">ELO</div>
            </div>
            <div className="text-center">
              <div className="text-[22px] font-extrabold text-white">
                {myState?.team?.filter(c => c.currentHP > 0).length || 0}/3
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">Supervivientes</div>
            </div>
          </div>
          <button onClick={onEnd}
            className="mt-2 px-8 py-3 rounded-xl text-[14px] font-bold text-white hover:scale-[1.03] transition-all"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>
            Volver al Lobby
          </button>
        </div>
      )}

      {/* LOG */}
      <div ref={logRef} className="bg-[#060618]/60 border border-white/[0.04] rounded-xl p-4 max-h-56 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
        <h4 className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Registro de batalla</h4>
        {log.map((entry, i) => (
          <div key={i} className={`py-[3px] border-b border-white/[0.03] text-[12px] log-entry-anim ${
            entry.type === 'victory' ? 'text-yellow-400 font-bold text-[14px]' :
            entry.type === 'defeat' ? 'text-red-400 font-bold text-[14px]' :
            entry.type === 'damage' || entry.type === 'ko' ? 'text-red-400' :
            entry.type === 'heal' || entry.type === 'resurrect' ? 'text-green-400' :
            entry.type === 'effect' || entry.type === 'statusDmg' ? 'text-orange-400' :
            entry.type === 'buff' || entry.type === 'entry' ? 'text-purple-400' :
            'text-[#7777aa]'
          }`}>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// Creature Battle Panel
// ============================================
function CreatureBattlePanel({ creature, teamData, label, isMe, animClass, floats, atkLabel }) {
  if (!creature) return <div className="text-center py-12 text-gray-600">Esperando...</div>;

  return (
    <div className="text-center">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">{label}</p>
      {/* Creature with animations */}
      <div className="relative inline-block">
        <div className={`transition-all ${animClass}`}>
          <CreatureAvatar name={creature.name} types={creature.types || []} rarity={creature.rarity || 'Comun'} size={110} />
        </div>
        {/* Floating damage numbers */}
        {floats.map(f => (
          <div key={f.id} className={`float-dmg ${f.style}`}>{f.text}</div>
        ))}
        {/* Attack label */}
        {atkLabel && (
          <div className="atk-label" style={{ background: TYPE_COLORS[atkLabel.type] || '#8b5cf6' }}>
            ⚔ {atkLabel.name}
          </div>
        )}
      </div>
      {/* Name + types */}
      <h3 className="text-[15px] font-extrabold text-white mt-2 mb-1">{creature.name}</h3>
      <div className="flex justify-center gap-1 mb-1">
        {creature.types?.map(t => (
          <span key={t} className="text-[9px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: (TYPE_COLORS[t] || '#8b5cf6') + '22', color: TYPE_COLORS[t] || '#8b5cf6' }}>{t}</span>
        ))}
      </div>
      {/* HP Bar */}
      <HPBar current={creature.currentHP} max={creature.maxHP} />
      {/* Status */}
      {creature.status && (
        <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: (STATUS_COLORS[creature.status] || '#888') + '22', color: STATUS_COLORS[creature.status] || '#888' }}>
          {STATUS_ICONS[creature.status]} {creature.status}
        </div>
      )}
      {/* Ability */}
      {creature.ability && (
        <p className="text-[10px] text-purple-400 mt-1" title={ABILITIES[creature.ability]?.desc || ''}>★ {creature.ability}</p>
      )}
      {/* Team dots */}
      <div className="flex justify-center gap-2 mt-2">
        {teamData?.team?.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5" title={`${c.name} (${Math.round(c.currentHP)}/${c.maxHP})`}>
            <div className={`w-3 h-3 rounded-full border ${c.isActive ? 'border-yellow-400 scale-125' : 'border-transparent'} ${
              c.currentHP > 0 ? 'bg-green-500' : 'bg-red-500/50'}`} />
            <span className="text-[7px] text-gray-600">{c.name?.slice(0, 4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HPBar({ current, max }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? '#22c55e' : pct > 25 ? '#eab308' : '#ef4444';
  return (
    <div>
      <div className="w-full h-[8px] bg-white/[0.06] rounded-full overflow-hidden mt-1">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{Math.max(0, Math.round(current))}/{max}</p>
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
    case 'defend': return `🛡 ${isMe ? 'Te' : 'Rival se'} defiende`;
    case 'buff': return `⬆ ${event.ability}${event.value ? ` (+${event.value}%)` : ''}`;
    case 'entry': return `⚡ ${event.creature}: ${event.ability}!${event.healed ? ` (cura ${event.amount} a ${event.healed})` : ''}`;
    case 'esporas': return `🍄 Esporas: ${event.target} sufre ${event.status}!`;
    case 'simbiosis': return `☠ Simbiosis: ${event.target} recibe ${event.status}!`;
    case 'victory': return `🏆 ¡VICTORIA!`;
    case 'defeat': return `💀 Derrota...`;
    case 'gameOver': return null;
    default: return null;
  }
}
