'use client';
import { useState, useEffect, useCallback } from 'react';

// Hook para gestionar los presets de equipo del jugador autenticado.
// Uso: const { presets, createPreset, deletePreset, refetch } = useTeamPresets(privyId);

export function useTeamPresets(privyId) {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPresets = useCallback(async () => {
    if (!privyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/team-presets', {
        headers: { 'x-privy-id': privyId },
      });
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      } else {
        setPresets([]);
      }
    } catch (err) {
      console.error('[useTeamPresets] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [privyId]);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const createPreset = useCallback(async (name, creatureIds) => {
    if (!privyId) return { error: 'Not authed' };
    try {
      const res = await fetch('/api/team-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-privy-id': privyId },
        body: JSON.stringify({ name, creatureIds }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Error' };
      setPresets(prev => [data.preset, ...prev]);
      return { preset: data.preset };
    } catch (err) {
      return { error: err.message };
    }
  }, [privyId]);

  const deletePreset = useCallback(async (presetId) => {
    if (!privyId) return { error: 'Not authed' };
    // Optimista
    const prev = presets;
    setPresets(p => p.filter(x => x.id !== presetId));
    try {
      const res = await fetch(`/api/team-presets/${presetId}`, {
        method: 'DELETE',
        headers: { 'x-privy-id': privyId },
      });
      if (!res.ok) {
        setPresets(prev); // rollback
        const data = await res.json().catch(() => ({}));
        return { error: data.error || 'Error' };
      }
      return { ok: true };
    } catch (err) {
      setPresets(prev); // rollback
      return { error: err.message };
    }
  }, [privyId, presets]);

  return { presets, loading, error, createPreset, deletePreset, refetch: fetchPresets };
}
