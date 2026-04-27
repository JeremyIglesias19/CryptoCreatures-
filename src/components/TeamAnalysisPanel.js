'use client';
import { analyzeTeam, ALL_TYPES } from '@/lib/gameData';

// Panel visible cuando el jugador tiene los 3 miembros seleccionados.
// Muestra cobertura ofensiva, debilidades defensivas y stats agregados.

const TYPE_COLORS = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};

const TIER_COLORS = {
  SSS: '#f87171', SS: '#fbbf24', S: '#c084fc',
  A: '#4ade80', B: '#38bdf8', C: '#818cf8', D: '#9ca3af',
};

export default function TeamAnalysisPanel({ team }) {
  const analysis = analyzeTeam(team);
  if (!analysis) return null;

  const { attackCoverage, defenseWeakness, statsAgg } = analysis;

  // Tipos "cubiertos bien" (pct >= 25 significa que ≥3 ataques de 12 lo cubren)
  const coveredTypes = ALL_TYPES.filter(t => attackCoverage[t].pct >= 25);
  const uncoveredTypes = ALL_TYPES.filter(t => attackCoverage[t].pct === 0);

  // Debilidades críticas: ≥2 de 3 criaturas son débiles al tipo
  const criticalWeak = ALL_TYPES.filter(t => defenseWeakness[t].weak >= 2);

  return (
    <div className="bg-[#0d0d28] border border-purple-500/20 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-[14px] font-extrabold uppercase tracking-[2px] text-purple-300">
          Análisis del equipo
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>HP total: <span className="text-white font-bold">{statsAgg.hp}</span></span>
          <span>ATK: <span className="text-red-400 font-bold">{statsAgg.atkAvg}</span></span>
          <span>DEF: <span className="text-blue-400 font-bold">{statsAgg.defAvg}</span></span>
          <span>SPD: <span className="text-yellow-400 font-bold">{statsAgg.spdAvg}</span></span>
          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded"
            style={{ background: `${TIER_COLORS[statsAgg.tier]}22`, color: TIER_COLORS[statsAgg.tier] }}>
            Tier {statsAgg.tier}
          </span>
        </div>
      </div>

      {/* Cobertura ofensiva */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-[1.5px] text-gray-500 font-medium mb-2">
          Cobertura ofensiva
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map(t => {
            const cov = attackCoverage[t];
            const isGood = cov.pct >= 25;
            const isZero = cov.pct === 0;
            return (
              <div key={t}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px]"
                style={{
                  background: isZero ? 'rgba(239,68,68,0.05)' : (isGood ? `${TYPE_COLORS[t]}15` : 'rgba(255,255,255,0.02)'),
                  borderColor: isZero ? 'rgba(239,68,68,0.2)' : (isGood ? `${TYPE_COLORS[t]}40` : 'rgba(255,255,255,0.06)'),
                }}
                title={`${cov.count} ataques super efectivos contra ${t}`}>
                <span className="font-medium" style={{ color: isZero ? '#f87171' : TYPE_COLORS[t] }}>
                  {t}
                </span>
                <span className="text-gray-500 font-mono">{cov.pct}%</span>
              </div>
            );
          })}
        </div>
        {uncoveredTypes.length > 0 && (
          <div className="mt-1.5 text-[11px] text-red-400/80">
            ⚠ Sin ataques efectivos contra: {uncoveredTypes.join(', ')}
          </div>
        )}
        {coveredTypes.length >= 4 && (
          <div className="mt-1.5 text-[11px] text-green-400/80">
            ✓ Buena cobertura ({coveredTypes.length}/6 tipos bien cubiertos)
          </div>
        )}
      </div>

      {/* Debilidades defensivas */}
      <div>
        <div className="text-[10px] uppercase tracking-[1.5px] text-gray-500 font-medium mb-2">
          Debilidades defensivas
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map(t => {
            const d = defenseWeakness[t];
            const isCrit = d.weak >= 2;
            const isSafe = d.resist >= 2 && d.weak === 0;
            return (
              <div key={t}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px]"
                style={{
                  background: isCrit ? 'rgba(239,68,68,0.1)' : (isSafe ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)'),
                  borderColor: isCrit ? 'rgba(239,68,68,0.35)' : (isSafe ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'),
                }}
                title={`${d.weak} débiles, ${d.resist} resistentes, ${d.neutral} neutras a ${t}`}>
                <span className="font-medium" style={{ color: TYPE_COLORS[t] }}>{t}</span>
                <span className="font-mono text-[10px]" style={{ color: isCrit ? '#f87171' : (isSafe ? '#4ade80' : '#6b7280') }}>
                  {d.weak > 0 ? `−${d.weak}` : (d.resist > 0 ? `+${d.resist}` : '·')}
                </span>
              </div>
            );
          })}
        </div>
        {criticalWeak.length > 0 && (
          <div className="mt-1.5 text-[11px] text-red-400/80">
            ⚠ Crítico: 2+ de 3 criaturas débiles a {criticalWeak.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
