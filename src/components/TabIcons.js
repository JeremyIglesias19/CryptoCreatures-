// Custom SVG icons for game navigation tabs
// Each icon is 18x18 and designed to match the game's dark/purple aesthetic

export function CollectionIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Dragon/creature head */}
      <path d="M12 2C8 2 5 5.5 5 9c0 2 .8 3.8 2 5l5 7 5-7c1.2-1.2 2-3 2-5 0-3.5-3-7-7-7z"
        fill={`${color}22`} stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="9.5" cy="9" r="1.2" fill={color}/>
      <circle cx="14.5" cy="9" r="1.2" fill={color}/>
      <path d="M9 12.5c0 0 1.5 1.5 3 1.5s3-1.5 3-1.5" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5 6L3 3M19 6l2-3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function EggsIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Egg with crack */}
      <path d="M12 3C8 3 5 8.5 5 14c0 3.5 3 7 7 7s7-3.5 7-7C19 8.5 16 3 12 3z"
        fill={`${color}22`} stroke={color} strokeWidth="1.5"/>
      {/* Crack pattern */}
      <path d="M10 8l2 3-1.5 1 2 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sparkle */}
      <circle cx="15" cy="7" r="0.8" fill={color} opacity="0.6"/>
      <circle cx="16.5" cy="9" r="0.5" fill={color} opacity="0.4"/>
    </svg>
  );
}

export function MarketIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Store/market stall */}
      <path d="M3 10V20a1 1 0 001 1h16a1 1 0 001-1V10" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M1 10l3-7h16l3 7" fill={`${color}22`} stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Awning scallops */}
      <path d="M1 10c0 1.5 1.5 2.5 3 2.5S7 11.5 7 10c0 1.5 1.5 2.5 3 2.5S13 11.5 13 10c0 1.5 1 2.5 2.5 2.5S18 11.5 18 10c0 1.5 1 2.5 2.5 2.5S23 11.5 23 10"
        stroke={color} strokeWidth="1.2"/>
      {/* SOL coin */}
      <circle cx="12" cy="16.5" r="2.5" fill={`${color}33`} stroke={color} strokeWidth="1"/>
      <text x="12" y="17.5" textAnchor="middle" fill={color} fontSize="4" fontWeight="bold">S</text>
    </svg>
  );
}

export function BestiaryIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Open book */}
      <path d="M2 4c2-1 4-1 6 0s4 1 4 1v15s-2-1-4-1-4 0-6 1V4z"
        fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M12 5c2-1 4-1 6 0s4 1 4 1v15s-2-1-4-1-4 0-6 1V5z"
        fill={`${color}18`} stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Text lines */}
      <line x1="5" y1="8" x2="9" y2="8" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      <line x1="5" y1="10.5" x2="8" y2="10.5" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      <line x1="5" y1="13" x2="9" y2="13" stroke={color} strokeWidth="0.8" opacity="0.5"/>
      {/* Star on right page */}
      <path d="M17 9l.7 1.5 1.6.2-1.1 1.1.3 1.6L17 12.8l-1.5.6.3-1.6-1.1-1.1 1.6-.2z"
        fill={color} opacity="0.5"/>
    </svg>
  );
}

export function BattleIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Crossed swords */}
      <path d="M5 19L18 4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M19 19L6 4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      {/* Sword guards */}
      <path d="M16 6l3-1-1 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 6L5 5l1 3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sword pommels */}
      <circle cx="4.5" cy="19.5" r="1.2" fill={`${color}44`} stroke={color} strokeWidth="1"/>
      <circle cx="19.5" cy="19.5" r="1.2" fill={`${color}44`} stroke={color} strokeWidth="1"/>
      {/* Impact spark */}
      <circle cx="12" cy="12" r="2" fill={`${color}33`}/>
      <circle cx="12" cy="12" r="0.8" fill={color}/>
    </svg>
  );
}

export function HistoryIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Scroll */}
      <path d="M6 3h12a2 2 0 012 2v1H8a2 2 0 00-2 2v11a2 2 0 01-2-2V5a2 2 0 012-2z"
        fill={`${color}22`} stroke={color} strokeWidth="1.5"/>
      <path d="M8 7h12a2 2 0 012 2v10a2 2 0 01-2 2H10a2 2 0 01-2-2V7z"
        fill={`${color}11`} stroke={color} strokeWidth="1.5"/>
      {/* Lines */}
      <line x1="11" y1="11" x2="19" y2="11" stroke={color} strokeWidth="1" opacity="0.5"/>
      <line x1="11" y1="14" x2="17" y2="14" stroke={color} strokeWidth="1" opacity="0.5"/>
      <line x1="11" y1="17" x2="18" y2="17" stroke={color} strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}

export function RankingIcon({ active }) {
  const color = active ? '#c084fc' : '#6666aa';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Trophy */}
      <path d="M8 2h8v8c0 2.2-1.8 4-4 4s-4-1.8-4-4V2z"
        fill={`${color}22`} stroke={color} strokeWidth="1.5"/>
      {/* Handles */}
      <path d="M8 4H5a2 2 0 00-2 2v1a3 3 0 003 3h2" stroke={color} strokeWidth="1.5"/>
      <path d="M16 4h3a2 2 0 012 2v1a3 3 0 01-3 3h-2" stroke={color} strokeWidth="1.5"/>
      {/* Base */}
      <path d="M10 14v2h4v-2" stroke={color} strokeWidth="1.5"/>
      <path d="M7 19h10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 16v3M15 16v3" stroke={color} strokeWidth="1.5"/>
      {/* Star */}
      <path d="M12 5.5l.8 1.6 1.7.3-1.2 1.2.3 1.7L12 9.5l-1.6.8.3-1.7-1.2-1.2 1.7-.3z"
        fill={color} opacity="0.6"/>
    </svg>
  );
}
