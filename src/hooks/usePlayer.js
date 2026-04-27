'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export function usePlayer() {
  const { user, authenticated, ready } = usePrivy();
  const [player, setPlayer] = useState(null);
  const [creatures, setCreatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyBattles, setDailyBattles] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(10);

  // Get the Solana wallet address from Privy
  const getWalletAddress = () => {
    if (!user) return null;
    // Privy embedded wallets - check linked accounts
    const solWallet = user.linkedAccounts?.find(
      a => a.type === 'wallet' && a.chainType === 'solana'
    );
    if (solWallet) return solWallet.address;
    // Fallback: check wallet field directly
    if (user.wallet?.address) return user.wallet.address;
    return null;
  };

  const fetchPlayer = useCallback(async () => {
    // Esperar a que Privy termine de inicializar antes de decidir nada
    if (!ready) return;
    // Si ya sabemos que no hay sesión, dejar de cargar (evita "Cargando..." infinito en incógnito)
    if (!authenticated || !user) {
      setLoading(false);
      return;
    }
    const walletAddress = getWalletAddress();

    try {
      const res = await fetch('/api/player', {
        headers: {
          'x-privy-id': user.id,
          ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayer(data.player);
        setCreatures(data.creatures);
        if (typeof data.dailyBattles === 'number') setDailyBattles(data.dailyBattles);
        if (typeof data.dailyRemaining === 'number') setDailyRemaining(data.dailyRemaining);
        if (typeof data.dailyLimit === 'number') setDailyLimit(data.dailyLimit);
      } else if (res.status === 404) {
        // Nuevo jugador: crear perfil
        const createRes = await fetch('/api/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-privy-id': user.id },
          body: JSON.stringify({
            email: user.email?.address || user.google?.email,
            username: user.google?.name || `Trainer${Date.now().toString(36)}`,
            walletAddress,
          }),
        });
        if (createRes.ok) {
          const data = await createRes.json();
          setPlayer(data.player);
          setCreatures(data.creatures);
        }
      }
    } catch (err) {
      console.error('Error fetching player:', err);
    } finally {
      setLoading(false);
    }
  }, [ready, authenticated, user]);

  useEffect(() => { fetchPlayer(); }, [fetchPlayer]);

  // Patch local: aplica cambios a una criatura en el state sin hacer refetch.
  // Útil para updates optimistas (p.ej. toggle de favorito).
  const patchCreature = useCallback((creatureId, patch) => {
    setCreatures(prev => prev.map(c => (c.id === creatureId ? { ...c, ...patch } : c)));
  }, []);

  return {
    player,
    creatures,
    loading,
    dailyBattles,
    dailyRemaining,
    dailyLimit,
    refetch: fetchPlayer,
    patchCreature,
  };
}
