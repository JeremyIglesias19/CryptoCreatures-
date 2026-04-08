'use client';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { login, authenticated, user } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (authenticated) router.push('/game');
  }, [authenticated, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Logo / Title */}
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-yellow-400 bg-clip-text text-transparent mb-4">
          CryptoCreatures
        </h1>
        <p className="text-gray-400 text-lg">
          Colecciona, combate y domina en Solana
        </p>
      </div>

      {/* Login Card */}
      <div className="bg-dark-800/80 backdrop-blur-xl border border-purple-500/20 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-4xl">
            🥚
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Bienvenido</h2>
          <p className="text-gray-400 text-sm">
            Entra con tu cuenta de Google para empezar tu aventura.
            Se te creara una wallet de Solana automaticamente.
          </p>
        </div>

        <button
          onClick={login}
          className="btn-primary w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-3"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Entrar con Google
        </button>

        <div className="mt-6 text-xs text-gray-500">
          Al entrar aceptas los terminos del juego.
          Tu wallet de Solana se crea automaticamente.
        </div>
      </div>

      {/* Features */}
      <div className="mt-12 grid grid-cols-3 gap-6 max-w-2xl">
        <div className="text-center">
          <div className="text-3xl mb-2">🥚</div>
          <h3 className="font-bold text-sm">Abre Huevos</h3>
          <p className="text-xs text-gray-500">43 criaturas con 6 rarezas</p>
        </div>
        <div className="text-center">
          <div className="text-3xl mb-2">⚔️</div>
          <h3 className="font-bold text-sm">PvP en Tiempo Real</h3>
          <p className="text-xs text-gray-500">Combates 3v3 con ranking ELO</p>
        </div>
        <div className="text-center">
          <div className="text-3xl mb-2">💎</div>
          <h3 className="font-bold text-sm">NFTs en Solana</h3>
          <p className="text-xs text-gray-500">Tus criaturas son tuyas</p>
        </div>
      </div>
    </div>
  );
}
