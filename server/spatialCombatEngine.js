// ============================================
// CryptoCreatures - Motor de Combate Espacial v2
// 3v3 simultáneo, espectador puro, top-down 90°.
// Tick rate 100ms (10 ticks/seg). Arena 800x500 px.
// ============================================
//
// Estructura:
//   - SpatialCombatEngine corre la simulación completa hasta que un equipo cae
//   - Cada tick: AI decide → mueve → ataques se actualizan → colisiones → daño
//   - Log de eventos para futuro replay
//
// Ataques tienen 4 SHAPES:
//   - wave:       círculo expandiéndose desde caster (alcance corto)
//   - beam:       línea recta caster→target (instantáneo, alcance largo)
//   - area:       rectángulo telegrafiado en suelo, daño tras delay 500ms (esquivable)
//   - projectile: bala teledirigida con homing débil (alcance largo)
//
// El shape se asigna a cada ataque por ÍNDICE en la criatura (atk[0]=wave,
// atk[1]=beam, atk[2]=area, atk[3]=projectile). Esto da siempre 4 estilos
// distintos por criatura. En el futuro se puede personalizar por ataque.
// ============================================

const TYPE_ADVANTAGE = {
  Fuego: ['Naturaleza', 'Hielo'], Agua: ['Fuego', 'Tierra'],
  Naturaleza: ['Agua', 'Tierra'], Rayo: ['Agua', 'Hielo'],
  Tierra: ['Fuego', 'Rayo'], Hielo: ['Naturaleza', 'Tierra'],
};
const TYPE_DISADVANTAGE = {
  Fuego: ['Agua', 'Tierra'], Agua: ['Naturaleza', 'Rayo'],
  Naturaleza: ['Fuego', 'Hielo'], Rayo: ['Tierra', 'Naturaleza'],
  Tierra: ['Agua', 'Naturaleza'], Hielo: ['Fuego', 'Rayo'],
};

function getTypeEffectiveness(atkType, defTypes) {
  let mult = 1;
  if (!atkType || !defTypes) return mult;
  for (const dt of defTypes) {
    if (TYPE_ADVANTAGE[atkType]?.includes(dt)) mult *= 1.5;
    if (TYPE_DISADVANTAGE[atkType]?.includes(dt)) mult *= 0.65;
  }
  return mult;
}

const SHAPES = ['wave', 'beam', 'area', 'projectile', 'bounce', 'fan_3', 'fan_5', 'arrow', 'charge'];

// Rangos óptimos por shape (en px, distancia caster ↔ target).
const SHAPE_RANGES = {
  wave:       { min: 0,   max: 90  },
  beam:       { min: 80,  max: 600 },
  area:       { min: 100, max: 280 },
  projectile: { min: 80,  max: 500 },
  bounce:     { min: 100, max: 450 },
  fan_3:      { min: 80,  max: 320 },
  fan_5:      { min: 80,  max: 320 },
  arrow:      { min: 100, max: 600 },
  charge:     { min: 60,  max: 350 },
};

// Multiplicador de damage por shape (balance vs single-target).
// AOE shapes hacen menos daño per-hit pero pueden golpear varios.
// fan_N divide el power entre los N proyectiles.
const SHAPE_DAMAGE_MULT = {
  beam:       0.78, // bajado: era 1.0 — beam de 120 dominaba demasiado
  projectile: 0.95,
  arrow:      0.98,
  wave:       0.72,
  area:       0.85, // subido: telegrafiada se esquiva con frecuencia
  bounce:     0.85,
  fan_3:      0.58,
  fan_5:      0.45,
  charge:     1.10, // bonus moderado por riesgo
};

// Cooldown por POWER tier (no por shape). Ataques fuertes recargan más lento.
function cooldownForPower(power) {
  if (power < 60)   return 1500;
  if (power < 90)   return 2000;
  if (power < 110)  return 2500;
  return 3500; // ULTs (poder ≥110)
}

// Mulberry32: PRNG determinista basado en seed numérico.
// Útil para tests reproducibles y para simulaciones server-authoritativas
// donde queremos que el client pueda re-ejecutar la batalla con el mismo seed.
function makeSeededRng(seed) {
  let state = seed >>> 0;
  return function () {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SpatialCombatEngine {
  constructor(team1Raw, team2Raw, options = {}) {
    this.version = 2;
    this.arena = { width: 800, height: 500 };
    this.tickMs = options.tickMs || 100;
    this.maxDurationMs = options.maxDurationMs || 90000;
    this.elapsedMs = 0;
    this.tickCount = 0;
    // Si pasan `seed`, lo convertimos a RNG seedeado. Si no, usan rng directo o Math.random.
    this.seed = options.seed != null ? options.seed : null;
    this.rng = options.rng || (this.seed != null ? makeSeededRng(this.seed) : Math.random);
    this._atkIdCounter = 0;

    this.team1 = this._prepareTeam(team1Raw, 1);
    this.team2 = this._prepareTeam(team2Raw, 2);
    this.activeAttacks = [];
    this.log = [];
    this.finished = false;
    this.winner = null;
  }

  _prepareTeam(raw, side) {
    const xBase = side === 1 ? 120 : 680;
    const yPositions = [125, 250, 375];
    return raw.map((c, idx) => {
      const attacks = this._prepareAttacks(c.attacks);
      const validRoles = ['aggressive','kiter','flanker','hybrid'];
      // Role: el que el jugador asigna pre-batalla. Si no, auto-infer.
      const role = c.role && validRoles.includes(c.role) ? c.role : this._inferRole(attacks);
      // Preferred role: atributo intrínseco de la criatura (asignado al nacer del huevo).
      // Si no se especifica, default = role asignado.
      const preferredRole = c.preferred_role && validRoles.includes(c.preferred_role)
        ? c.preferred_role
        : role;
      // Affinity: si el role asignado coincide con el preferido → bonus; si no → penalty
      const affinityMult = role === preferredRole ? 1.10 : 0.95;

      return {
        side, idx,
        name: c.name,
        types: Array.isArray(c.types) ? c.types : [c.types],
        rarity: c.rarity,
        maxHp: c.hp, hp: c.hp,
        atk: c.atk, def: c.def, spd: c.spd,
        ability: c.ability,
        attacks,
        role,
        preferredRole,
        affinityMult,
        x: xBase, y: yPositions[idx % 3],
        vx: 0, vy: 0,
        facing: side === 1 ? 'right' : 'left',
        cooldowns: attacks.map(() => Math.floor(this.rng() * 1300) + 200),
        stunUntil: 0,
        kod: false,
      };
    });
  }

  // Inferir role del pool de ataques si no viene explícito.
  _inferRole(attacks) {
    let melee = 0, ranged = 0;
    for (const a of attacks) {
      if (a.shape === 'wave' || a.shape === 'charge') melee++;
      else if (a.shape === 'beam' || a.shape === 'arrow' || a.shape === 'projectile') ranged++;
    }
    if (melee >= 2 && ranged === 0) return 'aggressive';
    if (ranged >= 2 && melee === 0) return 'kiter';
    return 'hybrid';
  }

  _prepareAttacks(attacks) {
    const arr = typeof attacks === 'string' ? JSON.parse(attacks) : (attacks || []);
    return arr.map((a, idx) => {
      // Si el ataque trae shape explícito (ATTACKS_DB nuevo), úsalo.
      // Si no (compat con datos viejos), fallback al mapping por idx.
      const shape = a.shape && SHAPES.includes(a.shape) ? a.shape : SHAPES[idx % 4];
      return {
        ...a,
        shape,
        cooldownMs: cooldownForPower(a.power || 50),
      };
    });
  }

  // ============================================
  // Simulación principal
  //
  // options.collectSnapshots: si true (default), guarda un snapshot por tick para replay.
  //   Coste: O(ticks × entities). Para batallas de ~200 ticks × 6 entidades es trivial.
  //   Si la batalla se simula y el resultado se descarta, mejor pasar { collectSnapshots: false }.
  // ============================================
  simulate(options = {}) {
    const collect = options.collectSnapshots !== false;
    if (collect) this.snapshots = [this.getSnapshot()];

    this.log.push({ t: 0, type: 'start', team1: this._teamSnapshot(this.team1), team2: this._teamSnapshot(this.team2) });
    while (!this.finished && this.elapsedMs < this.maxDurationMs) {
      this.tick();
      this.elapsedMs += this.tickMs;
      this.tickCount++;
      if (collect) this.snapshots.push(this.getSnapshot());
    }
    if (!this.finished) {
      // Timeout: equipo con más HP total gana
      const hp1 = this.team1.reduce((s, c) => s + c.hp, 0);
      const hp2 = this.team2.reduce((s, c) => s + c.hp, 0);
      this.winner = hp1 > hp2 ? 'player1' : (hp2 > hp1 ? 'player2' : 'draw');
      this.finished = true;
      this.log.push({ t: this.elapsedMs, type: 'timeout', winner: this.winner, hp1, hp2 });
    }
    return this.getResult();
  }

  tick() {
    // 1. Update active attacks (mueve proyectiles, expande waves)
    this._updateActiveAttacks();

    // 2. Decisiones AI por criatura — ORDEN ALEATORIO para evitar sesgo de team1.
    //    Antes Team1 decidía siempre primero → ventaja sistemática. Ahora shuffle.
    const all = [...this.team1, ...this.team2];
    this._shuffle(all);
    for (const c of all) {
      if (c.kod) continue;
      if (c.stunUntil > this.elapsedMs) continue;
      this._decideAction(c);
    }

    // 3. Aplicar SEPARATION FORCE (anti-cluster): cada criatura empuja a sus
    //    compañeros si están demasiado cerca. Evita que se apilen todos en el
    //    mismo enemigo.
    this._applySeparation(all);

    // 4. Aplicar movimiento
    const dt = this.tickMs / 1000;
    for (const c of all) {
      if (c.kod) continue;
      // CHARGE: si la criatura está cargando, sobreescribe el movimiento normal
      if (c.charging) {
        c.x += c.charging.vx * dt;
        c.y += c.charging.vy * dt;
        c.charging.distance += Math.sqrt(c.charging.vx ** 2 + c.charging.vy ** 2) * dt;
        // Update facing
        c.facing = c.charging.vx > 0 ? 'right' : 'left';
        // Comprobar colisión con enemigos durante charge
        const enemies = c.side === 1 ? this.team2 : this.team1;
        for (const e of enemies) {
          if (e.kod) continue;
          if (c.charging.hitTargets.has(`${e.side}-${e.idx}`)) continue;
          const d = this._dist(c, e);
          if (d < 35) {
            this._applyChargeHit(c, e);
            c.charging.hitTargets.add(`${e.side}-${e.idx}`);
          }
        }
        // Comprobar fin de charge (distancia o pared)
        const hitWall = c.x <= 25 || c.x >= this.arena.width - 25 || c.y <= 25 || c.y >= this.arena.height - 25;
        if (c.charging.distance >= c.charging.maxDistance || hitWall) {
          c.charging = null;
          c.stunUntil = this.elapsedMs + 500; // 500ms recovery post-charge
          c.vx = 0; c.vy = 0;
        }
        // Clamp
        c.x = Math.max(20, Math.min(this.arena.width - 20, c.x));
        c.y = Math.max(20, Math.min(this.arena.height - 20, c.y));
        continue; // saltar resto de movement logic
      }
      // Smoothing normal
      const SMOOTH = 0.35;
      c._vx = c._vx == null ? c.vx : c._vx + (c.vx - c._vx) * SMOOTH;
      c._vy = c._vy == null ? c.vy : c._vy + (c.vy - c._vy) * SMOOTH;
      c.x += c._vx * dt;
      c.y += c._vy * dt;
      c.x = Math.max(20, Math.min(this.arena.width - 20, c.x));
      c.y = Math.max(20, Math.min(this.arena.height - 20, c.y));
      if (Math.abs(c._vx) > 5) c.facing = c._vx > 0 ? 'right' : 'left';
    }

    // 5. Decrementar cooldowns
    for (const c of all) {
      for (let i = 0; i < c.cooldowns.length; i++) {
        c.cooldowns[i] = Math.max(0, c.cooldowns[i] - this.tickMs);
      }
    }

    // 6. Resolver colisiones y aplicar daño
    this._resolveCollisions();

    // 7. Comprobar fin de batalla
    const team1Alive = this.team1.some(c => !c.kod);
    const team2Alive = this.team2.some(c => !c.kod);
    if (!team1Alive || !team2Alive) {
      this.finished = true;
      this.winner = team1Alive ? 'player1' : (team2Alive ? 'player2' : 'draw');
      this.log.push({ t: this.elapsedMs, type: 'end', winner: this.winner });
    }
  }

  // ============================================
  // AI: decidir acción de una criatura
  // ============================================
  _decideAction(c) {
    const enemies = (c.side === 1 ? this.team2 : this.team1).filter(e => !e.kod);
    if (enemies.length === 0) return;

    // PRIORIDAD: si hay un área telegrafiada que va a impactarme, esquivar.
    const incomingArea = this._findIncomingArea(c);
    if (incomingArea) {
      this._dodgeArea(c, incomingArea);
      return;
    }

    // ANTI-STUCK: si estoy pegado a un muro y mi velocidad apunta hacia el muro,
    // forzar un strafe perpendicular para despegarme.
    if (this._isStuckOnWall(c)) {
      this._unstickFromWall(c);
      return;
    }

    // Selección de target con variedad — evita snowball y cluster.
    //
    // Distribución:
    // - 40% TARGETING POR POSICIÓN: idx 0 ataca al enemigo idx 0, idx 1 al 1, etc
    //   Esto es la mejor anti-cluster: cada miembro del equipo tiene "su" rival.
    // - 30% nearest (tactical, para combos cuando el rival se acerca)
    // - 20% lowest HP (finish off prey)
    // - 10% highest threat (focar damage dealers peligrosos)
    const roll = this.rng();
    let target;
    if (roll < 0.40) {
      target = this._pickByPosition(c, enemies);
    } else if (roll < 0.70) {
      target = this._pickNearest(c, enemies);
    } else if (roll < 0.90) {
      target = this._pickLowestHp(enemies);
    } else {
      target = this._pickHighestThreat(enemies);
    }
    const nearest = target;
    const minDist = this._dist(c, nearest);

    // Buscar ataques disponibles (cooldown 0)
    const ready = c.attacks
      .map((a, i) => ({ ...a, idx: i }))
      .filter((_, i) => c.cooldowns[i] === 0);

    if (ready.length === 0) {
      // Sin ataques: mover según rol preferido
      this._setMovementByRole(c, nearest, minDist);
      return;
    }

    // Elegir mejor ataque según contexto (smart targeting)
    const chosen = this._pickBestAttack(c, ready, nearest, minDist);

    if (chosen) {
      const range = SHAPE_RANGES[chosen.shape];
      if (minDist >= range.min && minDist <= range.max) {
        // En rango: dispara
        this._fireAttack(c, chosen, nearest);
        c.cooldowns[chosen.idx] = chosen.cooldownMs;
        // Stop momentáneo al disparar
        c.vx = 0; c.vy = 0;
        return;
      } else if (minDist < range.min) {
        // Demasiado cerca para este ataque (raro): aleja un poco
        this._moveAway(c, nearest);
        return;
      } else {
        // Demasiado lejos: acercar
        this._moveToward(c, nearest);
        return;
      }
    }

    this._setMovementByRole(c, nearest, minDist);
  }

  _pickBestAttack(c, readyAttacks, target, dist) {
    let best = null;
    let bestScore = -Infinity;
    for (const a of readyAttacks) {
      let score = (a.power || 50) / 2;
      if (a.type) {
        const eff = getTypeEffectiveness(a.type, target.types);
        if (eff > 1) score += 50 * (eff - 1) * 2;
        if (eff < 1) score -= 30;
      }
      const range = SHAPE_RANGES[a.shape];
      if (dist >= range.min && dist <= range.max) score += 40;
      else if (dist > range.max * 1.3) score -= 30;
      else if (dist < range.min) score -= 20;

      if (score > bestScore) { best = a; bestScore = score; }
    }
    return best;
  }

  _setMovementByRole(c, target, dist) {
    // Movimiento basado en el ROLE explícito (asignado por el jugador) o inferido.
    const role = c.role || 'hybrid';

    if (role === 'aggressive') {
      // Tanque/melee: siempre acercarse al objetivo. Sin retroceso.
      this._moveToward(c, target);
      return;
    }

    if (role === 'kiter') {
      // Ranged DPS: distancia óptima ~320px. Si te acercas demasiado, huye fuerte.
      if (dist < 220) {
        this._moveAway(c, target);
      } else if (dist > 420) {
        this._moveToward(c, target);
      } else {
        // Strafe perpendicular para esquivar beams
        this._strafe(c, target);
      }
      return;
    }

    if (role === 'flanker') {
      // Mid-range táctico: mantenerse 150-220px, lateralea agresivamente.
      if (dist < 130) {
        this._moveAway(c, target);
      } else if (dist > 280) {
        this._moveToward(c, target);
      } else {
        this._strafe(c, target);
      }
      return;
    }

    // hybrid (default): adaptable según situación
    if (dist < 80) this._moveAway(c, target);
    else if (dist > 350) this._moveToward(c, target);
    else this._strafe(c, target);
  }

  // ============================================
  // Movimiento
  // ============================================
  _moveToward(c, t) {
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = c.spd * 1.8;
    c.vx = (dx / d) * speed;
    c.vy = (dy / d) * speed;
  }
  _moveAway(c, t) {
    const dx = c.x - t.x;
    const dy = c.y - t.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = c.spd * 1.6;
    c.vx = (dx / d) * speed;
    c.vy = (dy / d) * speed;
  }
  _strafe(c, t) {
    // Movimiento perpendicular al target — útil para esquivar beams
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = c.spd * 1.3;
    const perpX = -dy / d;
    const perpY = dx / d;
    const dir = this.rng() > 0.5 ? 1 : -1;
    c.vx = perpX * speed * dir;
    c.vy = perpY * speed * dir;
  }

  // ============================================
  // Disparar ataque (crear hitbox activo)
  // ============================================
  _fireAttack(caster, attack, target) {
    // Fórmula de daño: balanceada para batallas de 20-40s.
    // base = (atk × power) / (def × 6) ≈ 8-12 dmg promedio con stats típicos.
    // Multiplicador por shape (AOE penalty, fan power split, etc).
    // Type effectiveness (×1.5 / ×0.65) y variance ±15%.
    const shape = attack.shape;
    const shapeMult = SHAPE_DAMAGE_MULT[shape] ?? 1.0;
    const affinityMult = caster.affinityMult ?? 1.0;
    const baseDmg = Math.max(1, Math.round(
      ((caster.atk * (attack.power || 50)) / Math.max(1, target.def * 6)) * shapeMult * affinityMult
    ));
    const eff = getTypeEffectiveness(attack.type, target.types);
    const variance = 0.85 + this.rng() * 0.30;
    const damage = Math.max(1, Math.round(baseDmg * eff * variance));

    // CHARGE: caso especial — mueve la criatura, no crea hitbox normal.
    // Spawn de un "atk pseudo" que rastrea el progreso del charge.
    if (shape === 'charge') {
      this._startCharge(caster, target, damage, attack);
      this.log.push({
        t: this.elapsedMs, type: 'fire', casterSide: caster.side,
        caster: caster.name, attack: attack.name, shape, target: target.name,
      });
      return;
    }

    // FAN_3 / FAN_5: spawn de N proyectiles con divergencia angular.
    if (shape === 'fan_3' || shape === 'fan_5') {
      const N = shape === 'fan_3' ? 3 : 5;
      const spreadDeg = shape === 'fan_3' ? 30 : 50;
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const baseAngle = Math.atan2(dy, dx);
      for (let i = 0; i < N; i++) {
        const offset = ((i / (N - 1)) - 0.5) * (spreadDeg * Math.PI / 180);
        const angle = baseAngle + offset;
        const id = ++this._atkIdCounter;
        const atk = {
          id, casterSide: caster.side, casterIdx: caster.idx,
          casterName: caster.name, attackName: attack.name,
          attackType: attack.type, shape: 'projectile', // se renderiza/colisiona como projectile
          parentShape: shape, // pero el log/render sabe que era fan
          damage, effectiveness: eff, castTime: this.elapsedMs,
          hitTargets: new Set(),
          x: caster.x, y: caster.y,
          vx: Math.cos(angle) * 400,
          vy: Math.sin(angle) * 400,
          targetSide: target.side, targetIdx: target.idx,
          homing: 0, // fan no homea
          duration: 1500, hitRadius: 18,
        };
        this.activeAttacks.push(atk);
      }
      this.log.push({
        t: this.elapsedMs, type: 'fire', casterSide: caster.side,
        caster: caster.name, attack: attack.name, shape, target: target.name,
      });
      return;
    }

    // Resto de shapes: 1 sola hitbox
    const id = ++this._atkIdCounter;
    const atk = {
      id, casterSide: caster.side, casterIdx: caster.idx,
      casterName: caster.name, attackName: attack.name,
      attackType: attack.type, shape,
      damage, effectiveness: eff,
      castTime: this.elapsedMs,
      hitTargets: new Set(),
    };

    if (shape === 'wave') {
      atk.x = caster.x; atk.y = caster.y;
      atk.radius = 0; atk.maxRadius = 90;
      atk.expandRate = 220;
      atk.duration = 550;
    } else if (shape === 'beam') {
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      atk.startX = caster.x; atk.startY = caster.y;
      atk.endX = caster.x + (dx / d) * 600;
      atk.endY = caster.y + (dy / d) * 600;
      atk.duration = 250;
    } else if (shape === 'area') {
      atk.x = target.x - 60; atk.y = target.y - 50;
      atk.w = 120; atk.h = 100;
      atk.delayMs = 500;
      atk.duration = 800;
    } else if (shape === 'projectile') {
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      atk.x = caster.x; atk.y = caster.y;
      atk.vx = (dx / d) * 400;
      atk.vy = (dy / d) * 400;
      atk.targetSide = target.side; atk.targetIdx = target.idx;
      atk.homing = 0.05;
      atk.duration = 2000;
      atk.hitRadius = 22;
    } else if (shape === 'arrow') {
      // Proyectil rápido y preciso, sin homing
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      atk.x = caster.x; atk.y = caster.y;
      atk.vx = (dx / d) * 700; // 75% más rápido que projectile
      atk.vy = (dy / d) * 700;
      atk.angle = Math.atan2(dy, dx); // para render alargado
      atk.homing = 0;
      atk.duration = 1200;
      atk.hitRadius = 16;
    } else if (shape === 'bounce') {
      // Proyectil sin homing que rebota en paredes
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      atk.x = caster.x; atk.y = caster.y;
      atk.vx = (dx / d) * 350;
      atk.vy = (dy / d) * 350;
      atk.bouncesLeft = 3;
      atk.duration = 2500;
      atk.hitRadius = 20;
    }

    this.activeAttacks.push(atk);
    this.log.push({
      t: this.elapsedMs, type: 'fire', casterSide: caster.side,
      caster: caster.name, attack: attack.name, shape, target: target.name,
    });
  }

  // ============================================
  // CHARGE: la criatura se lanza a sí misma. Single-target con auto-exposición.
  // ============================================
  _startCharge(caster, target, damage, attack) {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    caster.charging = {
      vx: (dx / d) * 600, // 600 px/s (mucho más rápido que su SPD normal)
      vy: (dy / d) * 600,
      distance: 0,
      maxDistance: Math.min(350, d + 20), // un poco más allá del target
      damage,
      attackName: attack.name,
      attackType: attack.type,
      hitTargets: new Set(),
    };
    // Stun post-charge se aplicará al terminar
  }

  // ============================================
  // Update active attacks (movement, expansion)
  // ============================================
  _updateActiveAttacks() {
    const dt = this.tickMs / 1000;
    const remaining = [];
    for (const atk of this.activeAttacks) {
      const age = this.elapsedMs - atk.castTime;
      if (age > atk.duration) {
        // Expiró sin haber pegado a nadie → log miss
        if (atk.hitTargets.size === 0) {
          this.log.push({
            t: this.elapsedMs,
            type: 'miss',
            attack: atk.attackName,
            shape: atk.shape,
            caster: atk.casterName,
            casterSide: atk.casterSide,
          });
        }
        continue;
      }

      if (atk.shape === 'wave') {
        atk.radius = Math.min(atk.maxRadius, atk.expandRate * (age / 1000));
      } else if (atk.shape === 'projectile' || atk.shape === 'arrow') {
        atk.x += atk.vx * dt;
        atk.y += atk.vy * dt;
        // Homing solo si aplica (projectile sí, arrow no)
        if (atk.homing && atk.homing > 0) {
          const team = atk.targetSide === 1 ? this.team1 : this.team2;
          const t = team[atk.targetIdx];
          if (t && !t.kod) {
            const dx = t.x - atk.x;
            const dy = t.y - atk.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const desiredVx = (dx / d) * 400;
            const desiredVy = (dy / d) * 400;
            atk.vx += (desiredVx - atk.vx) * atk.homing;
            atk.vy += (desiredVy - atk.vy) * atk.homing;
          }
        }
        // Out of bounds → expirar (miss)
        if (atk.x < 0 || atk.x > this.arena.width || atk.y < 0 || atk.y > this.arena.height) {
          this.log.push({
            t: this.elapsedMs, type: 'miss', attack: atk.attackName,
            shape: atk.shape, caster: atk.casterName, casterSide: atk.casterSide,
          });
          continue;
        }
      } else if (atk.shape === 'bounce') {
        atk.x += atk.vx * dt;
        atk.y += atk.vy * dt;
        // Detectar colisión con paredes y rebotar
        if (atk.x <= 5 || atk.x >= this.arena.width - 5) {
          atk.vx = -atk.vx;
          atk.x = Math.max(5, Math.min(this.arena.width - 5, atk.x));
          atk.bouncesLeft--;
        }
        if (atk.y <= 5 || atk.y >= this.arena.height - 5) {
          atk.vy = -atk.vy;
          atk.y = Math.max(5, Math.min(this.arena.height - 5, atk.y));
          atk.bouncesLeft--;
        }
        if (atk.bouncesLeft < 0) {
          // Sin rebotes → expira (con o sin hits)
          if (atk.hitTargets.size === 0) {
            this.log.push({
              t: this.elapsedMs, type: 'miss', attack: atk.attackName,
              shape: atk.shape, caster: atk.casterName, casterSide: atk.casterSide,
            });
          }
          continue;
        }
      }
      remaining.push(atk);
    }
    this.activeAttacks = remaining;
  }

  // ============================================
  // Hit detection y daño
  // ============================================
  _resolveCollisions() {
    for (const atk of this.activeAttacks) {
      const targets = atk.casterSide === 1 ? this.team2 : this.team1;
      for (const t of targets) {
        if (t.kod) continue;
        const tid = `${t.side}-${t.idx}`;
        if (atk.hitTargets.has(tid)) continue;
        if (this._isHit(atk, t)) {
          this._applyHit(atk, t);
          atk.hitTargets.add(tid);
          // Single-target shapes: tras hit, expirar
          if (atk.shape === 'beam' || atk.shape === 'projectile' ||
              atk.shape === 'arrow') {
            atk.duration = 0;
          }
          // Bounce puede pegar a varios pero ya con hitTargets evita duplicar al mismo
        }
      }
    }
  }

  _isHit(atk, target) {
    if (atk.shape === 'wave') {
      const d = Math.sqrt((atk.x - target.x) ** 2 + (atk.y - target.y) ** 2);
      return d <= atk.radius && atk.radius > 0;
    }
    if (atk.shape === 'beam') {
      // Hitbox ajustado: 22px ancho. Esquivable con strafe perpendicular a tiempo.
      return this._pointSegDist(target.x, target.y, atk.startX, atk.startY, atk.endX, atk.endY) <= 22;
    }
    if (atk.shape === 'area') {
      const age = this.elapsedMs - atk.castTime;
      if (age < atk.delayMs) return false;
      return target.x >= atk.x && target.x <= atk.x + atk.w &&
             target.y >= atk.y && target.y <= atk.y + atk.h;
    }
    if (atk.shape === 'projectile' || atk.shape === 'arrow' || atk.shape === 'bounce') {
      const d = Math.sqrt((atk.x - target.x) ** 2 + (atk.y - target.y) ** 2);
      return d <= atk.hitRadius;
    }
    return false;
  }

  _applyChargeHit(caster, target) {
    const damage = caster.charging.damage;
    target.hp = Math.max(0, target.hp - damage);
    target.stunUntil = this.elapsedMs + 200;
    this.log.push({
      t: this.elapsedMs, type: 'hit',
      attack: caster.charging.attackName, shape: 'charge',
      casterSide: caster.side, caster: caster.name,
      target: target.name, targetSide: target.side,
      damage, eff: 1, hpAfter: target.hp,
    });
    if (target.hp === 0) {
      target.kod = true;
      this.log.push({
        t: this.elapsedMs, type: 'kod',
        target: target.name, targetSide: target.side,
      });
    }
  }

  _applyHit(atk, target) {
    target.hp = Math.max(0, target.hp - atk.damage);
    target.stunUntil = this.elapsedMs + 200;
    this.log.push({
      t: this.elapsedMs,
      type: 'hit',
      attack: atk.attackName,
      shape: atk.shape,
      casterSide: atk.casterSide,
      caster: atk.casterName,
      target: target.name,
      targetSide: target.side,
      damage: atk.damage,
      eff: atk.effectiveness,
      hpAfter: target.hp,
    });
    if (target.hp === 0) {
      target.kod = true;
      this.log.push({
        t: this.elapsedMs,
        type: 'kod',
        target: target.name,
        targetSide: target.side,
      });
    }
  }

  // ============================================
  // Helpers
  // ============================================
  _dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  _shuffle(arr) {
    // Fisher-Yates con this.rng() para determinismo en tests
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // Si hay una zona telegrafiada que aún no detonó y mi posición actual está
  // dentro, devuelvo el ataque para que la criatura lo esquive.
  _findIncomingArea(c) {
    for (const atk of this.activeAttacks) {
      if (atk.shape !== 'area') continue;
      if (atk.casterSide === c.side) continue; // ignoro las mías
      const age = this.elapsedMs - atk.castTime;
      if (age >= atk.delayMs) continue; // ya detonó, tarde
      // ¿Estoy en el rect?
      if (c.x >= atk.x && c.x <= atk.x + atk.w &&
          c.y >= atk.y && c.y <= atk.y + atk.h) {
        return atk;
      }
    }
    return null;
  }

  _dodgeArea(c, area) {
    // Movimiento hacia el lado más cercano fuera del rectángulo.
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const dx = c.x - cx;
    const dy = c.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = c.spd * 2.5; // velocidad pánico
    c.vx = (dx / d) * speed;
    c.vy = (dy / d) * speed;
  }

  _pickNearest(c, enemies) {
    let best = enemies[0];
    let minDist = this._dist(c, best);
    for (const e of enemies) {
      const d = this._dist(c, e);
      if (d < minDist) { minDist = d; best = e; }
    }
    return best;
  }

  _pickLowestHp(enemies) {
    let best = enemies[0];
    for (const e of enemies) if (e.hp < best.hp) best = e;
    return best;
  }

  _pickHighestThreat(enemies) {
    // Threat = atk + spd. Prioriza killers rápidos (lo que más duele en autobattler).
    let best = enemies[0];
    let bestScore = best.atk + best.spd;
    for (const e of enemies) {
      const s = e.atk + e.spd;
      if (s > bestScore) { bestScore = s; best = e; }
    }
    return best;
  }

  // Targeting por posición: idx 0 ataca al enemigo idx 0, idx 1 al 1, idx 2 al 2.
  // Si el de mi posición está KO, fallback al siguiente vivo.
  _pickByPosition(c, enemies) {
    const sameIdx = enemies.find(e => e.idx === c.idx);
    if (sameIdx) return sameIdx;
    return enemies[0];
  }

  // Separación entre miembros del mismo equipo (anti-cluster).
  // Si dos compañeros están a < SEPARATION_RADIUS px, se empujan mutuamente.
  _applySeparation(all) {
    const SEPARATION_RADIUS = 110; // antes 70 — más espacio entre aliados
    const SEPARATION_FORCE = 150;  // antes 80 — empuje más fuerte
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      if (c.kod) continue;
      let pushX = 0, pushY = 0;
      for (let j = 0; j < all.length; j++) {
        if (i === j) continue;
        const o = all[j];
        if (o.kod) continue;
        if (o.side !== c.side) continue;
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0 && d < SEPARATION_RADIUS) {
          const strength = (SEPARATION_RADIUS - d) / SEPARATION_RADIUS;
          pushX += (dx / d) * strength;
          pushY += (dy / d) * strength;
        }
      }
      c.vx += pushX * SEPARATION_FORCE;
      c.vy += pushY * SEPARATION_FORCE;
    }
  }

  _isStuckOnWall(c) {
    const wallMargin = 25;
    const stuckLeft = c.x <= wallMargin && c.vx < -1;
    const stuckRight = c.x >= this.arena.width - wallMargin && c.vx > 1;
    const stuckTop = c.y <= wallMargin && c.vy < -1;
    const stuckBottom = c.y >= this.arena.height - wallMargin && c.vy > 1;
    return stuckLeft || stuckRight || stuckTop || stuckBottom;
  }

  _unstickFromWall(c) {
    // Despegarse: moverse hacia el centro del arena con un poco de strafe perpendicular.
    const cx = this.arena.width / 2;
    const cy = this.arena.height / 2;
    const dx = cx - c.x;
    const dy = cy - c.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = c.spd * 1.5;
    c.vx = (dx / d) * speed;
    c.vy = (dy / d) * speed;
  }

  _pointSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
  }

  _teamSnapshot(team) {
    return team.map(c => ({
      name: c.name, hp: c.hp, maxHp: c.maxHp, types: c.types, rarity: c.rarity,
    }));
  }

  getResult() {
    return {
      version: this.version,
      winner: this.winner,
      finished: this.finished,
      durationMs: this.elapsedMs,
      tickCount: this.tickCount,
      finalState: this.getSnapshot(),
      snapshots: this.snapshots || null, // solo si simulate({ collectSnapshots: true })
      log: this.log,
    };
  }

  // Snapshot del estado actual durante la batalla. Útil para enviar al cliente
  // cada N ticks y que renderice posiciones, HP y ataques activos en tiempo real.
  // Forma diseñada para serialización JSON ligera.
  getSnapshot() {
    return {
      t: this.elapsedMs,
      arena: this.arena,
      team1: this.team1.map(c => ({
        idx: c.idx, name: c.name, types: c.types, rarity: c.rarity,
        hp: c.hp, maxHp: c.maxHp, kod: c.kod,
        x: Math.round(c.x), y: Math.round(c.y),
        facing: c.facing, role: c.role,
        preferredRole: c.preferredRole, affinityMult: c.affinityMult,
        cooldowns: c.cooldowns,
        charging: !!c.charging,
      })),
      team2: this.team2.map(c => ({
        idx: c.idx, name: c.name, types: c.types, rarity: c.rarity,
        hp: c.hp, maxHp: c.maxHp, kod: c.kod,
        x: Math.round(c.x), y: Math.round(c.y),
        facing: c.facing, role: c.role,
        preferredRole: c.preferredRole, affinityMult: c.affinityMult,
        cooldowns: c.cooldowns,
        charging: !!c.charging,
      })),
      attacks: this.activeAttacks.map(a => ({
        id: a.id,
        casterSide: a.casterSide,
        shape: a.shape,
        attackName: a.attackName,
        attackType: a.attackType,
        castTime: a.castTime,
        ageMs: this.elapsedMs - a.castTime,
        // Geometría según shape
        ...(a.shape === 'wave' && {
          x: Math.round(a.x), y: Math.round(a.y),
          radius: Math.round(a.radius), maxRadius: a.maxRadius,
        }),
        ...(a.shape === 'beam' && {
          startX: Math.round(a.startX), startY: Math.round(a.startY),
          endX: Math.round(a.endX), endY: Math.round(a.endY),
        }),
        ...(a.shape === 'area' && {
          x: Math.round(a.x), y: Math.round(a.y), w: a.w, h: a.h,
          delayMs: a.delayMs, telegraphed: this.elapsedMs - a.castTime < a.delayMs,
        }),
        ...(a.shape === 'projectile' && {
          x: Math.round(a.x), y: Math.round(a.y),
          hitRadius: a.hitRadius,
        }),
      })),
      finished: this.finished,
      winner: this.winner,
    };
  }
}

module.exports = { SpatialCombatEngine, getTypeEffectiveness, SHAPES, SHAPE_RANGES, SHAPE_DAMAGE_MULT, cooldownForPower, makeSeededRng };
