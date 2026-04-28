'use client';
import { useState, useEffect } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { useApi } from '@/lib/api';

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};

const RARITY_GLOW = {
  'Comun': 'rgba(156,163,175,0.15)', 'Poco Comun': 'rgba(34,197,94,0.2)', 'Rara': 'rgba(59,130,246,0.25)',
  'Epica': 'rgba(168,85,247,0.3)', 'Legendaria': 'rgba(234,179,8,0.35)', 'Unica': 'rgba(239,68,68,0.4)',
};

export default function Matchmaking({ selectedTeam, creatures, emit, on, connected, socketReady, privyId }) {
  const api = useApi();
  const [searching, setSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState(null);
  const [pulsePhase, setPulsePhase] = useState(0);

  // Fetch daily battle count
  useEffect(() => {
    if (!privyId) return;
    api('/api/battles?limit=1')
      .then(r => r.json())
      .then(data => setDailyRemaining(data.dailyRemaining ?? null))
      .catch(() => {});
  }, [privyId, api]);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => setSearchTime(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [searching]);

  // Pulse animation for searching
  useEffect(() => {
    if (!searching) return;
    const anim = setInterval(() => setPulsePhase(p => (p + 1) % 360), 50);
    return () => clearInterval(anim);
  }, [searching]);

  useEffect(() => {
    if (!on || !socketReady) return;
    const unsub = on('matchmaking:cancelled', () => { setSearching(false); setSearchTime(0); });
    return () => unsub?.();
  }, [on, socketReady]);

  const startSearch = () => {
    if (selectedTeam.length !== 3) return;
    emit('matchmaking:join', { teamIds: selectedTeam });
    setSearching(true);
    setSearchTime(0);
  };

  const cancelSearch = () => {
    emit('matchmaking:cancel');
    setSearching(false);
    setSearchTime(0);
  };

  const teamCreatures = selectedTeam.map(id => creatures.find(c => c.id === id)).filter(Boolean);
  const canFight = selectedTeam.length === 3 && connected && dailyRemaining !== 0;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', position: 'relative' }}>

      {/* Keyframes */}
      <style>{`
        @keyframes mm-float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-8px); } }
        @keyframes mm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mm-pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
        @keyframes mm-glow-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes mm-slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes mm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes mm-sword-clash {
          0%,100% { transform: rotate(-15deg) scale(1); }
          25% { transform: rotate(5deg) scale(1.15); }
          50% { transform: rotate(-15deg) scale(1); }
          75% { transform: rotate(5deg) scale(1.1); }
        }
        @keyframes mm-dots { 0% { content: ''; } 33% { content: '.'; } 66% { content: '..'; } 100% { content: '...'; } }
      `}</style>

      {/* Title section */}
      <div style={{ textAlign: 'center', marginBottom: 32, animation: 'mm-slide-up 0.5s ease-out' }}>
        <div style={{ fontSize: 42, marginBottom: 4 }}>⚔️</div>
        <h2 style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #fff 0%, #c084fc 50%, #ef4444 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          margin: '0 0 6px 0',
        }}>
          Arena de Combate
        </h2>
        <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
          Combates 3v3 en tiempo real contra otros jugadores
        </p>
      </div>

      {/* Status bar: Connection + Daily remaining */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28,
        animation: 'mm-slide-up 0.6s ease-out',
      }}>
        {/* Connection */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', borderRadius: 999,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.3px',
          background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: connected ? '#4ade80' : '#f87171',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? '#4ade80' : '#f87171',
            boxShadow: connected ? '0 0 8px rgba(74,222,128,0.5)' : '0 0 8px rgba(248,113,113,0.5)',
            animation: 'mm-glow-pulse 2s ease-in-out infinite',
          }} />
          {connected ? 'Servidor PvP' : 'Conectando...'}
        </div>

        {/* Daily battles */}
        {dailyRemaining !== null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 999,
            fontSize: 11, fontWeight: 600,
            background: dailyRemaining > 3 ? 'rgba(168,85,247,0.08)' : dailyRemaining > 0 ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${dailyRemaining > 3 ? 'rgba(168,85,247,0.2)' : dailyRemaining > 0 ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: dailyRemaining > 3 ? '#c084fc' : dailyRemaining > 0 ? '#fbbf24' : '#f87171',
          }}>
            ⚔️ {dailyRemaining > 0 ? `${dailyRemaining}/10 batallas` : 'Sin batallas hoy'}
          </div>
        )}
      </div>

      {/* Team display */}
      {teamCreatures.length > 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(10,10,35,0.8), rgba(20,10,40,0.6))',
          border: '1px solid rgba(168,85,247,0.15)',
          borderRadius: 20, padding: '28px 24px', marginBottom: 28,
          animation: 'mm-slide-up 0.7s ease-out',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle bg glow */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 300, height: 200, borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(168,85,247,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '2px',
            textTransform: 'uppercase', color: '#6b7280', textAlign: 'center',
            marginBottom: 20, position: 'relative',
          }}>
            ✦ Tu Equipo ✦
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 32, position: 'relative' }}>
            {teamCreatures.map((c, i) => {
              const types = Array.isArray(c.types) ? c.types : [c.types];
              const rarColor = RARITY_COLORS[c.rarity] || '#8b5cf6';
              const glow = RARITY_GLOW[c.rarity] || 'rgba(139,92,246,0.2)';
              return (
                <div key={c.id} style={{
                  textAlign: 'center',
                  animation: `mm-float ${3 + i * 0.4}s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}>
                  {/* Creature avatar with glow */}
                  <div style={{
                    position: 'relative', display: 'inline-block', marginBottom: 10,
                  }}>
                    {/* Glow behind */}
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%,-50%)',
                      width: 100, height: 100, borderRadius: '50%',
                      background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
                      filter: 'blur(8px)', pointerEvents: 'none',
                    }} />
                    {/* Ring */}
                    <div style={{
                      width: 96, height: 96, borderRadius: '50%',
                      padding: 3,
                      background: `linear-gradient(135deg, ${rarColor}44, ${rarColor}88, ${rarColor}44)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <div style={{
                        width: 90, height: 90, borderRadius: '50%',
                        background: '#0d0d25',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                      }}>
                        <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={82} />
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 4px 0' }}>
                    {c.name}
                  </p>

                  {/* Rarity badge */}
                  <span style={{
                    display: 'inline-block', fontSize: 9, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 999,
                    background: `${rarColor}18`, color: rarColor,
                    border: `1px solid ${rarColor}30`,
                    letterSpacing: '0.5px',
                  }}>
                    {c.rarity}
                  </span>

                  {/* Stats */}
                  <div style={{
                    display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8,
                  }}>
                    {[
                      { label: 'HP', val: c.hp, color: '#ef4444' },
                      { label: 'ATK', val: c.atk, color: '#f97316' },
                      { label: 'SPD', val: c.spd, color: '#3b82f6' },
                    ].map(s => (
                      <div key={s.label} style={{
                        fontSize: 9, fontWeight: 700, color: s.color,
                        background: `${s.color}12`, padding: '2px 6px',
                        borderRadius: 6, letterSpacing: '0.3px',
                      }}>
                        {s.label} {s.val}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Team power indicator */}
          <div style={{
            textAlign: 'center', marginTop: 20,
            fontSize: 11, color: '#6b7280', fontWeight: 600,
          }}>
            Poder total: <span style={{ color: '#c084fc', fontWeight: 800 }}>
              {teamCreatures.reduce((sum, c) => sum + (c.hp || 0) + (c.atk || 0) + (c.spd || 0), 0)}
            </span>
          </div>
        </div>
      ) : (
        /* No team selected */
        <div style={{
          background: 'rgba(10,10,35,0.3)',
          border: '2px dashed rgba(107,114,128,0.25)',
          borderRadius: 20, padding: '48px 24px', marginBottom: 28,
          textAlign: 'center',
          animation: 'mm-slide-up 0.7s ease-out',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.4 }}>🎭</div>
          <p style={{ fontSize: 15, color: '#9ca3af', margin: '0 0 6px 0', fontWeight: 600 }}>
            Selecciona 3 criaturas para tu equipo
          </p>
          <p style={{ fontSize: 11, color: '#4b5563', margin: 0 }}>
            Ve a tu <span style={{ color: '#a855f7', fontWeight: 700 }}>Coleccion</span> y haz click en las criaturas
          </p>
        </div>
      )}

      {/* Action area */}
      <div style={{ textAlign: 'center', animation: 'mm-slide-up 0.8s ease-out' }}>
        {searching ? (
          /* Searching state */
          <div style={{
            background: 'linear-gradient(135deg, rgba(10,10,35,0.8), rgba(20,10,40,0.6))',
            border: '1px solid rgba(168,85,247,0.2)',
            borderRadius: 20, padding: '36px 24px',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Animated bg */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `conic-gradient(from ${pulsePhase}deg, transparent, rgba(168,85,247,0.05), transparent, rgba(239,68,68,0.05), transparent)`,
              pointerEvents: 'none',
            }} />

            {/* Spinner */}
            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 20px' }}>
              {/* Outer ring */}
              <div style={{
                position: 'absolute', inset: 0,
                border: '3px solid rgba(168,85,247,0.1)',
                borderTopColor: '#a855f7',
                borderRightColor: '#ef4444',
                borderRadius: '50%',
                animation: 'mm-spin 1.2s linear infinite',
              }} />
              {/* Inner ring */}
              <div style={{
                position: 'absolute', inset: 10,
                border: '2px solid rgba(239,68,68,0.1)',
                borderBottomColor: '#ef4444',
                borderLeftColor: '#a855f7',
                borderRadius: '50%',
                animation: 'mm-spin 1.8s linear infinite reverse',
              }} />
              {/* Center icon */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28,
                animation: 'mm-sword-clash 2s ease-in-out infinite',
              }}>
                ⚔️
              </div>
              {/* Pulse rings */}
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: -10,
                  border: '1px solid rgba(168,85,247,0.2)',
                  borderRadius: '50%',
                  animation: `mm-pulse-ring 2s ease-out infinite`,
                  animationDelay: `${i * 0.7}s`,
                }} />
              ))}
            </div>

            {/* Search text */}
            <p style={{
              fontSize: 20, fontWeight: 900, margin: '0 0 6px 0',
              background: 'linear-gradient(135deg, #c084fc, #ef4444)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Buscando oponente
            </p>

            {/* Timer */}
            <div style={{
              fontSize: 28, fontWeight: 900, color: '#fff',
              fontFamily: 'monospace', margin: '8px 0',
              letterSpacing: '2px',
            }}>
              {Math.floor(searchTime / 60).toString().padStart(2, '0')}
              <span style={{ color: '#a855f7', animation: 'mm-glow-pulse 1s ease-in-out infinite' }}>:</span>
              {(searchTime % 60).toString().padStart(2, '0')}
            </div>

            <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 24px 0' }}>
              El rango de ELO se expande con el tiempo
            </p>

            {/* Cancel button */}
            <button onClick={cancelSearch} style={{
              padding: '12px 32px', borderRadius: 14,
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.target.style.background = 'rgba(239,68,68,0.1)';
              e.target.style.borderColor = 'rgba(239,68,68,0.5)';
            }}
            onMouseLeave={e => {
              e.target.style.background = 'transparent';
              e.target.style.borderColor = 'rgba(239,68,68,0.3)';
            }}>
              ✕ Cancelar busqueda
            </button>
          </div>
        ) : (
          /* Fight button */
          <div>
            <button onClick={startSearch} disabled={!canFight} style={{
              padding: '18px 56px', borderRadius: 16,
              fontSize: 18, fontWeight: 900,
              letterSpacing: '0.5px',
              color: '#fff',
              border: 'none',
              cursor: canFight ? 'pointer' : 'not-allowed',
              opacity: canFight ? 1 : 0.4,
              background: canFight
                ? 'linear-gradient(135deg, #dc2626, #b91c1c, #991b1b)'
                : 'rgba(75,85,99,0.3)',
              boxShadow: canFight
                ? '0 4px 30px rgba(220,38,38,0.4), 0 0 60px rgba(220,38,38,0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
                : 'none',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={e => {
              if (!canFight) return;
              e.target.style.transform = 'scale(1.05)';
              e.target.style.boxShadow = '0 6px 40px rgba(220,38,38,0.5), 0 0 80px rgba(220,38,38,0.2), inset 0 1px 0 rgba(255,255,255,0.15)';
            }}
            onMouseLeave={e => {
              if (!canFight) return;
              e.target.style.transform = 'scale(1)';
              e.target.style.boxShadow = '0 4px 30px rgba(220,38,38,0.4), 0 0 60px rgba(220,38,38,0.15), inset 0 1px 0 rgba(255,255,255,0.1)';
            }}>
              {dailyRemaining === 0 ? '🚫 Límite diario alcanzado' :
               selectedTeam.length !== 3 ? `Selecciona ${3 - selectedTeam.length} criatura${3 - selectedTeam.length > 1 ? 's' : ''} mas` :
               !connected ? '⏳ Conectando al servidor...' : '⚔️ BUSCAR OPONENTE'}
            </button>

            {canFight && (
              <p style={{
                fontSize: 11, color: '#4b5563', marginTop: 12,
                animation: 'mm-glow-pulse 3s ease-in-out infinite',
              }}>
                Pulsa para entrar en la cola de matchmaking
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
