'use client';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// ============================================
// Showcase: sprites que ya existen en /public/sprites/
// Mezclamos rarezas altas para máximo impacto visual
// ============================================
const SHOWCASE = [
  { name: 'Abyssal Monarch', folder: 'unica',      glow: 'rgba(239,68,68,0.55)',  label: 'Unica'      },
  { name: 'Nexus Prime',     folder: 'unica',      glow: 'rgba(239,68,68,0.55)',  label: 'Unica'      },
  { name: 'Yggdrasoul',      folder: 'unica',      glow: 'rgba(239,68,68,0.55)',  label: 'Unica'      },
  { name: 'Gaiaroth',        folder: 'legendaria', glow: 'rgba(234,179,8,0.5)',   label: 'Legendaria' },
  { name: 'Soldraxis',       folder: 'legendaria', glow: 'rgba(234,179,8,0.5)',   label: 'Legendaria' },
  { name: 'Tidalmor',        folder: 'legendaria', glow: 'rgba(234,179,8,0.5)',   label: 'Legendaria' },
  { name: 'Phoenarak',       folder: 'epica',      glow: 'rgba(168,85,247,0.5)',  label: 'Epica'      },
  { name: 'Tempestis',       folder: 'epica',      glow: 'rgba(168,85,247,0.5)',  label: 'Epica'      },
];

// ============================================
// FAQ: preguntas frecuentes (accesible a no-cripto)
// ============================================
const FAQ_ITEMS = [
  {
    q: '¿Es gratis?',
    a: 'Sí. Puedes registrarte, recibir 3 criaturas iniciales y combatir sin pagar nada. Los huevos con criaturas más raras son opcionales y se compran con dinero real.',
  },
  {
    q: '¿Necesito saber de cripto o Solana?',
    a: 'No. Tu cuenta se crea con un login normal de Google y nosotros nos encargamos de generarte una wallet automáticamente. No necesitas saber nada de blockchain para jugar.',
  },
  {
    q: '¿Puedo vender mis criaturas?',
    a: 'Sí. Las criaturas son tuyas y puedes ponerlas a la venta en el mercado interno del juego a otros jugadores. Tú fijas el precio y cobras directamente en tu wallet.',
  },
  {
    q: '¿Cómo funcionan los combates?',
    a: 'Eliges 3 criaturas de tu colección y te emparejamos con un rival de ELO similar. El combate es 3v3 en tiempo real, con tipos elementales, habilidades pasivas y efectos de estado. Suben o bajan puntos de ranking según el resultado.',
  },
  {
    q: '¿Qué es el ranking ELO?',
    a: 'Un sistema competitivo que te coloca en una liga (Bronce → Plata → Oro → Platino → Diamante → Maestro). Subes puntos ganando a rivales de tu nivel o superior.',
  },
  {
    q: '¿Cuántas criaturas hay?',
    a: 'Actualmente 43 criaturas distintas repartidas en 6 rarezas. Cada criatura tiene tipos elementales, una habilidad pasiva única y stats aleatorios (puedes conseguir mejores "rolls" de la misma criatura).',
  },
  {
    q: '¿Cuántos combates puedo hacer al día?',
    a: 'Hay un límite diario de 10 combates ranked por jugador, para mantener el ranking competitivo y evitar farming. El límite se reinicia cada día.',
  },
  {
    q: '¿Dónde se guarda mi dinero y mis criaturas?',
    a: 'En tu wallet personal de Solana, que se crea al registrarte y controlas tú. Nosotros nunca tenemos acceso a tus fondos. Puedes exportar la wallet cuando quieras.',
  },
];

export default function Home() {
  const { login, authenticated, user } = usePrivy();
  const router = useRouter();

  // Showcase rotation
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % SHOWCASE.length), 2800);
    return () => clearInterval(t);
  }, []);

  // Social proof: stats publicas
  const [stats, setStats] = useState(null);
  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  // FAQ: cual está abierto
  const [openFaq, setOpenFaq] = useState(null);

  // Redirect si ya está logueado
  useEffect(() => {
    if (authenticated) router.push('/game');
  }, [authenticated, router]);

  const current = SHOWCASE[idx];

  return (
    <div className="min-h-screen">
      <style>{`
        @keyframes float-y  { 0%,100% { transform: translateY(0);    } 50% { transform: translateY(-12px); } }
        @keyframes pulse-glow { 0%,100% { opacity: 0.55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes fade-in  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slide-in { from { opacity: 0; transform: scale(0.92) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes orbit    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .showcase-enter     { animation: slide-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .faq-body           { animation: fade-in 0.25s ease-out; }
        .dot-active         { box-shadow: 0 0 10px currentColor; }
      `}</style>

      <div className="max-w-[1100px] mx-auto px-4 py-10 md:py-16">
        {/* ========== HERO: Título + Showcase ========== */}
        <div className="text-center mb-10">
          <h1 className="text-5xl md:text-7xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-yellow-400 bg-clip-text text-transparent mb-3 tracking-tight">
            CryptoCreatures
          </h1>
          <p className="text-gray-400 text-base md:text-lg">
            Colecciona, combate y domina en Solana
          </p>
        </div>

        {/* Showcase animado */}
        <div className="relative flex items-center justify-center mb-10" style={{ minHeight: 320 }}>
          {/* Orbita decorativa */}
          <div
            style={{
              position: 'absolute', width: 400, height: 400, borderRadius: '50%',
              border: '1px dashed rgba(168,85,247,0.15)',
              animation: 'orbit 40s linear infinite',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute', width: 300, height: 300, borderRadius: '50%',
              border: '1px dashed rgba(168,85,247,0.1)',
              animation: 'orbit 28s linear infinite reverse',
              pointerEvents: 'none',
            }}
          />

          {/* Aura detrás del sprite */}
          <div
            style={{
              position: 'absolute',
              width: 240,
              height: 240,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${current.glow} 0%, transparent 65%)`,
              filter: 'blur(30px)',
              animation: 'pulse-glow 3s ease-in-out infinite',
            }}
          />

          {/* Sprite */}
          <div key={current.name + idx} className="showcase-enter relative z-[1] text-center" style={{ animation: 'slide-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), float-y 4s ease-in-out infinite 0.6s' }}>
            <img
              src={`/sprites/${current.folder}/${current.name}.png`}
              alt={current.name}
              width={220}
              height={220}
              style={{
                width: 220,
                height: 220,
                objectFit: 'contain',
                filter: `drop-shadow(0 0 24px ${current.glow})`,
              }}
              onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
            />
            <div className="mt-3">
              <span
                className="inline-block text-xs font-bold px-3 py-1 rounded-full"
                style={{
                  background: current.glow.replace(/[\d.]+\)$/, '0.15)'),
                  color: '#fff',
                  border: `1px solid ${current.glow}`,
                }}
              >
                {current.label}
              </span>
              <p className="text-white font-bold text-lg mt-2">{current.name}</p>
            </div>
          </div>

          {/* Indicadores (dots) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex gap-1.5">
            {SHOWCASE.map((_, i) => (
              <div
                key={i}
                className={i === idx ? 'dot-active' : ''}
                onClick={() => setIdx(i)}
                style={{
                  width: i === idx ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === idx ? '#a855f7' : 'rgba(168,85,247,0.25)',
                  color: '#a855f7',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* ========== LOGIN CARD ========== */}
        <div className="bg-dark-800/80 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-6 md:p-8 max-w-md w-full text-center mx-auto">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl">
              🥚
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Empieza gratis</h2>
            <p className="text-gray-400 text-sm">
              Entra con tu cuenta de Google y recibe 3 criaturas iniciales.
              Tu wallet de Solana se crea automáticamente.
            </p>
          </div>

          <button
            onClick={login}
            className="btn-primary w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar con Google
          </button>

          <div className="mt-4 text-xs text-gray-500">
            Al entrar aceptas los términos del juego.
          </div>
        </div>

        {/* ========== PRUEBA SOCIAL ========== */}
        <div className="mt-10 grid grid-cols-3 gap-2 md:gap-6 max-w-2xl mx-auto">
          <StatChip
            value={stats?.totalPlayers}
            label="Entrenadores"
            color="#a855f7"
          />
          <StatChip
            value={stats?.battlesToday}
            label="Combates hoy"
            color="#ef4444"
          />
          <StatChip
            value={stats?.totalCreatures}
            label="Criaturas"
            color="#eab308"
          />
        </div>

        {/* ========== FEATURES ========== */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-3xl mx-auto">
          <FeatureCard icon="🥚" title="Abre Huevos" desc="43 criaturas repartidas en 6 rarezas, con stats y habilidades únicos." />
          <FeatureCard icon="⚔️" title="PvP en tiempo real" desc="Combates 3v3 automáticos, tipos elementales y ranking ELO." />
          <FeatureCard icon="💎" title="NFTs en Solana" desc="Tus criaturas son tuyas. Véndelas en el mercado interno por SOL." />
        </div>

        {/* ========== FAQ ========== */}
        <div className="mt-14 max-w-2xl mx-auto">
          <h3 className="text-center text-2xl font-extrabold text-white mb-6">Preguntas frecuentes</h3>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden transition-all hover:border-purple-500/30"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left"
                  >
                    <span className="text-sm md:text-base font-semibold text-white">{item.q}</span>
                    <span
                      className="text-purple-400 text-xl font-bold transition-transform"
                      style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                    >
                      +
                    </span>
                  </button>
                  {isOpen && (
                    <div className="faq-body px-5 pb-4 text-sm text-gray-400 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer spacer */}
        <div className="mt-14 text-center text-xs text-gray-600">
          CryptoCreatures · Solana · Español
        </div>
      </div>
    </div>
  );
}

// ============================================
// Componentes auxiliares
// ============================================
function StatChip({ value, label, color }) {
  const display = typeof value === 'number'
    ? value.toLocaleString('es-ES')
    : '—';
  return (
    <div
      className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-4 text-center"
      style={{ borderColor: value != null ? `${color}33` : undefined }}
    >
      <div
        className="text-2xl md:text-3xl font-black"
        style={{ color, textShadow: `0 0 18px ${color}44` }}
      >
        {display}
      </div>
      <div className="text-[11px] md:text-xs uppercase tracking-wider text-gray-500 mt-1">
        {label}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }) {
  return (
    <div className="text-center bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-6 hover:border-purple-500/20 transition-colors">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-bold text-white text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{desc}</p>
    </div>
  );
}
