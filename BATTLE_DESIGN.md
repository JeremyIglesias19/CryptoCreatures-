# CryptoCreatures — Diseño del Sistema de Combate Espacial

Este documento captura las decisiones de diseño del nuevo sistema de combate (v2)
para que persistan entre sesiones. Última actualización: mayo 2026.

## Visión general

Combate **3v3 simultáneo, espectador puro, top-down 90°** sobre arena 800x500 px.
Las criaturas se mueven autónomamente según su rol y atacan con ataques que tienen
**formas distintas (shapes)** que pueden impactar o fallar según posicionamiento.

El jugador construye su equipo antes de la batalla y luego observa. La skill está
en el **team-building** + **conocimiento del meta** (qué shapes counter qué).

## Decisiones clave

- **3v3 simultáneo** (no 1v1 secuencial estilo Pokemon — esa idea se quedó en backlog)
- **Espectador puro** — no hay input del jugador durante la batalla
- **Top-down 90°** — vista aérea pura, sprites flipan horizontal según dirección
- **Sprites estáticos** — no walk cycles. Solo translación + flip + animaciones de ataques
- **Smart targeting** — IA elige ataque según contexto (no random puro)
- **Variedad de target** — 60% nearest / 25% lowest HP / 15% highest threat
- **Damage variance ±15%** para que no sea siempre exacto
- **Cooldowns iniciales randomizados** (200-1500ms) para opening escalonado
- **Active dodging** de áreas telegrafiadas

## Shapes de ataque

### Implementados (4)

| Shape | Mecánica | Range | Cooldown |
|---|---|---|---|
| `wave` | Círculo expansivo desde caster, hits everyone in radius | 0-80px | 1.2s |
| `beam` | Línea recta caster→target, instantáneo, single-target | 80-600px | 1.5s |
| `area` | Rectángulo telegrafiado en suelo (0.5s warning), single hit | 100-280px | 2.5s |
| `projectile` | Bala homing débil (0.05) hacia target | 80-500px | 1.4s |

### Pendientes de implementar (5)

| Shape | Mecánica | Notas |
|---|---|---|
| `bounce` | Proyectil sin homing que rebota 2-3x en paredes | Variante de projectile |
| `fan_3` | 3 proyectiles divergentes en cono ~30° | Como shotgun |
| `fan_5` | 5 proyectiles divergentes en cono ~50° | Más spread, más weak each |
| `arrow` | Proyectil rápido y preciso, hitbox alargado, sin homing | Single-target preciso |
| `charge` | **El caster mismo** se lanza a 4-5x velocidad hacia target. Daño al colisionar. Para al chocar contra rival/muro/distancia max | Mecánico único — mueve la criatura, no solo el ataque |

### Descartados

- `puddle` (zona persistente en suelo con ticks de daño) — descartado por user

### Ideas en backlog (no priorizadas)

- `chain` — ataque que toca enemigo y salta al más cercano hasta 2-3 enemigos. Daño decrece por salto. Visual estilo rayo eléctrico
- `trap` — como area pero invisible/casi-invisible hasta que enemigo la pisa. Persistente 4-5s. Estratégico

## Configuración de balance (v1)

Ajustes actuales tras iteración:

- **Damage formula**: `(atk × power) / (def × 6)` con variance ±15%
- **HP típicos**: 280 (Comun/Rara), 400 (Legendaria)
- **Movement speed**: stat.spd × 1.8 (toward) / 1.6 (away) / 1.3 (strafe)
- **Stun al recibir hit**: 200ms
- **Tick rate**: 100ms (10 Hz)
- **Max battle duration**: 90s (timeout)

Resultados objetivo:
- Duración: 18-25 segundos
- Accuracy: 75-85% (15-25% de misses para drama)
- Win rate balanceado (50/50 con teams equilibrados)

## Arquitectura

### Engine (`server/spatialCombatEngine.js`)

- Standalone, no integrado con `server/index.js` todavía
- Determinista con `options.seed` (Mulberry32 PRNG)
- Método `simulate()` corre todo y devuelve resultado completo
- Método `getSnapshot()` devuelve estado actual (para futuro renderizado en vivo)
- Método `tick()` avanza un solo tick (utilizado internamente)

### Tests (`server/spatialCombatEngine.spec.js`)

31 tests pasando. Cubren:
- Type effectiveness
- Determinismo de RNG
- Determinismo de battles con seed
- Battle termina (no infinite loop)
- getSnapshot estructura
- KO al hp 0
- Damage formula
- Wave geometry
- Beam single-target

### Test runner (`server/spatialCombatEngine.test.js`)

Simula 20 batallas con teams de prueba y muestra log legible. Útil para
iterar balance.

## Sistema de roles (decisión de diseño)

Cada criatura tiene 2 atributos relacionados con comportamiento:

- **`preferred_role`** — atributo INTRÍNSECO, asignado **aleatoriamente al nacer del huevo**.
  - 25% probabilidad por rol (aggressive/kiter/flanker/hybrid)
  - **Sin importar especie ni rareza**: dos Gaiaroth pueden tener preferred_role distinto
  - Esto da valor único a cada instancia → coleccionismo + marketplace dinámico

- **`role`** — el que el JUGADOR asigna pre-batalla. Cualquier rol válido.

**Bonificadores de afinidad:**

| Configuración | Bonus |
|---|---|
| `role === preferred_role` | **+10% damage** (en su elemento) |
| `role !== preferred_role` | **-5% damage** (fuera de zona) |

Ejemplo:
- Tidalmor con preferred_role=`kiter` jugado como kiter → +10% dmg
- Tidalmor con preferred_role=`kiter` jugado como aggressive → -5% dmg
- Otro Tidalmor con preferred_role=`aggressive` jugado como aggressive → +10% dmg

Esto crea decisiones de team building reales y valor en marketplace ("¡Tidalmor *aggressive* legendario!").

### Pendiente para producción

1. Migración SQL: `ALTER TABLE creatures ADD COLUMN preferred_role VARCHAR(20)`
2. Al generar criatura desde huevo (`/api/eggs/open`, `/api/eggs/claim`, `/api/player` POST):
   ```js
   const ROLES = ['aggressive', 'kiter', 'flanker', 'hybrid'];
   const preferred_role = ROLES[Math.floor(Math.random() * 4)];
   ```
3. UI team builder: selector de role pre-batalla + indicador "★ Natural" cuando coincide
4. Marketplace: mostrar `preferred_role` como atributo destacado en cards de listings

## Pendiente

### Fase 2: Renderizado Canvas (próxima sesión)

- Componente React con Canvas API (sin engine externo, plain Canvas)
- Render de criaturas como sprites (con flip horizontal)
- Render de cada shape de ataque con su geometría
- Sync vía socket: server emite `getSnapshot()` cada N ticks, cliente interpola
- Imagery: `imageSmoothingEnabled = false` para look pixelado

### Fase 3: Implementar shapes pendientes

Una vez Fase 2 funciona, añadir bounce, fan_3, fan_5, arrow, charge uno por uno.
Cada uno: ~30min lógica + ~30min render + ~20min tests.

### Fase 4: Integración con `server/index.js`

Cambiar matchmaking para usar `SpatialCombatEngine` en lugar del viejo
`combatEngine.js`. Mantener el viejo en repo para fallback.

### Fase 5: Refactor de `attacks` para shape por ataque

Actualmente shape se asigna por índice (`atk[0]=wave`, etc). Eventualmente
añadir campo `attack.shape` explícito en `gameData.js` para que cada criatura
tenga combinación única de shapes.

## Backup del sistema viejo

`server/combatEngine.js` (sistema turn-based original) sigue intacto en repo.
Para volver atrás si la nueva dirección no funciona:
```bash
git checkout v1-turn-based-combat  # cuando se cree el tag
# O simplemente revertir los commits de spatial engine
```

## Sistema legal / arquitectural relacionado

Si CryptoCreatures escala, considerar migrar el marketplace a Magic Eden o
Solana smart contract para evitar exposición a MiCA (CASP). Ver discusión en
sesión correspondiente. No bloquea el desarrollo del combate.
