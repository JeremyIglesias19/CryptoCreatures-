'use client';
import { useState } from 'react';

// Barra de equipos guardados:
//  - Chips clicables para cargar un preset
//  - Botón × para borrar
//  - Input + botón para guardar el equipo actual (si hay 3 seleccionados)

export default function TeamPresetsBar({ presets, selectedTeam, creatures, onLoad, onSave, onDelete }) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  const canSave = selectedTeam.length === 3 && newName.trim().length > 0;

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!canSave || saving) return;
    setSaving(true);
    setLocalError('');
    const result = await onSave(newName.trim(), selectedTeam);
    setSaving(false);
    if (result?.error) {
      setLocalError(result.error);
    } else {
      setNewName('');
    }
  };

  // Validar que todas las criaturas del preset todavía existen (pueden haberse vendido)
  const isPresetValid = (preset) => {
    const ids = Array.isArray(preset.creature_ids) ? preset.creature_ids : [];
    return ids.every(id => creatures.some(c => c.id === id));
  };

  return (
    <div className="bg-[#0d0d28] border border-white/[0.07] rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] uppercase tracking-[2px] text-gray-500 font-medium">
          Equipos guardados
        </h3>
        <span className="text-[10px] text-gray-600 font-mono">{presets.length}/10</span>
      </div>

      {presets.length === 0 && (
        <p className="text-[12px] text-gray-600 italic mb-3">
          Aún no tienes equipos guardados. Selecciona 3 criaturas y guárdalas con un nombre.
        </p>
      )}

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map(p => {
            const valid = isPresetValid(p);
            return (
              <div key={p.id}
                className="flex items-center gap-1 rounded-xl border transition-all"
                style={{
                  background: valid ? 'rgba(139,92,246,0.1)' : 'rgba(239,68,68,0.05)',
                  borderColor: valid ? 'rgba(139,92,246,0.3)' : 'rgba(239,68,68,0.2)',
                }}>
                <button
                  onClick={() => valid && onLoad(p)}
                  disabled={!valid}
                  className="px-3 py-1.5 text-[12px] font-medium"
                  style={{
                    color: valid ? '#c084fc' : '#f87171',
                    cursor: valid ? 'pointer' : 'not-allowed',
                  }}
                  title={valid ? `Cargar equipo "${p.name}"` : 'Este equipo incluye criaturas que ya no tienes'}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`¿Borrar el equipo "${p.name}"?`)) onDelete(p.id);
                  }}
                  className="px-2 py-1.5 text-[11px] text-gray-500 hover:text-red-400"
                  aria-label={`Borrar equipo ${p.name}`}
                  title="Borrar"
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Form para guardar el equipo actual */}
      {presets.length < 10 && (
        <form onSubmit={handleSave} className="flex items-center gap-2">
          <input
            type="text"
            maxLength={32}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={selectedTeam.length === 3 ? 'Nombre del equipo...' : 'Selecciona 3 criaturas primero'}
            disabled={selectedTeam.length !== 3}
            className="flex-1 min-w-0 bg-[#12122a] border border-[#1a1a3e] rounded-xl px-3 py-2 text-[12px] text-gray-300 outline-none focus:border-purple-500/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}
          >
            {saving ? 'Guardando...' : 'Guardar equipo'}
          </button>
        </form>
      )}
      {localError && (
        <p className="text-[11px] text-red-400 mt-2">{localError}</p>
      )}
    </div>
  );
}
