'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useApi } from '@/lib/api';
import ProfileView from '@/components/ProfileView';

// ============================================
// /profile/[username]
// Página pública del perfil. Requiere auth (cualquier usuario logeado).
// Si el username no existe → 404 visual.
// ============================================

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { authenticated, ready, user } = usePrivy();
  const api = useApi();
  const username = params?.username;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      // Redirigir a landing — no se puede ver perfiles sin login
      router.replace('/');
      return;
    }
    if (!username) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api(`/api/profile/${encodeURIComponent(username)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error || 'Error');
          setData(null);
        } else {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, authenticated, username, api, router]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-purple-400 animate-pulse">Cargando perfil...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="text-6xl mb-4 opacity-40">🔍</div>
        <h1 className="text-[20px] font-bold text-white mb-2">Perfil no encontrado</h1>
        <p className="text-gray-500 text-[13px] mb-6">{error}</p>
        <button
          onClick={() => router.push('/game')}
          className="px-4 py-2 rounded-lg text-[12px] font-bold bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 transition"
        >
          Volver al juego
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Detectar si es el propio perfil del usuario logeado
  const isOwn = user?.id && data.profile?.id != null && (
    // Comparamos por username case-insensitive: el privy_id del cliente no es authoritative,
    // pero a efectos UI es suficiente. Si miente, igual no puede editar (PATCH valida server-side).
    data.profile.username?.toLowerCase() === username?.toLowerCase() && user?.email
  );

  return (
    <div className="min-h-screen" style={{ background: '#0a0a20' }}>
      {/* Header con back button */}
      <div className="border-b border-white/[0.06] bg-[#0c0c23]/50 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white transition text-[14px]"
          >
            ← Volver
          </button>
          <span className="text-gray-600 text-[12px]">/ Perfil</span>
        </div>
      </div>

      <ProfileView
        profile={data.profile}
        topCreatures={data.top_creatures}
        isOwn={false} /* Editar va desde /game con su propio modal */
      />
    </div>
  );
}
