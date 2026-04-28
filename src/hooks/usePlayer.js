'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useApi } from '@/lib/api';

export function usePlayer() {
  const { user, authenticated, ready } = usePrivy();
  const api = useApi();
  const [player, setPlayer] = useState(null);
  const [creatures, setCreatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dailyBattles, setDailyBattles] = useState(0);
  const [dailyRemaining, setDailyRemaining] = useState(10);
  const [dailyLimit, setDailyLimit] = useState(10);

  const fetchPlayer = useCallback(async () => {
    // Esperar a que Privy termine de inicializar antes de decidir nada
    if (!ready) return;
    // Si ya sabemos que no hay sesión, dejar de cargar (evita "Cargando..." infinito en incógnito)
    if (!authenticated || !user) {
      setLoading(false);
      return;
    }

    try {
      // SECURITY: ya NO mandamos walletAddress al server. El server lo obtiene
      // de Privy server-side via getVerifiedSolanaWallet() para evitar hijack.
      const res = await api('/api/player');
      if (res.ok) {
        const data = await res.json();
        setPlayer(data.player);
        setCreatures(data.creatures);
        if (typeof data.dailyBattles === 'number') setDailyBattles(data.dailyBattles);
        if (typeof data.dailyRemaining === 'number') setDailyRemaining(data.dailyRemaining);
        if (typeof data.dailyLimit === 'number') setDailyLimit(data.dailyLimit);
      } else if (res.status === 404) {
        // Nuevo jugador: crear perfil
        const createRes = await api('/api/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email?.address || user.google?.email,
            username: user.google?.name || `Trainer${Date.now().toString(36)}`,
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
  }, [ready, authenticated, user, api]);

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
