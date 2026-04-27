# Auditoría de código — CryptoCreatures (22 abr 2026)

Revisión completa post-Lote 3 (Team Builder). Cubre `src/`, `server/`, `db/`.

---

## Resumen ejecutivo

- **Lote 3 (team presets): SÓLIDO**. Sin vulnerabilidades, validación estricta, authz por JOIN, caps anti-abuso, índice único case-insensitive. No hace falta tocar nada.
- **3 issues reales encontrados en código pre-existente** (2 ya arreglados en esta pasada, 1 pendiente de revisión manual).
- **Varias mejoras menores sugeridas** (dead code, tipado defensivo, FK constraints).
- **La "SQL injection" que un primer barrido sugirió en `/api/creatures/[id]/favorite` fue falso positivo**: el ternario elegía entre dos strings hardcodeados, sin input del usuario. Aun así, reescribí la query a `CASE WHEN` para que sea 100% estática y evitar confusiones futuras.

---

## Arreglado en esta revisión

### 1. `analyzeTeam` — null-safety con `attacks` corrupto
`src/lib/gameData.js`. Si la DB devolvía JSON roto, `JSON.parse` tumbaba la función y la UI. Ahora ignora silenciosamente criaturas con attacks inválidos.

### 2. `/api/creatures/[id]/favorite` — query estática
Reescrita con `CASE WHEN $3::boolean IS NULL` dentro del UPDATE. Misma lógica, pero ahora la query es un literal sin ramificación en JS. Más fácil de auditar, imposible de malinterpretar.

### 3. `/api/marketplace/buy` — race condition (HIGH)
**Antes:** transferíamos la criatura y luego marcábamos la listing como `sold`, en dos queries separadas. Dos compradores simultáneos podían pasar el `SELECT ... WHERE status='active'`, los dos enviaban SOL, los dos transferían ownership (se pisaban), los dos marcaban `sold`. Resultado: doble pago, NFT al último en escribir.

**Después:** primero cerramos la listing atómicamente con `UPDATE ... WHERE id=$1 AND status='active' RETURNING id`. Si no devuelve fila, otro comprador se adelantó → devolvemos 409 y **no** transferimos la criatura (el SOL ya se envió, queda log para reembolso manual).

> ⚠️ **Acción pendiente en prod:** añadir un endpoint admin para reembolsar SOL cuando suceda este 409. Lo lógico es detectar por `tx_signature` que ya no está en ninguna listing `sold` y el buyer tiene SOL "perdido".

---

## Pendiente de revisar tú

### A. FK constraint faltante en `battles.winner_id` (MEDIUM)
`db/schema.sql:51` — `winner_id INT REFERENCES players(id)` sin `ON DELETE`. Si borras un jugador, los `battles` históricos pierden la FK en silencio (pero funciona como `NO ACTION`, así que bloquea el delete). Recomendado:

```sql
ALTER TABLE battles
  DROP CONSTRAINT IF EXISTS battles_winner_id_fkey,
  ADD CONSTRAINT battles_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES players(id) ON DELETE SET NULL;
```

No es urgente — solo importa si vas a permitir borrar jugadores algún día.

### B. Socket.IO sin re-auth en eventos (MEDIUM)
`server/index.js` autentica una vez en `socket.on('auth')` y confía en `playerId` para siempre. Si el token de Privy expira, el socket sigue vivo. No es vulnerabilidad (el `playerId` se deriva al conectar, no del cliente después), pero si revocas una cuenta manualmente el socket vivo sigue jugando hasta desconectarse.

**Mitigación opcional:** re-validar en eventos de alto impacto (matchmaking:join, battle:action) con un `SELECT id FROM players WHERE privy_id = $1`. Coste: 1 query extra por acción.

### C. Timezone en límite de combates diarios
Tanto `server/index.js:163` como `/api/battles/route.js` usan `CURRENT_DATE` (timezone del servidor de Railway). Un jugador en España y otro en California ven "reset" a horas distintas. No es bug, pero documenta qué timezone usas o cambia a UTC explícito:

```sql
AND finished_at >= (NOW() AT TIME ZONE 'UTC')::date
```

### D. Duplicación `TYPE_ADVANTAGE` en 3 sitios
`src/lib/gameData.js`, `server/index.js`, `server/combatEngine.js` definen la misma tabla tres veces. El comentario en `gameData.js` ya avisa de "mantener sincronizado", pero es frágil. Opciones:
- Mover las constantes a un `shared/types.js` y cargarlo desde ambos lados (complica bundler).
- Aceptar la duplicación y añadir un test unitario que falle si divergen.

Recomiendo la segunda por simplicidad.

### E. Índice faltante en `creatures.listed` (LOW)
El marketplace filtra por `listed = true` mucho. Un índice parcial ayudaría si el catálogo crece:

```sql
CREATE INDEX IF NOT EXISTS idx_creatures_listed_true
  ON creatures(listed) WHERE listed = true;
```

### F. `SELECT *` en rutas que devuelven al cliente (LOW)
`api/player/route.js`, `api/marketplace/buy/route.js` hacen `SELECT * FROM players`. Si añades columnas sensibles en el futuro (p. ej. `email_verified_at`, `admin_notes`) se filtran al cliente sin darte cuenta. Mejor listar columnas explícitas donde el row va al JSON de respuesta.

---

## Lote 3 — verificación detallada

Auditados uno a uno:

**`/api/team-presets` (POST)**
- ✓ Valida `name` (1-32, trim).
- ✓ Valida `creatureIds` (exactamente 3 enteros positivos únicos).
- ✓ Cap MAX_PRESETS_PER_PLAYER = 10 aplicado antes del INSERT.
- ✓ Ownership verificado con `COUNT(*) FROM creatures WHERE id = ANY($1) AND owner_id = $2` → no filtra cuáles faltan (403 genérico).
- ✓ Parameterizado 100%.
- ✓ 23505 capturado para duplicado de nombre → 409 limpio.
- ✓ Error genérico 500 sin leakear detalles.

**`/api/team-presets/[id]` (DELETE)**
- ✓ DELETE con authz atómica vía JOIN (`tp.owner_id = p.id AND p.privy_id = $2`).
- ✓ Devuelve 404 idéntico tanto si no existe como si no es tuyo (no leak).

**`useTeamPresets` hook**
- ✓ Delete optimista con rollback correcto.
- ✓ Sin race: el rollback captura `prev` antes del `setPresets`.
- ✓ No hay fetch en loop (efecto solo depende de `privyId`).

**`TeamPresetsBar`**
- ✓ `isPresetValid` evita cargar equipos con criaturas vendidas.
- ✓ Límite de nombre (maxLength=32) coincide con el backend.
- ✓ Confirm antes de borrar.

**`TeamAnalysisPanel`**
- ✓ Respeta `return null` si `analyzeTeam` devuelve `null`.
- ✓ Colores consistentes con el resto del juego.

**`analyzeTeam` (gameData.js)**
- ✓ Maneja equipos vacíos (return null).
- ✓ Normaliza types (string o array).
- ✓ Multiplicadores correctos (1.5x ventaja, 0.65x resistencia).
- ✓ **Ahora también** soporta attacks JSON corrupto (fix de hoy).

**`team_presets_migration.sql`**
- ✓ FK `ON DELETE CASCADE` correcto.
- ✓ Índice único `(owner_id, LOWER(name))` para duplicado case-insensitive.
- ℹ️ Opcional: `CHECK (jsonb_array_length(creature_ids) = 3)` como defensa en profundidad.

---

## Lo que vi bien

- Ownership via JOIN es tu patrón estándar en casi todas las rutas → consistente, atómico, seguro.
- Queries parametrizadas en todo el codebase.
- Rollback en TODAS las operaciones optimistas (favoritos, presets, marketplace local).
- `ON DELETE CASCADE` en relaciones críticas.
- Errores al cliente genéricos, logging interno con detalle → buen equilibrio.
- Nombres de variables y comentarios en español consistentes, sin mezcla.

---

## Prioridades sugeridas

1. **Ya hecho** — race de marketplace, favorite cleanup, analyzeTeam null-safety.
2. **Siguiente sesión** — FK `winner_id ON DELETE SET NULL` (A) + índice `creatures.listed` (E).
3. **Cuando haya tiempo** — socket re-auth (B), timezone explícito (C), test anti-drift para TYPE_ADVANTAGE (D).
4. **Deuda que acumular** — migrar `SELECT *` a columnas explícitas en rutas públicas (F).
