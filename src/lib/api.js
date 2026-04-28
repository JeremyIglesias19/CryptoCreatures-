'use client';
import { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

// ============================================
// useApi
// Hook que devuelve un wrapper de fetch que añade automáticamente el JWT de
// Privy en el header Authorization. Esto sustituye al patrón antiguo de
// pasar `x-privy-id` en headers (que era trivialmente bypaseable).
//
// USO:
//   const api = useApi();
//   const res = await api('/api/foo');
//   const res = await api('/api/foo', { method: 'POST', body: JSON.stringify({...}) });
//
// El token se obtiene fresh en cada llamada (Privy lo cachea internamente y
// solo refresca si ha expirado, así que no penaliza el rendimiento).
// ============================================
export function useApi() {
  const { getAccessToken } = usePrivy();

  return useCallback(async (url, options = {}) => {
    let token = null;
    try {
      token = await getAccessToken();
    } catch {
      token = null;
    }
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  }, [getAccessToken]);
}
