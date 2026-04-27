import { query } from './db';

// ============================================
// Helper de notificaciones (lado Next.js)
// Inserta + aplica cap de 50 por jugador (borra las más antiguas).
// Diseñado para ser llamado desde rutas API tras acciones del jugador.
// ============================================

const MAX_PER_PLAYER = 50;

// Whitelist estricta — cualquier type no registrado se rechaza (evita polución futura)
const VALID_TYPES = new Set([
  'marketplace_sold',
  'tier_up',
  'record',
  'system',
]);

const TITLE_MAX = 120;
const BODY_MAX = 280;

/**
 * Inserta una notificación para un jugador.
 * Devuelve la fila insertada, o null si la validación falla.
 * No lanza: loggea y retorna null para no romper flujos de pago/batalla.
 *
 * @param {number} playerId
 * @param {{type: string, title: string, body?: string|null, payload?: object}} notif
 */
export async function insertNotification(playerId, { type, title, body = null, payload = {} }) {
  if (!Number.isInteger(playerId) || playerId <= 0) return null;
  if (!VALID_TYPES.has(type)) {
    console.warn('[notifications] type inválido:', type);
    return null;
  }
  if (typeof title !== 'string' || title.length === 0) return null;

  try {
    const res = await query(
      `INSERT INTO notifications (player_id, type, title, body, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, type, title, body, payload, read_at, created_at`,
      [
        playerId,
        type,
        title.slice(0, TITLE_MAX),
        body ? String(body).slice(0, BODY_MAX) : null,
        JSON.stringify(payload || {}),
      ]
    );

    // Cap: borra las que están más allá del top 50 por antigüedad.
    // Best-effort — no awaiteamos fallos para no bloquear el flujo original.
    query(
      `DELETE FROM notifications
       WHERE player_id = $1
         AND id IN (
           SELECT id FROM notifications
           WHERE player_id = $1
           ORDER BY created_at DESC
           OFFSET $2
         )`,
      [playerId, MAX_PER_PLAYER]
    ).catch(err => console.error('[notifications] cap error:', err.message));

    return res.rows[0];
  } catch (err) {
    console.error('[notifications] insert error:', err.message);
    return null;
  }
}
