'use client';
import { useState, useRef, useEffect } from 'react';

// ============================================
// NotificationBell
// Campana en la navbar con contador de no leídas y dropdown de 20 notifs.
// Se cierra al click fuera y al Escape.
// ============================================

const TYPE_META = {
  marketplace_sold: { icon: '💰', color: '#22c55e', label: 'Venta' },
  tier_up:          { icon: '🏆', color: '#fbbf24', label: 'Subida de tier' },
  record:           { icon: '⭐', color: '#a855f7', label: 'Récord' },
  system:           { icon: 'ℹ', color: '#8b5cf6', label: 'Sistema' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  if (s < 604800) return `hace ${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export default function NotificationBell({ notifications = [], unread = 0, markRead, markAllRead }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Cerrar dropdown al click fuera o Escape
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasUnread = notifications.some(n => !n.read_at);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] transition-all"
        aria-label={`Notificaciones${unread > 0 ? ` (${unread} sin leer)` : ''}`}
        aria-expanded={open}
      >
        <span className="text-[15px]">🔔</span>
        {unread > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold flex items-center justify-center text-white"
            style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.55)' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[360px] max-h-[480px] overflow-y-auto bg-[#0c0c23] border border-white/10 rounded-2xl z-[60]"
          style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between p-3 border-b border-white/[0.06] bg-[#0c0c23] z-10">
            <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-purple-300">
              Notificaciones
            </span>
            {hasUnread && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-gray-500 hover:text-purple-300 transition-colors"
              >
                Marcar todas leídas
              </button>
            )}
          </div>

          {/* Lista o vacío */}
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2 opacity-40">🔔</div>
              <p className="text-[12px] text-gray-500">Sin notificaciones por ahora.</p>
            </div>
          ) : (
            <div>
              {notifications.map(n => {
                const meta = TYPE_META[n.type] || TYPE_META.system;
                const isUnread = !n.read_at;
                return (
                  <button
                    key={n.id}
                    onClick={() => { if (isUnread) markRead(n.id); }}
                    className="w-full text-left p-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors flex items-start gap-3"
                    style={{ background: isUnread ? 'rgba(168,85,247,0.06)' : 'transparent' }}
                  >
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[14px]"
                      style={{
                        background: `${meta.color}18`,
                        border: `1px solid ${meta.color}30`,
                      }}
                    >
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold text-white truncate">{n.title}</p>
                      {n.body && (
                        <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5 leading-snug">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-600 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {isUnread && (
                      <span
                        className="flex-shrink-0 w-2 h-2 rounded-full mt-2"
                        style={{ background: '#a855f7' }}
                        aria-label="No leída"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
