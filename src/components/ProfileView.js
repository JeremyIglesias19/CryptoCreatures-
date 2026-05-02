'use client';
import CreatureAvatar from './CreatureAvatar';

// ============================================
// ProfileView
// Renderiza un perfil público. Se usa en /profile/[username]
// y como preview en otras pantallas si hace falta.
// ============================================

const RANK_TIERS = [
  { name: 'Maestro',  minElo: 1500, color: '#ef4444', glow: 'rgba(239,68,68,0.3)', icon: '👑' },
  { name: 'Diamante', minElo: 1300, color: '#67e8f9', glow: 'rgba(103,232,249,0.3)', icon: '💎' },
  { name: 'Platino',  minElo: 1150, color: '#a78bfa', glow: 'rgba(167,139,250,0.25)', icon: '⚜️' },
  { name: 'Oro',      minElo: 1000, color: '#fbbf24', glow: 'rgba(251,191,36,0.25)', icon: '🏅' },
  { name: 'Plata',    minElo: 850,  color: '#d1d5db', glow: 'rgba(209,213,219,0.15)', icon: '🥈' },
  { name: 'Bronce',   minElo: 0,    color: '#d97706', glow: 'rgba(217,119,6,0.15)', icon: '🥉' },
];
function getTier(elo) {
  return RANK_TIERS.find(t => elo >= t.minElo) || RANK_TIERS[RANK_TIERS.length - 1];
}

function formatJoined(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export default function ProfileView({ profile, topCreatures = [], isOwn = false, onEdit }) {
  if (!profile) return null;

  const tier = getTier(profile.elo);
  const totalGames = (profile.wins || 0) + (profile.losses || 0);
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

  // Determinar avatar a mostrar
  const hasCreatureAvatar = !!profile.avatar_creature;
  const initial = (profile.username || '?').slice(0, 1).toUpperCase();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 sm:p-8"
        style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.08), rgba(255,255,255,0.02))',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {hasCreatureAvatar ? (
              <CreatureAvatar
                name={profile.avatar_creature.name}
                types={profile.avatar_creature.types}
                rarity={profile.avatar_creature.rarity}
                size={140}
              />
            ) : profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={profile.username}
                width={140}
                height={140}
                className="rounded-2xl"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                className="rounded-2xl flex items-center justify-center font-extrabold text-white"
                style={{
                  width: 140, height: 140,
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  fontSize: 56,
                }}
              >
                {initial}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
              <h1 className="text-[28px] sm:text-[32px] font-extrabold text-white tracking-tight">
                {profile.username}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold"
                style={{
                  background: `${tier.color}18`,
                  border: `1px solid ${tier.color}40`,
                  color: tier.color,
                  boxShadow: `0 0 16px ${tier.glow}`,
                }}
              >
                {tier.icon} {tier.name}
              </span>
            </div>
            <p className="text-gray-500 text-[12px]">
              Miembro desde {formatJoined(profile.joined_at)}
            </p>

            {isOwn && (
              <button
                onClick={onEdit}
                className="mt-4 px-4 py-2 rounded-lg text-[12px] font-bold bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 transition"
              >
                ✏️ Editar perfil
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        <StatCard label="ELO" value={profile.elo ?? 0} color="#a855f7" />
        <StatCard label="Victorias" value={profile.wins ?? 0} color="#22c55e" />
        <StatCard label="Derrotas" value={profile.losses ?? 0} color="#ef4444" />
        <StatCard label="Win rate" value={`${winRate}%`} color="#fbbf24" />
      </div>

      {/* Streak */}
      <div className="mt-3 flex justify-center">
        <div className="px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[12px] text-orange-300">
          🔥 Racha actual: <span className="font-bold">{profile.streak_days ?? 0} días</span>
        </div>
      </div>

      {/* Top creatures */}
      <div className="mt-8">
        <h2 className="text-[14px] font-bold uppercase tracking-[1.5px] text-purple-300 mb-4">
          Top criaturas
        </h2>
        {topCreatures.length === 0 ? (
          <p className="text-gray-500 text-[13px] text-center py-8">
            Este entrenador todavía no tiene criaturas.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {topCreatures.map(c => (
              <TopCreatureCard key={c.id} creature={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-center"
      style={{
        background: `${color}10`,
        border: `1px solid ${color}25`,
      }}
    >
      <p className="text-[10px] uppercase tracking-wider" style={{ color: `${color}aa` }}>{label}</p>
      <p className="text-[22px] font-extrabold mt-0.5" style={{ color }}>{value}</p>
    </div>
  );
}

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};

function TopCreatureCard({ creature }) {
  const color = RARITY_COLORS[creature.rarity] || '#9ca3af';
  return (
    <div
      className="rounded-xl p-3 flex flex-col items-center"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${color}30`,
      }}
    >
      <CreatureAvatar
        name={creature.name}
        types={creature.types}
        rarity={creature.rarity}
        size={72}
      />
      <p className="text-[12px] font-bold text-white mt-2 truncate w-full text-center">
        {creature.is_favorite && '⭐ '}{creature.name}
      </p>
      <p className="text-[10px]" style={{ color }}>{creature.rarity}</p>
    </div>
  );
}
