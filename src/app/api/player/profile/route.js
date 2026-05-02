import { query } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

// ============================================
// PATCH /api/player/profile
// Actualiza tu propio perfil. Cambios soportados:
//   - avatar_creature_id (debe ser una criatura tuya, o null para resetear)
//   - username (formato + unicidad case-insensitive + cooldown 30d)
//
// Auth: requerida.
// SECURITY:
//   - Validamos ownership de la criatura antes de setear avatar.
//   - Username: regex estricto (sin unicode lookalikes), unicidad atómica, cooldown.
// ============================================

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/;
const USERNAME_COOLDOWN_DAYS = 30;
const USERNAME_RESERVED = new Set([
  'admin', 'system', 'null', 'undefined', 'root', 'support',
  'cryptocreatures', 'mod', 'moderator', 'official', 'anonymous',
]);

function validateUsernameFormat(u) {
  if (typeof u !== 'string') return 'Username inválido';
  const trimmed = u.trim();
  if (trimmed.length < USERNAME_MIN) return `Mínimo ${USERNAME_MIN} caracteres`;
  if (trimmed.length > USERNAME_MAX) return `Máximo ${USERNAME_MAX} caracteres`;
  if (!USERNAME_REGEX.test(trimmed)) return 'Solo letras, números, _ y -';
  if (USERNAME_RESERVED.has(trimmed.toLowerCase())) return 'Nombre reservado';
  return null;
}

export async function PATCH(req) {
  const privyId = await getAuthenticatedPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { username, avatar_creature_id } = body || {};
  const wantsUsername = Object.prototype.hasOwnProperty.call(body, 'username');
  const wantsAvatar = Object.prototype.hasOwnProperty.call(body, 'avatar_creature_id');

  if (!wantsUsername && !wantsAvatar) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    // Lookup player
    const pRes = await query(
      'SELECT id, username, username_changed_at FROM players WHERE privy_id = $1',
      [privyId]
    );
    if (pRes.rows.length === 0) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    const player = pRes.rows[0];

    // ---------- Validar avatar (si se cambia) ----------
    let validatedAvatarId = null;
    if (wantsAvatar) {
      if (avatar_creature_id === null) {
        validatedAvatarId = null;
      } else {
        const avId = parseInt(avatar_creature_id, 10);
        if (!Number.isFinite(avId) || avId <= 0) {
          return NextResponse.json({ error: 'Invalid avatar_creature_id' }, { status: 400 });
        }
        const ownRes = await query(
          'SELECT 1 FROM creatures WHERE id = $1 AND owner_id = $2',
          [avId, player.id]
        );
        if (ownRes.rows.length === 0) {
          return NextResponse.json({ error: 'You do not own that creature' }, { status: 403 });
        }
        validatedAvatarId = avId;
      }
    }

    // ---------- Validar username (si se cambia) ----------
    let validatedUsername = null;
    if (wantsUsername) {
      const formatErr = validateUsernameFormat(username);
      if (formatErr) {
        return NextResponse.json({ error: formatErr }, { status: 400 });
      }
      const newName = username.trim();

      // Si es el mismo (case-insensitive), no hacemos nada — pero permitimos cambiar
      // de "trainer1" a "Trainer1" sin cooldown (cosmético).
      const sameLower = newName.toLowerCase() === player.username.toLowerCase();

      if (!sameLower) {
        // Cooldown
        if (player.username_changed_at) {
          const last = new Date(player.username_changed_at);
          const daysSince = (Date.now() - last.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < USERNAME_COOLDOWN_DAYS) {
            const daysLeft = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSince);
            return NextResponse.json({
              error: `Solo puedes cambiar de nombre una vez cada ${USERNAME_COOLDOWN_DAYS} días. Faltan ${daysLeft}.`,
              days_left: daysLeft,
            }, { status: 429 });
          }
        }

        // Unicidad case-insensitive (excluyendo a uno mismo)
        const dupRes = await query(
          'SELECT 1 FROM players WHERE LOWER(username) = LOWER($1) AND id <> $2',
          [newName, player.id]
        );
        if (dupRes.rows.length > 0) {
          return NextResponse.json({ error: 'Username ya está en uso' }, { status: 409 });
        }
      }

      validatedUsername = newName;
    }

    // ---------- Build dynamic UPDATE ----------
    const sets = [];
    const args = [];
    let i = 1;
    if (wantsAvatar) {
      sets.push(`avatar_creature_id = $${i++}`);
      args.push(validatedAvatarId);
    }
    if (wantsUsername) {
      const sameLower = validatedUsername.toLowerCase() === player.username.toLowerCase();
      sets.push(`username = $${i++}`);
      args.push(validatedUsername);
      // Solo actualizamos username_changed_at si realmente cambió de identidad (no solo cosmético)
      if (!sameLower) {
        sets.push(`username_changed_at = NOW()`);
      }
    }
    args.push(player.id);

    let updRes;
    try {
      updRes = await query(
        `UPDATE players SET ${sets.join(', ')} WHERE id = $${i}
         RETURNING id, username, avatar_creature_id, username_changed_at`,
        args
      );
    } catch (err) {
      // Race condition: alguien tomó el username entre nuestro check y este UPDATE
      if (err.code === '23505') {
        return NextResponse.json({ error: 'Username ya está en uso' }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, player: updRes.rows[0] });
  } catch (err) {
    console.error('[PROFILE] PATCH error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
