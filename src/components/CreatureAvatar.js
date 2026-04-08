'use client';

// ============================================
// Avatar de criatura usando los sprites reales
// ============================================

const RARITY_FOLDERS = {
  'Comun': 'comun',
  'Poco Comun': 'poco_comun',
  'Rara': 'rara',
  'Epica': 'epica',
  'Legendaria': 'legendaria',
  'Unica': 'unica',
};

const RARITY_GLOWS = {
  'Comun': '',
  'Poco Comun': '0 0 12px rgba(34,197,94,0.3)',
  'Rara': '0 0 16px rgba(59,130,246,0.4)',
  'Epica': '0 0 22px rgba(168,85,247,0.5)',
  'Legendaria': '0 0 28px rgba(234,179,8,0.5)',
  'Unica': '0 0 35px rgba(239,68,68,0.6)',
};

export default function CreatureAvatar({ name, types, rarity, size = 120 }) {
  const folder = RARITY_FOLDERS[rarity] || 'comun';
  const src = `/sprites/${folder}/${name}.png`;
  const glow = RARITY_GLOWS[rarity] || '';

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        style={{
          objectFit: 'contain',
          borderRadius: 12,
          boxShadow: glow,
          imageRendering: 'auto',
        }}
        onError={(e) => {
          // Fallback: si no encuentra la imagen, muestra emoji del tipo
          e.target.style.display = 'none';
          e.target.parentElement.innerHTML = `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${size*0.4}px;background:rgba(255,255,255,0.05);border-radius:12px;">${
            types?.[0] === 'Fuego' ? '🔥' : types?.[0] === 'Agua' ? '💧' : types?.[0] === 'Naturaleza' ? '🌿' :
            types?.[0] === 'Rayo' ? '⚡' : types?.[0] === 'Tierra' ? '🌍' : '❄️'
          }</div>`;
        }}
      />
    </div>
  );
}
