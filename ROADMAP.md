# CryptoCreatures — Roadmap de Lotes

> Plan original definido el 18 abr 2026. Estado actualizado el 22 abr 2026.

## ✅ Lote 1 — Landing + Navbar
Landing page, navbar con stats, FAQ.

## ✅ Lote 2 — Colección pulida
Búsqueda, filtros (rareza, tipo), tier quality en las cards, favoritos, modal de detalle con historial de combates.

## ✅ Lote 3 — Team Builder *(parcial)*
Hecho: presets guardados (`team_presets`), auto-pick (Top ATK / Top tier / Favoritas), panel de análisis de equipo (cobertura ofensiva, debilidades, stats agregados).
**Pendiente:** comparación lado a lado con radar chart entre 2-3 criaturas.

## 🔵 Lote 4 — Notificaciones *(siguiente)*
Habilitador para lotes 5 y 10.
- Tabla `notifications` en DB
- Campana en navbar con dropdown + unread count
- Eventos: venta en mercado, subida de tier, nuevos récords
- Realtime vía Socket.IO

## Lote 5 — Huevos (polish)
- Animación por rareza diferenciada (más larga + efectos para Épico+)
- Eclosión social pública al abrir Mítico (usa L4)

## Lote 6 — Bestiario
- Tabla de efectividad de tipos
- Lore por criatura (contenido generado, tú revisas)
- Animación de descubrimiento
- Logros del bestiario (tabla `achievements`)

## Lote 7 — Combate (pre + post)
- Preview del oponente 3s antes
- MVP del combate (post-battle summary con stats destacadas)
- Modo práctica vs IA (no consume cupo diario)

## Lote 8 — Ranking
- Filtro por tier
- Widget "Tu posición"
- Tier badges visuales reforzados

## Lote 9 — Historial + Analíticas personales
- Dashboard: criatura MVP, peor matchup, mejor racha

## Lote 10 — Marketplace avanzado
- Filtros avanzados (stats, tier, tipo, ability)
- Watchlist con alertas (usa L4)
- Gráfica de precios históricos (tabla `price_snapshots`, job diario)

## Lote 11 — Replay *(opcional)*
- Refactor motor de combate a determinista con seed
- Endpoint + UI de replay

---

## Deuda técnica paralela (tareas #3–#6 del task list)
- Migración `battles.winner_id ON DELETE SET NULL`
- Índice parcial en `creatures.listed`
- Endpoint admin para reembolsar SOL en races de marketplace
- Socket.IO: re-validar privy_id en eventos de alto impacto

## Bloqueantes de seguridad pendientes (desde sesiones anteriores)
- 🚨 Rotar `PRIVY_APP_SECRET`
- 🚨 Rotar password de DATABASE_URL en Railway
