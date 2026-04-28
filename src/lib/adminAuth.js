// ============================================
// Helper de auth para endpoints admin.
// El admin se identifica por su privy_id, registrado en ADMIN_PRIVY_ID env.
// Si la env no está seteada, ningún endpoint admin funciona (fail-closed).
//
// SECURITY: el privy_id se obtiene del JWT verificado de Privy, NO del header
// directo. Antes leíamos x-privy-id sin verificar, lo cual era trivialmente
// bypaseable. Ahora pasamos por getAuthenticatedPrivyId() que verifica el JWT.
// ============================================

import { getAuthenticatedPrivyId } from '@/lib/privyAuth';

/**
 * @param {Request} req
 * @returns {Promise<boolean>} true si el caller está autenticado vía JWT y su privy_id coincide con ADMIN_PRIVY_ID.
 */
export async function isAdminRequest(req) {
  const adminPrivyId = process.env.ADMIN_PRIVY_ID;
  if (!adminPrivyId) return false; // fail-closed sin config

  const verifiedPrivyId = await getAuthenticatedPrivyId(req);
  if (!verifiedPrivyId) return false;

  // Comparación timing-safe-ish (privy_id no es realmente secreto, pero por consistencia).
  if (verifiedPrivyId.length !== adminPrivyId.length) return false;
  let diff = 0;
  for (let i = 0; i < verifiedPrivyId.length; i++) {
    diff |= verifiedPrivyId.charCodeAt(i) ^ adminPrivyId.charCodeAt(i);
  }
  return diff === 0;
}
