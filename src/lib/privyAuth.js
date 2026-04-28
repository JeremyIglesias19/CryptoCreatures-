// ============================================
// Helper de auth para Next.js API routes.
// Verifica el JWT de Privy y devuelve el privy_id (userId) verificado.
// ============================================
//
// USO:
//   import { getAuthenticatedPrivyId } from '@/lib/privyAuth';
//   const privyId = await getAuthenticatedPrivyId(req);
//   if (!privyId) return NextResponse.json({ error: 'No auth' }, { status: 401 });
//
// El cliente DEBE enviar el JWT en el header:
//   Authorization: Bearer <privy_access_token>
//
// SEGURIDAD: este es el único punto de entrada legítimo para autenticar.
// El header antiguo `x-privy-id` está DEPRECATED y no se debe leer en endpoints nuevos.
// ============================================

import { PrivyClient } from '@privy-io/server-auth';

let privyClient = null;

function getPrivyClient() {
  if (privyClient) return privyClient;

  // App ID: usamos PRIVY_APP_ID o caemos al NEXT_PUBLIC_PRIVY_APP_ID que ya
  // está en .env del frontend (el App ID no es secreto, es público por diseño).
  const appId = process.env.PRIVY_APP_ID || process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    // Fail-closed: si las credenciales no están seteadas, no podemos verificar nada.
    // En desarrollo el dev tiene que setear estas vars o todos los endpoints darán 401.
    console.error('[AUTH] PRIVY_APP_ID o PRIVY_APP_SECRET no están seteadas');
    return null;
  }

  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * Extrae y verifica el JWT del header Authorization.
 * @param {Request} req - Next.js Request object.
 * @returns {Promise<string|null>} El privy_id verificado, o null si no hay auth válida.
 */
export async function getAuthenticatedPrivyId(req) {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const client = getPrivyClient();
  if (!client) return null;

  try {
    const claims = await client.verifyAuthToken(token);
    // claims.userId es el Privy DID (lo que tenemos guardado como privy_id en DB)
    return claims.userId || null;
  } catch (err) {
    // Token inválido, expirado, mal firmado, etc.
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[AUTH] Token verify failed:', err.message);
    }
    return null;
  }
}

/**
 * Variante para Socket.IO: recibe el token directamente (string).
 * @param {string} token - JWT.
 * @returns {Promise<string|null>}
 */
export async function verifyPrivyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const client = getPrivyClient();
  if (!client) return null;

  try {
    const claims = await client.verifyAuthToken(token);
    return claims.userId || null;
  } catch (err) {
    return null;
  }
}

// ============================================
// getVerifiedSolanaWallet
//
// Obtiene la wallet de Solana del usuario directamente de Privy server-side,
// no confía en lo que mande el cliente. Necesario porque el JWT solo trae
// userId, no la wallet — y aceptar la wallet del cliente permite hijack
// (atacante registra reclamando wallet de otro → ese atacante puede luego
// "cobrar" txs que la víctima envía al escrow).
//
// NOTA: getUser tiene rate limits por Privy. Llamarlo solo en operaciones
// de SET de wallet (registro inicial, refresh manual), NO en cada request.
//
// @param {string} privyId - Verificado previamente con verifyAuthToken.
// @returns {Promise<string|null>} La wallet Solana linkeada, o null.
// ============================================
export async function getVerifiedSolanaWallet(privyId) {
  if (!privyId) return null;
  const client = getPrivyClient();
  if (!client) return null;

  try {
    const user = await client.getUser(privyId);
    const accounts = user?.linkedAccounts || [];
    // linkedAccounts puede contener wallets de varias chains. Filtramos Solana.
    const solWallet = accounts.find(
      a => a && a.type === 'wallet' && a.chainType === 'solana'
    );
    return solWallet?.address || null;
  } catch (err) {
    console.warn('[AUTH] getUser failed for', privyId, ':', err.message);
    return null;
  }
}
