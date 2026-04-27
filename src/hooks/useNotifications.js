'use client';
import { useState, useEffect, useCallback } from 'react';

// ============================================
// useNotifications(privyId, on)
//  - Carga inicial + polling cada 60s + refetch al volver a la pestaña
//  - Escucha 'notif:new' del socket para realtime push (desde server/index.js)
//  - markRead / markAllRead son optimistas con rollback implícito vía refetch
// ============================================

const POLL_INTERVAL_MS = 60_000;

export function useNotifications(privyId, on) {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = useCallback(async () => {
    if (!privyId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20', {
        headers: { 'x-privy-id': privyId },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnread(typeof data.unread === 'number' ? data.unread : 0);
      }
    } catch (err) {
      console.error('[useNotifications] fetch:', err.message);
    } finally {
      setLoading(false);
    }
  }, [privyId]);

  // Carga inicial + polling + refresh al volver a la pestaña
  useEffect(() => {
    fetchNotifs();
    const intervalId = setInterval(fetchNotifs, POLL_INTERVAL_MS);
    const onFocus = () => fetchNotifs();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      clearInterval(intervalId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [fetchNotifs]);

  // Realtime: evento 'notif:new' del socket server (ej: subida de tier tras batalla)
  useEffect(() => {
    if (!on) return;
    const unsub = on('notif:new', (notif) => {
      if (!notif || typeof notif !== 'object') return;
      setNotifications(prev => {
        // Deduplicar por id (por si llega tanto por polling como por socket)
        const withoutDup = prev.filter(n => n.id !== notif.id);
        return [notif, ...withoutDup].slice(0, 20);
      });
      if (!notif.read_at) setUnread(u => u + 1);
    });
    return () => unsub?.();
  }, [on]);

  const markRead = useCallback(async (id) => {
    if (!privyId) return;
    // Optimista: solo si no estaba leída para no sobrecontar
    let wasUnread = false;
    setNotifications(prev => prev.map(n => {
      if (n.id === id && !n.read_at) {
        wasUnread = true;
        return { ...n, read_at: new Date().toISOString() };
      }
      return n;
    }));
    if (wasUnread) setUnread(u => Math.max(0, u - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'x-privy-id': privyId },
      });
    } catch (err) {
      console.error('[useNotifications] markRead:', err.message);
      // Rollback via refetch para recuperar estado real
      fetchNotifs();
    }
  }, [privyId, fetchNotifs]);

  const markAllRead = useCallback(async () => {
    if (!privyId) return;
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    setUnread(0);
    try {
      await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'x-privy-id': privyId },
      });
    } catch (err) {
      console.error('[useNotifications] markAllRead:', err.message);
      fetchNotifs();
    }
  }, [privyId, fetchNotifs]);

  return { notifications, unread, loading, markRead, markAllRead, refetch: fetchNotifs };
}
