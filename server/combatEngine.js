// ============================================
// CryptoCreatures - Motor de Combate (Server)
// Migrado del prototipo HTML, sin UI/SFX
// ============================================

const TYPES = ['Fuego','Agua','Naturaleza','Rayo','Tierra','Hielo'];

const TYPE_ADVANTAGE = {
  Fuego:['Naturaleza','Hielo'], Agua:['Fuego','Tierra'],
  Naturaleza:['Agua','Tierra'], Rayo:['Agua','Hielo'],
  Tierra:['Fuego','Rayo'], Hielo:['Naturaleza','Tierra']
};
const TYPE_DISADVANTAGE = {
  Fuego:['Agua','Tierra'], Agua:['Naturaleza','Rayo'],
  Naturaleza:['Fuego','Hielo'], Rayo:['Tierra','Naturaleza'],
  Tierra:['Agua','Naturaleza'], Hielo:['Fuego','Rayo']
};

function getTypeEffectiveness(atkType, defTypes) {
  let mult = 1;
  for (const dt of defTypes) {
    if (TYPE_ADVANTAGE[atkType]?.includes(dt)) mult *= 1.5;
    if (TYPE_DISADVANTAGE[atkType]?.includes(dt)) mult *= 0.65;
  }
  return mult;
}

// ============================================
// CombatEngine: gestiona una batalla 3v3
// ============================================
class CombatEngine {
  constructor(team1Raw, team2Raw) {
    this.team1 = team1Raw.map(c => this._prepareCreature(c));
    this.team2 = team2Raw.map(c => this._prepareCreature(c));
    this.active1 = 0;
    this.active2 = 0;
    this.turnNumber = 1;
    this.log = [];
    this.finished = false;
    this.winner = null; // 'player1' | 'player2' | null
  }

  _prepareCreature(c) {
    return {
      name: c.name,
      types: Array.isArray(c.types) ? c.types : [c.types],
      rarity: c.rarity,
      hp: c.hp, atk: c.atk, def: c.def, spd: c.spd,
      ability: c.ability,
      attacks: c.attacks,
      // Estado de combate
      currentHP: c.hp,
      maxHP: c.hp,
      status: null,
      statusTurns: 0,
      defending: false,
      // Flags de habilidades
      firstAttack: true,
      shieldUsed: false,
      resurrected: false,
      rageTurns: 0,
      _etherealUsed: false,
      _mirrorUsed: false,
      _ambushActive: false,
      _resonanceActive: false,
      _huntTarget: null,
      _bloodlust: false,
      _ecoBuff: false,
      _ecoBuffTurns: 0,
      isActive: false,
    };
  }

  getState() {
    this.team1[this.active1].isActive = true;
    this.team2[this.active2].isActive = true;
    return {
      team1: this.team1.map(c => ({
        name: c.name, types: c.types, rarity: c.rarity,
        currentHP: c.currentHP, maxHP: c.maxHP,
        status: c.status, isActive: c === this.team1[this.active1],
        ability: c.ability,
      })),
      team2: this.team2.map(c => ({
        name: c.name, types: c.types, rarity: c.rarity,
        currentHP: c.currentHP, maxHP: c.maxHP,
        status: c.status, isActive: c === this.team2[this.active2],
        ability: c.ability,
      })),
      turn: this.turnNumber,
      finished: this.finished,
      winner: this.winner,
    };
  }

  // ============================================
  // Ejecutar un turno completo
  // action1 = { type: 'attack', attackIndex: N } | { type: 'defend' } | { type: 'switch', creatureIndex: N }
  // action2 = igual
  // ============================================
  executeTurn(action1, action2) {
    if (this.finished) return { events: [], winner: this.winner };

    const p1 = this.team1[this.active1];
    const p2 = this.team2[this.active2];
    p1.defending = false;
    p2.defending = false;

    const events = [];

    // Procesar switches primero
    if (action1.type === 'switch') {
      const idx = action1.creatureIndex;
      if (idx >= 0 && idx < this.team1.length && this.team1[idx].currentHP > 0 && idx !== this.active1) {
        this.active1 = idx;
        events.push({ type: 'switch', side: 'player1', creature: this.team1[idx].name });
      }
    }
    if (action2.type === 'switch') {
      const idx = action2.creatureIndex;
      if (idx >= 0 && idx < this.team2.length && this.team2[idx].currentHP > 0 && idx !== this.active2) {
        this.active2 = idx;
        events.push({ type: 'switch', side: 'player2', creature: this.team2[idx].name });
      }
    }

    // Obtener criaturas activas post-switch
    const c1 = this.team1[this.active1];
    const c2 = this.team2[this.active2];

    // Defender
    if (action1.type === 'defend') { c1.defending = true; events.push({ type: 'defend', side: 'player1', creature: c1.name }); }
    if (action2.type === 'defend') { c2.defending = true; events.push({ type: 'defend', side: 'player2', creature: c2.name }); }

    // Seleccionar ataques
    const atk1 = action1.type === 'attack' ? c1.attacks[action1.attackIndex] : null;
    const atk2 = action2.type === 'attack' ? c2.attacks[action2.attackIndex] : null;

    // Determinar orden
    let firstSide = c1.spd >= c2.spd ? 'player1' : 'player2';

    // Reflejo Instintivo
    if (c1.ability === 'Reflejo Instintivo' && atk2 && atk2.power > 90) firstSide = 'player1';
    if (c2.ability === 'Reflejo Instintivo' && atk1 && atk1.power > 90) firstSide = 'player2';
    // Iniciativa
    if (c1.ability === 'Iniciativa' && atk1 && atk1.power < 60) firstSide = 'player1';
    if (c2.ability === 'Iniciativa' && atk2 && atk2.power < 60) firstSide = 'player2';

    const first = firstSide === 'player1' ? { c: c1, atk: atk1, side: 'player1' } : { c: c2, atk: atk2, side: 'player2' };
    const second = firstSide === 'player1' ? { c: c2, atk: atk2, side: 'player2' } : { c: c1, atk: atk1, side: 'player1' };
    const firstDef = firstSide === 'player1' ? c2 : c1;
    const secondDef = firstSide === 'player1' ? c1 : c2;

    // === Primer ataque ===
    if (first.atk && first.c.currentHP > 0) {
      const result = this._doAttack(first.c, firstDef, first.atk);
      events.push({ type: 'attack', side: first.side, attack: first.atk.name, attackType: first.atk.type, ...result });

      const koResult = this._checkKO(events);
      if (koResult) return { events, winner: this.winner };
    }

    // === Segundo ataque ===
    if (second.atk && second.c.currentHP > 0 && firstDef.currentHP > 0) {
      const result = this._doAttack(second.c, secondDef, second.atk);
      events.push({ type: 'attack', side: second.side, attack: second.atk.name, attackType: second.atk.type, ...result });

      const koResult = this._checkKO(events);
      if (koResult) return { events, winner: this.winner };
    }

    // === Fase de estados ===
    this._applyStatus(c1, 'player1', events);
    this._applyStatus(c2, 'player2', events);

    const koResult = this._checkKO(events);
    if (koResult) return { events, winner: this.winner };

    this.turnNumber++;
    return { events, winner: null };
  }

  // ============================================
  // Cálculo de daño (migrado del prototipo)
  // ============================================
  _calcDamage(attacker, defender, attack) {
    let critical = false;

    // Fase Eterea
    if (defender.ability === 'Fase Eterea' && !defender._etherealUsed) {
      defender._etherealUsed = true;
      return { damage: 0, missed: false, dodged: true, effective: 1, effect: null, critical, ethereal: true };
    }

    // Esquiva
    if (defender.ability === 'Esquiva' && Math.random() < 0.1) {
      return { damage: 0, missed: false, dodged: true, effective: 1, effect: null, critical };
    }

    // Precisión
    let accMod = attacker.ability === 'Impaciente' ? -5 : 0;
    if (attacker.ability === 'Impetu Salvaje' && attack.power > 100) accMod += 10;
    if (Math.random() * 100 > attack.accuracy + accMod) {
      return { damage: 0, missed: true, effective: 1, effect: null, critical };
    }

    // STAB
    let stab = 1;
    if (attacker.types.includes(attack.type)) {
      stab = attacker.ability === 'Dualidad' ? 1.5 : 1.25;
    }

    // Efectividad de tipo
    let typeMulti = 1;
    if (attack.type) {
      for (const dt of defender.types) {
        if (TYPE_ADVANTAGE[attack.type]?.includes(dt)) typeMulti *= 1.5;
        if (TYPE_DISADVANTAGE[attack.type]?.includes(dt)) typeMulti *= 0.65;
      }
    }

    // Previsión
    if (defender.ability === 'Prevision' && typeMulti > 1) typeMulti = Math.max(1, typeMulti * 0.7);

    // Caparazón Espejo
    let mirrorReflect = 0;
    if (defender.ability === 'Caparazon Espejo' && !defender._mirrorUsed && typeMulti > 1) {
      defender._mirrorUsed = true;
      mirrorReflect = 0.3;
    }

    // Escudo Natural
    let shieldMod = 1;
    if (defender.ability === 'Escudo Natural' && !defender.shieldUsed) {
      shieldMod = 0.5;
      defender.shieldUsed = true;
    }

    // Escamas Gruesas
    let scalesMod = defender.ability === 'Escamas Gruesas' ? 0.9 : 1;

    // Fortaleza Interior
    if (defender.ability === 'Fortaleza Interior' && defender.status) scalesMod *= 0.75;

    // ATK modifiers
    let atkMod = attacker.atk;
    if (attacker.ability === 'Furia Ardiente' && attacker.currentHP / attacker.maxHP < 0.3) atkMod *= 1.2;
    if (attacker.ability === 'Rabia Creciente') atkMod *= Math.min(1.4, 1 + attacker.rageTurns * 0.08);
    if (attacker.ability === 'Predador' && defender.currentHP / defender.maxHP < 0.5) atkMod *= 1.25;
    if (attacker.ability === 'Primer Golpe' && attacker.firstAttack) { atkMod *= 1.3; attacker.firstAttack = false; }
    if (attacker.ability === 'Sed de Sangre' && attacker._bloodlust) atkMod *= 1.15;
    if (attacker.ability === 'Marca de Caza') {
      if (attacker._huntTarget === defender.name) atkMod *= 1.1;
      attacker._huntTarget = defender.name;
    }
    if (attacker.ability === 'Golpe Fantasma' && !attack.type) atkMod *= 2.0;
    if (attacker.ability === 'Emboscada' && attacker._ambushActive) atkMod *= 1.15;
    if (attacker.ability === 'Resonancia' && attacker._resonanceActive) atkMod *= 1.1;
    if (attacker._ecoBuff && attacker._ecoBuffTurns > 0) atkMod *= 1.15;

    // DEF modifiers
    let defMod = defender.defending ? defender.def * 2 : defender.def;
    if (defender.ability === 'Resonancia' && defender._resonanceActive) defMod *= 1.1;
    if (attacker.ability === 'Penetracion') defMod *= 0.8;

    let damage = ((atkMod * attack.power * stab * typeMulti) / (defMod * 1.5)) * (0.85 + Math.random() * 0.15) * shieldMod * scalesMod;

    // Golpe Crítico+
    if (attacker.ability === 'Golpe Critico+' && Math.random() < 0.15) { damage *= 1.5; critical = true; }

    damage = Math.max(1, Math.round(damage));

    // Voluntad de Hierro
    let ironWillTriggered = false;
    if (defender.ability === 'Voluntad de Hierro' && defender.currentHP / defender.maxHP > 0.5 && defender.currentHP - damage <= 0) {
      damage = defender.currentHP - 1;
      ironWillTriggered = true;
    }

    // Efectos de estado
    let effect = null;
    if (attack.effect && Math.random() * 100 < attack.effectChance && !defender.status) {
      if (defender.ability === 'Anticuerpos' && attack.effect === 'Veneno') effect = null;
      else if (defender.ability === 'Anticongelante' && attack.effect === 'Congelar') effect = null;
      else effect = attack.effect;
    }

    // Habilidades reactivas
    let reactiveEffect = null;
    if (defender.ability === 'Cuerpo Toxico' && Math.random() < 0.2 && !attacker.status) reactiveEffect = 'Veneno';
    if (defender.ability === 'Aura Helada' && Math.random() < 0.15 && !attacker.status) reactiveEffect = 'Congelar';
    if (defender.ability === 'Chispazo Reactivo' && Math.random() < 0.2 && !attacker.status) reactiveEffect = 'Paralisis';
    if (defender.ability === 'Cuerpo Llameante' && Math.random() < 0.2 && !attacker.status) reactiveEffect = 'Quemar';

    // Piel Dura
    let recoil = defender.ability === 'Piel Dura' ? Math.round(damage * 0.1) : 0;

    // Caparazón Espejo daño reflejado
    let mirrorDmg = mirrorReflect > 0 ? Math.round(damage * mirrorReflect) : 0;

    // Eco Elemental
    let ecoTriggered = (attacker.ability === 'Eco Elemental' && typeMulti > 1);

    return { damage, missed: false, dodged: false, effective: typeMulti, effect, reactiveEffect, recoil, critical, ironWillTriggered, mirrorDmg, ecoTriggered };
  }

  // ============================================
  // Ejecutar un ataque
  // ============================================
  _doAttack(attacker, defender, attack) {
    // Congelado
    if (attacker.status === 'Congelar') {
      if (Math.random() < 0.25) {
        attacker.status = null;
        return { frozenThaw: true, damage: 0 };
      }
      return { frozen: true, damage: 0 };
    }

    // Parálisis
    if (attacker.status === 'Paralisis') {
      if (Math.random() < 0.25) {
        return { paralyzed: true, damage: 0 };
      }
    }

    const result = this._calcDamage(attacker, defender, attack);

    if (!result.missed && !result.dodged) {
      defender.currentHP = Math.max(0, defender.currentHP - result.damage);

      // Aplicar efecto de estado
      if (result.effect && !defender.status) {
        defender.status = result.effect;
        defender.statusTurns = result.effect === 'Quemar' ? 3 : result.effect === 'Paralisis' ? 4 : 99;
        if (defender.ability === 'Purificacion') defender.statusTurns = Math.max(1, defender.statusTurns - 1);
      }

      // Efecto reactivo
      if (result.reactiveEffect && !attacker.status) {
        attacker.status = result.reactiveEffect;
        attacker.statusTurns = result.reactiveEffect === 'Quemar' ? 3 : result.reactiveEffect === 'Paralisis' ? 4 : 99;
      }

      // Retroceso (Piel Dura)
      if (result.recoil > 0) {
        attacker.currentHP = Math.max(0, attacker.currentHP - result.recoil);
      }

      // Caparazón Espejo
      if (result.mirrorDmg > 0) {
        attacker.currentHP = Math.max(0, attacker.currentHP - result.mirrorDmg);
      }

      // Absorción
      if (defender.ability === 'Absorcion' && attack.type && defender.types.includes(attack.type)) {
        const heal = Math.round(result.damage * 0.25);
        defender.currentHP = Math.min(defender.maxHP, defender.currentHP + heal);
        result.absorbed = heal;
      }

      // Eco Elemental: buff aliados
      if (result.ecoTriggered) {
        const team = attacker === this.team1[this.active1] ? this.team1 : this.team2;
        team.forEach(c => {
          if (c !== attacker && c.currentHP > 0 && !c._ecoBuff) {
            c._ecoBuff = true;
            c._ecoBuffTurns = 2;
          }
        });
        result.ecoBuffApplied = true;
      }

      // Eco buff countdown
      if (attacker._ecoBuff && attacker._ecoBuffTurns > 0) attacker._ecoBuffTurns--;
      if (attacker._ecoBuffTurns <= 0) attacker._ecoBuff = false;
    }

    return result;
  }

  // ============================================
  // Aplicar daño de estado al final del turno
  // ============================================
  _applyStatus(creature, side, events) {
    // Cicatrización
    if (creature.ability === 'Cicatrizacion' && creature.currentHP > 0 && creature.currentHP < creature.maxHP) {
      const heal = Math.round(creature.maxHP * 0.05);
      creature.currentHP = Math.min(creature.maxHP, creature.currentHP + heal);
      events.push({ type: 'heal', side, ability: 'Cicatrizacion', amount: heal });
    }

    // Rabia Creciente
    if (creature.ability === 'Rabia Creciente' && creature.currentHP > 0) {
      creature.rageTurns = (creature.rageTurns || 0) + 1;
      if (creature.rageTurns <= 5) {
        events.push({ type: 'buff', side, ability: 'Rabia Creciente', value: creature.rageTurns * 8 });
      }
    }

    // Emboscada: desactivar
    if (creature.ability === 'Emboscada' && creature._ambushActive) creature._ambushActive = false;

    if (!creature.status) return;

    // Simbiosis Tóxica
    if (creature.ability === 'Simbiosis Toxica' && creature.statusTurns > 0) creature.statusTurns--;

    if (creature.status === 'Quemar') {
      const dmg = Math.round(creature.maxHP * 0.06);
      creature.currentHP -= dmg;
      events.push({ type: 'statusDmg', side, status: 'Quemar', damage: dmg });
      creature.statusTurns--;
      if (creature.statusTurns <= 0) {
        const curedStatus = creature.status;
        creature.status = null;
        events.push({ type: 'statusCured', side, status: curedStatus });
        this._simbiosisTransfer(creature, side, curedStatus, events);
      }
    }

    if (creature.status === 'Veneno') {
      const dmg = Math.round(creature.maxHP * 0.08);
      creature.currentHP -= dmg;
      events.push({ type: 'statusDmg', side, status: 'Veneno', damage: dmg });
    }
  }

  _simbiosisTransfer(creature, side, status, events) {
    if (creature.ability !== 'Simbiosis Toxica') return;
    const rival = side === 'player1' ? this.team2[this.active2] : this.team1[this.active1];
    if (rival && rival.currentHP > 0 && !rival.status) {
      rival.status = status;
      rival.statusTurns = status === 'Quemar' ? 3 : status === 'Paralisis' ? 4 : 99;
      events.push({ type: 'simbiosis', side, status, target: rival.name });
    }
  }

  // ============================================
  // Comprobar KO y gestionar switches
  // ============================================
  _checkKO(events) {
    const c1 = this.team1[this.active1];
    const c2 = this.team2[this.active2];

    // Check team2 KO
    if (c2.currentHP <= 0) {
      // Resurrección
      if (c2.ability === 'Resurreccion' && !c2.resurrected) {
        c2.resurrected = true;
        c2.currentHP = Math.round(c2.maxHP * 0.25);
        events.push({ type: 'resurrect', side: 'player2', creature: c2.name });
      } else {
        c2.currentHP = 0;
        // Esporas Latentes
        if (c2.ability === 'Esporas Latentes' && c1.currentHP > 0 && !c1.status) {
          const statuses = ['Quemar','Veneno','Paralisis','Congelar'];
          const s = statuses[Math.floor(Math.random() * statuses.length)];
          c1.status = s;
          c1.statusTurns = s === 'Quemar' ? 3 : s === 'Paralisis' ? 4 : 99;
          events.push({ type: 'esporas', side: 'player2', status: s, target: c1.name });
        }
        // Sed de Sangre
        if (c1.ability === 'Sed de Sangre') {
          c1._bloodlust = true;
          events.push({ type: 'buff', side: 'player1', ability: 'Sed de Sangre' });
        }

        events.push({ type: 'ko', side: 'player2', creature: c2.name });

        // Buscar siguiente criatura
        const next = this.team2.findIndex((c, i) => i > this.active2 && c.currentHP > 0);
        if (next === -1) {
          this.finished = true;
          this.winner = 'player1';
          events.push({ type: 'victory', winner: 'player1' });
          return true;
        }
        const prev = this.team2[this.active2];
        this.active2 = next;
        const newC = this.team2[next];
        this._applyEntryAbilities(newC, prev, 'player2', events);
        events.push({ type: 'switch', side: 'player2', creature: newC.name, auto: true });
      }
    }

    // Check team1 KO
    if (c1.currentHP <= 0) {
      if (c1.ability === 'Resurreccion' && !c1.resurrected) {
        c1.resurrected = true;
        c1.currentHP = Math.round(c1.maxHP * 0.25);
        events.push({ type: 'resurrect', side: 'player1', creature: c1.name });
      } else {
        c1.currentHP = 0;
        if (c1.ability === 'Esporas Latentes' && c2.currentHP > 0 && !c2.status) {
          const statuses = ['Quemar','Veneno','Paralisis','Congelar'];
          const s = statuses[Math.floor(Math.random() * statuses.length)];
          c2.status = s;
          c2.statusTurns = s === 'Quemar' ? 3 : s === 'Paralisis' ? 4 : 99;
          events.push({ type: 'esporas', side: 'player1', status: s, target: c2.name });
        }
        if (c2.ability === 'Sed de Sangre') {
          c2._bloodlust = true;
          events.push({ type: 'buff', side: 'player2', ability: 'Sed de Sangre' });
        }

        events.push({ type: 'ko', side: 'player1', creature: c1.name });

        const next = this.team1.findIndex((c, i) => i !== this.active1 && c.currentHP > 0);
        if (next === -1) {
          this.finished = true;
          this.winner = 'player2';
          events.push({ type: 'victory', winner: 'player2' });
          return true;
        }
        const prev = this.team1[this.active1];
        this.active1 = next;
        const newC = this.team1[next];
        this._applyEntryAbilities(newC, prev, 'player1', events);
        events.push({ type: 'switch', side: 'player1', creature: newC.name, auto: true });
      }
    }

    return false;
  }

  // Habilidades al entrar en combate
  _applyEntryAbilities(creature, prevCreature, side, events) {
    // Emboscada
    if (creature.ability === 'Emboscada') {
      creature._ambushActive = true;
      creature.spd = Math.round(creature.spd * 1.5);
      events.push({ type: 'entry', side, ability: 'Emboscada', creature: creature.name });
    }
    // Resonancia
    if (creature.ability === 'Resonancia' && prevCreature && prevCreature.types.some(t => creature.types.includes(t))) {
      creature._resonanceActive = true;
      events.push({ type: 'entry', side, ability: 'Resonancia', creature: creature.name });
    }
    // Nexo Vital
    if (creature.ability === 'Nexo Vital') {
      const team = side === 'player1' ? this.team1 : this.team2;
      const activeIdx = side === 'player1' ? this.active1 : this.active2;
      const reserves = team.filter((c, i) => i !== activeIdx && c.currentHP > 0);
      if (reserves.length > 0) {
        const weakest = reserves.reduce((a, b) => a.currentHP / a.maxHP < b.currentHP / b.maxHP ? a : b);
        const heal = Math.round(weakest.maxHP * 0.15);
        weakest.currentHP = Math.min(weakest.maxHP, weakest.currentHP + heal);
        events.push({ type: 'entry', side, ability: 'Nexo Vital', creature: creature.name, healed: weakest.name, amount: heal });
      }
    }
  }
}

module.exports = { CombatEngine, TYPES, TYPE_ADVANTAGE, TYPE_DISADVANTAGE, getTypeEffectiveness };
