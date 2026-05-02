'use client';
import { useEffect, useRef, useState } from 'react';
import { SpatialCombatEngine } from '@/lib/spatialCombatEngine';

// ============================================
// SpatialBattleArena
// Renderiza una batalla espacial 3v3 sobre Canvas.
//
// Modo actual: simula la batalla entera al montar y reproduce los snapshots.
// Modo futuro: recibirá snapshots vía socket en vivo.
//
// Props:
//   - team1, team2: arrays de criaturas con stats + ataques
//   - seed: opcional, para batalla determinista
//   - onEnd: callback cuando termina (recibe result)
//   - speed: 1.0 normal, 2.0 = 2x velocidad, etc
// ============================================

const ARENA_W = 800;
const ARENA_H = 500;
const SPRITE_SIZE = 64;

const RARITY_FOLDERS = {
  'Comun': 'comun',
  'Poco Comun': 'poco_comun',
  'Rara': 'rara',
  'Epica': 'epica',
  'Legendaria': 'legendaria',
  'Unica': 'unica',
};

const TYPE_COLORS = {
  Fuego: '#ef4444', Agua: '#3b82f6', Naturaleza: '#22c55e',
  Rayo: '#eab308', Tierra: '#a0845c', Hielo: '#67e8f9',
};

// Colores por shape (para overlay distintivo de cada ataque)
const SHAPE_COLORS = {
  wave: '#fb923c',         // naranja expansivo
  beam: '#67e8f9',         // cyan eléctrico
  area: '#f43f5e',         // rojo-rosa peligro
  projectile: '#a78bfa',   // violeta dirigido
  bounce: '#22c55e',       // verde (rebota como pelota)
  arrow: '#fef08a',        // amarillo claro (flecha brillante)
  fan_3: '#a78bfa',
  fan_5: '#a78bfa',
  charge: '#ef4444',       // rojo (embestida)
};

export default function SpatialBattleArena({ team1, team2, seed = null, onEnd, speed = 1.0 }) {
  const canvasRef = useRef(null);
  const bgCanvasRef = useRef(null); // offscreen canvas con el fondo pre-rendered
  const spriteCacheRef = useRef({});
  const animFrameRef = useRef(null);
  const startTimestampRef = useRef(null);
  // Refs en lugar de state — evita re-renders en cada tick
  const snapshotsRef = useRef([]);
  const resultRef = useRef(null);
  const tickRef = useRef(0);
  const lastTickRef = useRef(-1); // último tick procesado para spawn de efectos
  const onEndRef = useRef(onEnd);
  // Sistema de efectos visuales (partículas, damage numbers, flashes)
  const effectsRef = useRef([]);
  // Trails por proyectil activo: Map<atkId, [{x,y,t},...]>
  const trailsRef = useRef(new Map());
  // Pre-procesado: eventos por tick (hits, kos)
  const eventsByTickRef = useRef({});
  // Tabla de flashes activos por criatura (side-idx → endTime)
  const flashesRef = useRef(new Map());
  // Solo state para UI inmutable que sí necesita re-render
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [restartCounter, setRestartCounter] = useState(0);
  const [, forceUpdate] = useState(0);

  // Mantener onEnd ref actualizado sin disparar useEffect dependencies
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  // ============================================
  // Carga: simular en idle time para no bloquear el LCP del h1.
  // Render inicial del componente: solo placeholder/loader. La simulación
  // (50-300ms) corre asíncrona y luego activa la batalla.
  // ============================================
  useEffect(() => {
    let cancelled = false;

    // Iniciar precarga de sprites INMEDIATAMENTE (paralelo a la simulación)
    for (const c of [...team1, ...team2]) {
      const folder = RARITY_FOLDERS[c.rarity] || 'comun';
      const src = `/sprites/${folder}/${c.name}.png`;
      const img = new Image();
      img.src = src;
      spriteCacheRef.current[c.name] = img;
    }

    // Pre-render del fondo (rápido, no bloquea LCP de forma visible)
    if (typeof document !== 'undefined') {
      const bg = document.createElement('canvas');
      bg.width = ARENA_W;
      bg.height = ARENA_H;
      drawBackground(bg.getContext('2d'));
      bgCanvasRef.current = bg;
    }

    // Simular en idle callback / setTimeout para no bloquear el primer paint.
    // requestIdleCallback fallback a setTimeout 0 si no existe.
    const runSimulation = () => {
      if (cancelled) return;
      const engine = new SpatialCombatEngine(team1, team2, { seed });
      const r = engine.simulate({ collectSnapshots: true });
      if (cancelled) return;
      snapshotsRef.current = r.snapshots || [];
      resultRef.current = r;
      tickRef.current = 0;
      lastTickRef.current = -1;
      effectsRef.current = [];
      trailsRef.current = new Map();
      flashesRef.current = new Map();

      // Pre-procesar eventos del log agrupados por tick
      const byTick = {};
      for (const e of r.log || []) {
        const tick = Math.floor(e.t / 100);
        if (!byTick[tick]) byTick[tick] = [];
        byTick[tick].push(e);
      }
      eventsByTickRef.current = byTick;

      setReady(true);
      setFinished(false);
    };

    const ric = (typeof window !== 'undefined' && window.requestIdleCallback) || ((cb) => setTimeout(cb, 0));
    const handle = ric(runSimulation, { timeout: 200 });

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && window.cancelIdleCallback && typeof handle === 'number') {
        try { window.cancelIdleCallback(handle); } catch {}
      }
    };
  }, [team1, team2, seed]);

  // ============================================
  // Loop de animación: NO setState por tick (eso es lo que petaba).
  // Dibuja directamente al canvas en cada frame.
  // ============================================
  useEffect(() => {
    if (!ready) return;
    if (paused) return;

    startTimestampRef.current = performance.now() - (tickRef.current * 100 / speed);
    const tickMs = 100;

    const loop = (now) => {
      const elapsedReal = (now - startTimestampRef.current) * speed;
      const snaps = snapshotsRef.current;
      const tickFloat = elapsedReal / tickMs;
      const idx = Math.min(snaps.length - 1, Math.floor(tickFloat));
      const nextIdx = Math.min(snaps.length - 1, idx + 1);
      // Fracción de progreso dentro del tick actual: 0 al inicio, ~1 al final.
      // Sirve para interpolar posiciones entre snap[idx] y snap[nextIdx].
      const frac = Math.max(0, Math.min(1, tickFloat - idx));
      tickRef.current = idx;

      // Procesar eventos NUEVOS desde el último tick renderizado.
      // Esto spawn-ea partículas, damage numbers y flashes basándonos en el log.
      processNewEvents(
        lastTickRef.current, idx,
        eventsByTickRef.current,
        snaps,
        effectsRef.current,
        flashesRef.current,
        now
      );
      lastTickRef.current = idx;

      // Actualizar trails de proyectiles activos
      updateProjectileTrails(snaps[idx], trailsRef.current, now);

      // Dibujar todo (con interpolación entre snap[idx] y snap[nextIdx])
      drawFrame(
        canvasRef.current,
        snaps[idx],
        snaps[nextIdx],
        frac,
        spriteCacheRef.current,
        bgCanvasRef.current,
        effectsRef.current,
        trailsRef.current,
        flashesRef.current,
        now
      );

      // Limpiar efectos expirados (background, no afecta visual)
      effectsRef.current = effectsRef.current.filter(e => now < e.endTime);

      // Forzar update del HUD (tiempo elapsed) ~10 veces por segundo, no en cada frame
      if (idx % 6 === 0) forceUpdate(v => v + 1);

      if (idx < snaps.length - 1) {
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        setFinished(true);
        if (onEndRef.current && resultRef.current) onEndRef.current(resultRef.current);
      }
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [ready, paused, speed, restartCounter]);

  // ============================================
  // UI
  // ============================================
  const totalTicks = snapshotsRef.current.length;
  const currentTick = tickRef.current;
  const result = resultRef.current;
  const elapsedSec = (currentTick * 0.1).toFixed(1);
  const totalSec = totalTicks > 0 ? ((totalTicks - 1) * 0.1).toFixed(1) : '—';
  const isRunning = ready && !finished && !paused;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Canvas */}
      <div className="relative" style={{
        boxShadow: '0 0 40px rgba(168,85,247,0.2)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          width={ARENA_W}
          height={ARENA_H}
          style={{
            display: 'block', width: ARENA_W, height: ARENA_H,
            background: '#0a0a20', // color sólido mientras carga, evita flash blanco
          }}
        />

        {/* Loader mientras simula la batalla en idle */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-[32px] mb-2 animate-pulse">⚔️</div>
              <p className="text-[12px] text-purple-300 font-bold tracking-[2px] uppercase">
                Preparando batalla...
              </p>
            </div>
          </div>
        )}

        {/* HUD overlay */}
        <div className="absolute top-2 left-2 right-2 flex justify-between text-[12px] font-bold pointer-events-none">
          <div className="px-2 py-1 rounded bg-blue-500/20 text-blue-300">🟦 Equipo 1</div>
          <div className="px-2 py-1 rounded bg-white/10 text-white font-mono">{elapsedSec}s / {totalSec}s</div>
          <div className="px-2 py-1 rounded bg-red-500/20 text-red-300">🟥 Equipo 2</div>
        </div>

        {/* Result overlay */}
        {finished && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="bg-[#0c0c23] border border-purple-500/40 rounded-2xl p-6 text-center">
              <p className="text-[11px] uppercase tracking-[2px] text-purple-300 mb-1">Resultado</p>
              <h3 className="text-[24px] font-extrabold text-white">
                {result.winner === 'player1' && '🟦 Gana Equipo 1'}
                {result.winner === 'player2' && '🟥 Gana Equipo 2'}
                {result.winner === 'draw' && '⚪ Empate'}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">{(result.durationMs / 1000).toFixed(1)}s — {result.tickCount} ticks</p>
            </div>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex gap-2 items-center text-[12px]">
        <button
          onClick={() => setPaused(p => !p)}
          className="px-3 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30"
        >
          {paused ? '▶️ Play' : '⏸️ Pause'}
        </button>
        <button
          onClick={() => {
            tickRef.current = 0;
            setFinished(false);
            setPaused(false);
            setRestartCounter(c => c + 1); // dispara re-run del animation effect
          }}
          className="px-3 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 border border-white/[0.08]"
        >
          🔄 Reset
        </button>
        <span className="text-gray-500">Tick: {currentTick} / {totalTicks > 0 ? totalTicks - 1 : 0}</span>
      </div>
    </div>
  );
}

// ============================================
// drawFrame: dibuja un snapshot completo al canvas. Standalone, sin React.
// ============================================
// Pre-render del fondo. Se llama UNA VEZ y se cachea en offscreen canvas.
function drawBackground(ctx) {
  ctx.imageSmoothingEnabled = false;

  // Gradiente radial central
  const grad = ctx.createRadialGradient(
    ARENA_W / 2, ARENA_H / 2, 50,
    ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.7
  );
  grad.addColorStop(0, '#1a1a3a');
  grad.addColorStop(0.6, '#0d0d22');
  grad.addColorStop(1, '#06060f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ARENA_W, ARENA_H);

  // Línea central
  ctx.strokeStyle = 'rgba(168,85,247,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(ARENA_W / 2, 0);
  ctx.lineTo(ARENA_W / 2, ARENA_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Anillos centrales
  ctx.strokeStyle = 'rgba(168,85,247,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 80, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ARENA_W / 2, ARENA_H / 2, 40, 0, Math.PI * 2);
  ctx.stroke();

  // Borde
  ctx.strokeStyle = 'rgba(168,85,247,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2);
}

function drawFrame(canvas, snap, nextSnap, frac, spriteCache, bgCanvas, effects, trails, flashes, now) {
  if (!canvas || !snap) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  // Blit del fondo cacheado (1 sola operación drawImage)
  if (bgCanvas) {
    ctx.drawImage(bgCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#0a0a20';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }

  // ====== Trails de proyectiles (debajo de todo) ======
  if (trails) renderTrails(ctx, trails, now);

  // ====== Ataques (interpolados entre frames) ======
  // Para attacks, interpolamos posición de proyectiles y radio de waves.
  for (const atk of snap.attacks || []) {
    const nextAtk = nextSnap?.attacks?.find(a => a.id === atk.id);
    renderAttack(ctx, interpolateAttack(atk, nextAtk, frac));
  }

  // ====== Criaturas (con interpolación de posición + flash si aplica) ======
  for (const c of snap.team1 || []) {
    const next = nextSnap?.team1?.find(n => n.idx === c.idx);
    const ic = interpolateCreature(c, next, frac);
    const flashEnd = flashes?.get(`1-${c.idx}`);
    renderCreature(ctx, ic, 1, spriteCache, flashEnd && now < flashEnd);
  }
  for (const c of snap.team2 || []) {
    const next = nextSnap?.team2?.find(n => n.idx === c.idx);
    const ic = interpolateCreature(c, next, frac);
    const flashEnd = flashes?.get(`2-${c.idx}`);
    renderCreature(ctx, ic, 2, spriteCache, flashEnd && now < flashEnd);
  }

  // ====== Efectos (partículas + damage numbers) encima ======
  if (effects) renderEffects(ctx, effects, now);
}

// Interpolación de criatura entre dos snapshots
function interpolateCreature(c, next, frac) {
  if (!next || c.kod) return c;
  return {
    ...c,
    x: c.x + (next.x - c.x) * frac,
    y: c.y + (next.y - c.y) * frac,
    // facing y hp no se interpolan (toma valor del snap actual)
  };
}

// Interpolación de ataques entre dos snapshots
function interpolateAttack(atk, next, frac) {
  if (!next) return atk;
  if (atk.shape === 'projectile') {
    return {
      ...atk,
      x: atk.x + (next.x - atk.x) * frac,
      y: atk.y + (next.y - atk.y) * frac,
    };
  }
  if (atk.shape === 'wave') {
    return {
      ...atk,
      radius: atk.radius + (next.radius - atk.radius) * frac,
    };
  }
  // beam y area no se interpolan (geometría fija durante su vida)
  return atk;
}

// ============================================
// Procesa eventos del log entre dos ticks. Spawn de efectos.
// ============================================
function processNewEvents(fromTick, toTick, byTick, snaps, effects, flashes, now) {
  if (fromTick >= toTick) return;
  for (let t = Math.max(0, fromTick + 1); t <= toTick; t++) {
    const events = byTick[t];
    if (!events) continue;
    const snap = snaps[t];
    for (const e of events) {
      if (e.type === 'hit') {
        // Encontrar la criatura objetivo en el snapshot para sacar posición + idx
        const team = e.targetSide === 1 ? snap.team1 : snap.team2;
        const target = team?.find(c => c.name === e.target);
        if (!target) continue;
        spawnHitEffects(effects, flashes, target, e, now);
      } else if (e.type === 'kod') {
        const team = e.targetSide === 1 ? snap.team1 : snap.team2;
        const target = team?.find(c => c.name === e.target);
        if (!target) continue;
        spawnKoEffect(effects, target.x, target.y, now);
      }
    }
  }
}

// Spawn: 10 partículas + damage number + flash
function spawnHitEffects(effects, flashes, target, hitEvent, now) {
  const x = target.x;
  const y = target.y;
  const color = hitEvent.eff > 1 ? '#fbbf24' : hitEvent.eff < 1 ? '#9ca3af' : '#fff';
  // Partículas
  const N = 10;
  for (let i = 0; i < N; i++) {
    const angle = (Math.PI * 2 * i) / N + Math.random() * 0.4;
    const speed = 80 + Math.random() * 80;
    effects.push({
      type: 'particle',
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      size: 2 + Math.random() * 2,
      startTime: now,
      endTime: now + 500,
    });
  }
  // Damage number (sube y se desvanece)
  effects.push({
    type: 'dmgNumber',
    x: x + (Math.random() - 0.5) * 20,
    y: y - 30,
    text: `-${hitEvent.damage}`,
    color: hitEvent.eff > 1 ? '#fbbf24' : hitEvent.eff < 1 ? '#9ca3af' : '#fef2f2',
    eff: hitEvent.eff,
    startTime: now,
    endTime: now + 900,
  });
  // Flash en la criatura: clave side-idx que matchea con el render
  const tid = `${hitEvent.targetSide}-${target.idx}`;
  flashes.set(tid, now + 120);
}

function spawnKoEffect(effects, x, y, now) {
  // Onda de choque blanca al morir
  effects.push({
    type: 'shockwave',
    x, y,
    radius: 0,
    maxRadius: 60,
    startTime: now,
    endTime: now + 400,
  });
}

// ============================================
// Trails de proyectiles
// ============================================
function updateProjectileTrails(snap, trails, now) {
  if (!snap) return;
  const activeIds = new Set();
  for (const a of snap.attacks || []) {
    if (a.shape !== 'projectile') continue;
    activeIds.add(a.id);
    if (!trails.has(a.id)) trails.set(a.id, []);
    const trail = trails.get(a.id);
    trail.push({ x: a.x, y: a.y, t: now });
    // Mantener solo últimos 8 puntos
    if (trail.length > 8) trail.shift();
  }
  // Cleanup de trails de proyectiles que ya no están activos (mantenemos 200ms para fade out)
  for (const [id, trail] of trails) {
    if (!activeIds.has(id)) {
      const lastT = trail[trail.length - 1]?.t || 0;
      if (now - lastT > 200) trails.delete(id);
    }
  }
}

function renderTrails(ctx, trails, now) {
  for (const trail of trails.values()) {
    if (trail.length < 2) continue;
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 4;
    for (let i = 1; i < trail.length; i++) {
      const age = (now - trail[i].t) / 200;
      ctx.globalAlpha = Math.max(0, 1 - age) * (i / trail.length) * 0.6;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }
}

// ============================================
// Render de efectos (partículas, damage numbers, shockwave)
// ============================================
function renderEffects(ctx, effects, now) {
  const dt = 1 / 60; // asumir 60 fps para integration
  for (const e of effects) {
    const age = now - e.startTime;
    const lifetime = e.endTime - e.startTime;
    const t = age / lifetime; // 0 → 1
    if (t > 1) continue;

    if (e.type === 'particle') {
      // Integrar posición simple (cinemática)
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= 0.92; // fricción
      e.vy *= 0.92;
      ctx.fillStyle = e.color;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    } else if (e.type === 'dmgNumber') {
      const yOffset = -t * 30; // sube 30px durante su vida
      const alpha = Math.max(0, 1 - t * t); // ease-out fade
      const fontSize = e.eff > 1 ? 16 : 14;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Stroke negro de outline
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.globalAlpha = alpha;
      ctx.strokeText(e.text, e.x, e.y + yOffset);
      ctx.fillStyle = e.color;
      ctx.fillText(e.text, e.x, e.y + yOffset);
      ctx.globalAlpha = 1.0;
    } else if (e.type === 'shockwave') {
      const r = e.maxRadius * t;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }
}

// ============================================
// Helper: renderiza una criatura con sprite + HP bar + nombre
// ============================================
function renderCreature(ctx, c, side, spriteCache, isFlashing = false) {
  if (c.kod) {
    // KO: gris translúcido
    ctx.globalAlpha = 0.3;
  }

  const sprite = spriteCache[c.name];
  const sw = SPRITE_SIZE;
  const sh = SPRITE_SIZE;
  const x = c.x - sw / 2;
  const y = c.y - sh / 2;

  if (sprite && sprite.complete && sprite.naturalWidth > 0) {
    if (c.facing === 'left') {
      ctx.save();
      ctx.translate(c.x + sw / 2, c.y - sh / 2);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, sw, sh);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x, y, sw, sh);
    }
  } else {
    // Fallback SIN shadowBlur (devastador para perf en canvas).
    // Simulamos glow con 2 círculos: outer translúcido + inner sólido.
    const color = TYPE_COLORS[c.types?.[0]] || '#a855f7';
    const r = sw / 2 - 4;
    // Outer glow simulado con anillo translúcido
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 4, 0, Math.PI * 2);
    ctx.fill();
    // Inner círculo sólido
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    // Borde por equipo
    ctx.lineWidth = 2;
    ctx.strokeStyle = side === 1 ? '#3b82f6' : '#ef4444';
    ctx.stroke(); // reusa el path del último arc
    // Indicador de facing
    const facingX = c.facing === 'right' ? c.x + r * 0.6 : c.x - r * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(facingX, c.y, 3, 0, Math.PI * 2);
    ctx.fill();
    // Iniciales centradas
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.name.slice(0, 2).toUpperCase(), c.x, c.y);
  }

  ctx.globalAlpha = 1.0;

  // Flash overlay rojo si recibió hit recientemente (composite multiply para tintar)
  if (isFlashing && !c.kod) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, sw / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // HP bar (sobre el sprite)
  const hpPct = c.maxHp > 0 ? c.hp / c.maxHp : 0;
  const barW = 50;
  const barH = 5;
  const barX = c.x - barW / 2;
  const barY = c.y - sh / 2 - 12;
  // bg
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(barX, barY, barW, barH);
  // fill
  const hpColor = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#fbbf24' : '#ef4444';
  ctx.fillStyle = hpColor;
  ctx.fillRect(barX, barY, barW * hpPct, barH);
  // border
  ctx.strokeStyle = side === 1 ? '#3b82f6' : '#ef4444';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  // Nombre debajo
  if (!c.kod) {
    ctx.fillStyle = side === 1 ? '#93c5fd' : '#fca5a5';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, c.x, c.y + sh / 2 + 12);
  }
}

// ============================================
// Helper: renderiza un ataque activo según su shape
// ============================================
function renderAttack(ctx, atk) {
  const color = SHAPE_COLORS[atk.shape] || '#fff';

  if (atk.shape === 'wave') {
    // Anillo expansivo. Math.max para evitar radius negativo (Canvas crashea).
    const r = Math.max(1, atk.radius);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // Anillo secundario más sutil — solo si hay espacio
    if (r > 5) {
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(atk.x, atk.y, r - 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  } else if (atk.shape === 'beam') {
    // Línea con glow
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(atk.startX, atk.startY);
    ctx.lineTo(atk.endX, atk.endY);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.moveTo(atk.startX, atk.startY);
    ctx.lineTo(atk.endX, atk.endY);
    ctx.stroke();
  } else if (atk.shape === 'area') {
    // Centro del área para el visual
    const cx = atk.x + atk.w / 2;
    const cy = atk.y + atk.h / 2;
    const radius = Math.min(atk.w, atk.h) / 2;

    if (atk.telegraphed) {
      // TELEGRAPH: círculos concéntricos pulsantes que indican peligro inminente.
      // Más orgánico que el rectángulo.
      const pulse = 0.5 + 0.5 * Math.sin(atk.ageMs / 60);
      // Círculo de target
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 + pulse * 0.4;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      // Círculo interno
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2 + pulse * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Cruz central como marker
      ctx.globalAlpha = 0.5 + pulse * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
      ctx.stroke();
    } else {
      // EXPLOSIÓN: ondas radiales expandiendo desde el centro (más orgánico).
      const ageDetonated = atk.ageMs - atk.delayMs;
      const explosionProgress = Math.min(1, ageDetonated / 300); // 300ms de explosión
      // Onda exterior expandiendo
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.8 - explosionProgress * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.6 + explosionProgress * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      // Onda media
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 - explosionProgress * 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * (0.4 + explosionProgress * 0.7), 0, Math.PI * 2);
      ctx.stroke();
      // Centro brillante
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5 - explosionProgress * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  } else if (atk.shape === 'projectile') {
    // Bola con trail. Sanitizar radio.
    const hr = Math.max(2, atk.hitRadius || 22);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, hr * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, hr * 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (atk.shape === 'arrow') {
    // Flecha alargada en dirección de movimiento
    const angle = Math.atan2(atk.vy || 0, atk.vx || 1);
    ctx.save();
    ctx.translate(atk.x, atk.y);
    ctx.rotate(angle);
    // Cuerpo de la flecha
    ctx.fillStyle = color;
    ctx.fillRect(-18, -3, 36, 6);
    // Punta
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(10, -7);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (atk.shape === 'bounce') {
    // Pelota verde con anillo destacando el rebote
    const hr = Math.max(2, atk.hitRadius || 20);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, hr * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(atk.x, atk.y, hr * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Indicador de rebotes restantes
    if (atk.bouncesLeft != null && atk.bouncesLeft >= 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(atk.x, atk.y, hr + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
