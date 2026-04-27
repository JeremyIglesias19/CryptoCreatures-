'use client';
import { useEffect, useState, useRef } from 'react';

// ============================================
// useSolBalance: balance de SOL para una wallet
// - Refresca cada 60s
// - Devuelve null mientras carga
// - Importa @solana/web3.js dinámicamente para no inflar el bundle
// ============================================

const REFRESH_MS = 60 * 1000;

export function useSolBalance(address) {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      return;
    }

    let cancelled = false;

    async function fetchBalance() {
      setLoading(true);
      try {
        const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
        const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com';
        const conn = new Connection(rpc, 'confirmed');
        const lamports = await conn.getBalance(new PublicKey(address));
        if (!cancelled) setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (err) {
        console.warn('[useSolBalance] fetch failed:', err.message);
        if (!cancelled) setBalance(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBalance();
    timerRef.current = setInterval(fetchBalance, REFRESH_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [address]);

  return { balance, loading };
}
