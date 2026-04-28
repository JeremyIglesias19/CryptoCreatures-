'use client';
import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/lib/api';

// Hook para gestionar los presets de equipo del jugador autenticado.
// Uso: const { presets, createPreset, deletePreset, refetch } = useTeamPresets(privyId);
// Auth real va vía JWT (useApi); privyId solo se usa como gate "hay sesión activa".

export function useTeamPresets(privyId) {
  const api = useApi();
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPresets = useCallback(async () => {
    if (!privyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api('/api/team-presets');
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
  }, [privyId, api]);

  useEffect(() => { fetchPresets(); }, [fetchPresets]);

  const createPreset = useCallback(async (name, creatureIds) => {
    if (!privyId) return { error: 'Not authed' };
    try {
      const res = await api('/api/team-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, creatureIds }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Error' };
      setPresets(prev => [data.preset, ...prev]);
      return { preset: data.preset };
    } catch (err) {
      return { error: err.message };
    }
  }, [privyId, api]);

  const deletePreset = useCallback(async (presetId) => {
    if (!privyId) return { error: 'Not authed' };
    // Optimista
    const prev = presets;
    setPresets(p => p.filter(x => x.id !== presetId));
    try {
      const res = await api(`/api/team-presets/${presetId}`, { method: 'DELETE' });
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
  }, [privyId, presets, api]);

  return { presets, loading, error, createPreset, deletePreset, refetch: fetchPresets };
}
