'use client';
import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export function usePlayer() {
  const { user, authenticated } = usePrivy();
  const [player, setPlayer] = useState(null);
  const [creatures, setCreatures] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!authenticated || !user) return;
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
  }, [authenticated, user]);

  useEffect(() => { fetchPlayer(); }, [fetchPlayer]);

  return { player, creatures, loading, refetch: fetchPlayer };
}
