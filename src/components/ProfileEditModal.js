'use client';
import { useState, useEffect, useRef } from 'react';
import CreatureAvatar from './CreatureAvatar';
import { useApi } from '@/lib/api';

// ============================================
// ProfileEditModal
// Modal para editar username (con cooldown 30d) + avatar (criatura propia).
// PATCH /api/player/profile.
// ============================================

const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_REGEX = /^[A-Za-z0-9_-]+$/;
const COOLDOWN_DAYS = 30;

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};
const RARITY_ORDER = ['Unica', 'Legendaria', 'Epica', 'Rara', 'Poco Comun', 'Comun'];

function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

export default function ProfileEditModal({ player, creatures = [], open, onClose, onSaved }) {
  const api = useApi();
  const [username, setUsername] = useState('');
  const [selectedAvatarId, setSelectedAvatarId] = useState(null);
  const [usernameStatus, setUsernameStatus] = useState({ checking: false, available: null, reason: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  // Sync con valores actuales del player cuando se abre
  useEffect(() => {
    if (open) {
      setUsername(player?.username || '');
      setSelectedAvatarId(player?.avatar_creature_id || null);
      setUsernameStatus({ checking: false, available: null, reason: null });
      setError(null);
    }
  }, [open, player]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Debounced username availability check
  useEffect(() => {
    if (!open) return;
    if (!username || username === player?.username) {
      setUsernameStatus({ checking: false, available: null, reason: null });
      return;
    }
    // Validación local rápida (mismo regex que server)
    if (username.length < USERNAME_MIN) {
      setUsernameStatus({ checking: false, available: false, reason: `Mínimo ${USERNAME_MIN} caracteres` });
      return;
    }
    if (username.length > USERNAME_MAX) {
      setUsernameStatus({ checking: false, available: false, reason: `Máximo ${USERNAME_MAX} caracteres` });
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus({ checking: false, available: false, reason: 'Solo letras, números, _ y -' });
      return;
    }

    setUsernameStatus({ checking: true, available: null, reason: null });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api(`/api/player/username-check?value=${encodeURIComponent(username)}`);
        const data = await res.json();
        if (!res.ok) {
          setUsernameStatus({ checking: false, available: false, reason: data.error || 'Error' });
          return;
        }
        setUsernameStatus({ checking: false, available: !!data.available, reason: data.reason || null });
      } catch (err) {
        setUsernameStatus({ checking: false, available: false, reason: 'Error de red' });
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, open, player?.username, api]);

  if (!open) return null;

  const sortedCreatures = [...creatures].sort((a, b) => {
    const aIdx = RARITY_ORDER.indexOf(a.rarity);
    const bIdx = RARITY_ORDER.indexOf(b.rarity);
    return aIdx - bIdx;
  });

  // Estado del cooldown
  const days = daysSince(player?.username_changed_at);
  const inCooldown = days < COOLDOWN_DAYS;
  const daysLeft = inCooldown ? Math.ceil(COOLDOWN_DAYS - days) : 0;
  const usernameChangedFromOriginal = username !== (player?.username || '');
  const sameAsCurrent = !usernameChangedFromOriginal;

  const canSave = (() => {
    if (saving) return false;
    // Si el username cambió, verificamos su validez y cooldown
    if (usernameChangedFromOriginal) {
      if (inCooldown) return false;
      if (usernameStatus.checking) return false;
      if (usernameStatus.available !== true) return false;
    }
    // Si solo cambió avatar, OK siempre que sea distinto
    return true;
  })();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {};
      if (usernameChangedFromOriginal) payload.username = username.trim();
      if (selectedAvatarId !== (player?.avatar_creature_id ?? null)) {
        payload.avatar_creature_id = selectedAvatarId;
      }
      if (Object.keys(payload).length === 0) {
        onClose?.();
        setSaving(false);
        return;
      }
      const res = await api('/api/player/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error guardando perfil');
        setSaving(false);
        return;
      }
      onSaved?.(data.player);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Error de red');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl"
        style={{
          background: '#0c0c23',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-[#0c0c23] z-10">
          <h3 className="text-[16px] font-extrabold text-white">Editar perfil</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition text-[20px] leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Username */}
          <div>
            <label className="block text-[11px] uppercase tracking-[1.5px] text-purple-300 font-bold mb-2">
              Nombre de entrenador
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.slice(0, USERNAME_MAX))}
              placeholder="3-20 caracteres, letras/números/_-"
              maxLength={USERNAME_MAX}
              disabled={inCooldown && !sameAsCurrent}
              className="w-full px-3 py-2 text-[14px] text-white bg-white/[0.04] border rounded-lg focus:outline-none focus:border-purple-500/50"
              style={{
                borderColor:
                  usernameChangedFromOriginal && usernameStatus.available === false ? 'rgba(239,68,68,0.4)'
                  : usernameChangedFromOriginal && usernameStatus.available === true ? 'rgba(34,197,94,0.4)'
                  : 'rgba(255,255,255,0.08)',
              }}
            />

            {/* Estado del username */}
            <div className="mt-2 min-h-[18px] text-[11px]">
              {inCooldown && !sameAsCurrent ? (
                <span className="text-orange-400">
                  ⏳ Solo puedes cambiar de nombre 1 vez cada {COOLDOWN_DAYS} días. Faltan {daysLeft}.
                </span>
              ) : usernameChangedFromOriginal && usernameStatus.checking ? (
                <span className="text-gray-500">Comprobando disponibilidad...</span>
              ) : usernameChangedFromOriginal && usernameStatus.available === true ? (
                <span className="text-green-400">✓ Disponible</span>
              ) : usernameChangedFromOriginal && usernameStatus.available === false ? (
                <span className="text-red-400">✗ {usernameStatus.reason}</span>
              ) : !usernameChangedFromOriginal && player?.username_changed_at ? (
                <span className="text-gray-500">
                  Último cambio: hace {Math.floor(days)} día{Math.floor(days) === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>

          {/* Avatar picker */}
          <div>
            <label className="block text-[11px] uppercase tracking-[1.5px] text-purple-300 font-bold mb-2">
              Avatar (elige una de tus criaturas)
            </label>
            {creatures.length === 0 ? (
              <p className="text-gray-500 text-[13px] py-4 text-center">
                No tienes criaturas para elegir como avatar.
              </p>
            ) : (
              <>
                {/* Default option */}
                <button
                  onClick={() => setSelectedAvatarId(null)}
                  className="w-full mb-3 px-3 py-2 rounded-lg text-[12px] flex items-center gap-2 transition"
                  style={{
                    background: selectedAvatarId === null ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedAvatarId === null ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <span className="text-[18px]">🚫</span>
                  <span className={selectedAvatarId === null ? 'text-purple-300 font-bold' : 'text-gray-400'}>
                    Sin avatar (usar default)
                  </span>
                </button>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto p-1">
                  {sortedCreatures.map(c => {
                    const isSelected = selectedAvatarId === c.id;
                    const color = RARITY_COLORS[c.rarity] || '#9ca3af';
                    return (
                      <button
                        key={c.id}
                        onClick={() => setSelectedAvatarId(c.id)}
                        className="rounded-lg p-2 flex flex-col items-center transition"
                        style={{
                          background: isSelected ? `${color}20` : 'rgba(255,255,255,0.02)',
                          border: `2px solid ${isSelected ? color : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        <CreatureAvatar
                          name={c.name}
                          types={c.types}
                          rarity={c.rarity}
                          size={64}
                        />
                        <p className="text-[11px] font-bold text-white mt-1 truncate w-full text-center">
                          {c.is_favorite && '⭐ '}{c.name}
                        </p>
                        <p className="text-[9px]" style={{ color }}>{c.rarity}</p>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[12px]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex justify-end gap-3 px-5 py-4 border-t border-white/[0.06] bg-[#0c0c23]">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-[13px] font-bold text-gray-400 hover:text-white transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2 rounded-lg text-[13px] font-bold text-white bg-purple-500 hover:bg-purple-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
