'use client';
import { useState, useEffect } from 'react';
import CreatureAvatar from './CreatureAvatar';

const RARITY_COLORS = {
  'Comun': '#9ca3af', 'Poco Comun': '#22c55e', 'Rara': '#3b82f6',
  'Epica': '#a855f7', 'Legendaria': '#eab308', 'Unica': '#ef4444',
};

export default function Matchmaking({ selectedTeam, creatures, emit, on, connected, socketReady }) {
  const [searching, setSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);

  useEffect(() => {
    if (!searching) return;
    const timer = setInterval(() => setSearchTime(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [searching]);

  useEffect(() => {
    if (!on || !socketReady) return;
    const unsub = on('matchmaking:cancelled', () => { setSearching(false); setSearchTime(0); });
    return () => unsub?.();
  }, [on, socketReady]);

  const startSearch = () => {
    if (selectedTeam.length !== 3) return;
    emit('matchmaking:join', { teamIds: selectedTeam });
    setSearching(true);
    setSearchTime(0);
  };

  const cancelSearch = () => {
    emit('matchmaking:cancel');
    setSearching(false);
    setSearchTime(0);
  };

  const teamCreatures = selectedTeam.map(id => creatures.find(c => c.id === id)).filter(Boolean);

  return (
    <div className="max-w-2xl mx-auto text-center py-8">
      <h2 className="text-[30px] font-extrabold tracking-tight mb-2">Combate PvP</h2>
      <p className="text-gray-500 text-sm mb-8">Combates 3v3 en tiempo real contra otros jugadores</p>

      {/* Connection status */}
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium mb-8 ${
        connected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
        {connected ? 'Conectado al servidor PvP' : 'Conectando al servidor...'}
      </div>

      {/* Selected team */}
      {teamCreatures.length > 0 ? (
        <div className="bg-[#0a0a20]/60 border border-purple-500/15 rounded-2xl p-6 mb-8">
          <h3 className="text-[12px] uppercase tracking-wider text-gray-500 mb-4">Tu Equipo</h3>
          <div className="flex justify-center gap-6">
            {teamCreatures.map(c => {
              const types = Array.isArray(c.types) ? c.types : [c.types];
              const rarColor = RARITY_COLORS[c.rarity] || '#8b5cf6';
              return (
                <div key={c.id} className="text-center">
                  <div className="flex justify-center mb-2">
                    <CreatureAvatar name={c.name} types={types} rarity={c.rarity} size={80} />
                  </div>
                  <p className="text-[13px] font-bold text-white">{c.name}</p>
                  <span className="inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mt-0.5"
                    style={{ background: rarColor + '22', color: rarColor }}>{c.rarity}</span>
                  <div className="flex justify-center gap-3 mt-1.5 text-[10px] text-gray-500">
                    <span>HP {c.hp}</span>
                    <span>ATK {c.atk}</span>
                    <span>SPD {c.spd}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-[#0a0a20]/30 border border-dashed border-gray-700 rounded-2xl p-10 mb-8 text-gray-500">
          <p className="text-[14px]">Selecciona 3 criaturas en tu <strong className="text-purple-400">Coleccion</strong> para formar tu equipo</p>
          <p className="text-[11px] text-gray-600 mt-2">Haz click en las criaturas para seleccionarlas</p>
        </div>
      )}

      {/* Search button / searching state */}
      {searching ? (
        <div>
          <div className="mb-5">
            <div className="w-20 h-20 mx-auto border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
          <p className="text-purple-400 font-extrabold text-[18px] mb-1">Buscando oponente...</p>
          <p className="text-gray-500 text-[13px] mb-1 font-mono">
            {Math.floor(searchTime / 60)}:{(searchTime % 60).toString().padStart(2, '0')}
          </p>
          <p className="text-[11px] text-gray-600 mb-6">El rango de ELO se expande con el tiempo</p>
          <button onClick={cancelSearch}
            className="px-8 py-3 rounded-xl border border-red-500/30 text-red-400 font-bold text-[13px] hover:bg-red-500/10 transition-all">
            Cancelar busqueda
          </button>
        </div>
      ) : (
        <button onClick={startSearch}
          disabled={selectedTeam.length !== 3 || !connected}
          className="px-12 py-4 rounded-xl text-[16px] font-extrabold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.03] hover:brightness-110"
          style={{
            background: selectedTeam.length === 3 && connected ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#333',
            boxShadow: selectedTeam.length === 3 && connected ? '0 4px 25px rgba(239,68,68,0.35)' : 'none',
          }}>
          {selectedTeam.length !== 3 ? `Selecciona ${3 - selectedTeam.length} criatura${3 - selectedTeam.length > 1 ? 's' : ''} mas` :
           !connected ? 'Conectando al servidor...' : '⚔️ Buscar Oponente'}
        </button>
      )}
    </div>
  );
}
