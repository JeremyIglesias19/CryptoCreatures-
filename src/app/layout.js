'use client';
import './globals.css';
import { PrivyProvider } from '@privy-io/react-auth';

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-dark-900 text-white min-h-screen">
        <PrivyProvider
          appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'placeholder'}
          config={{
            loginMethods: ['google', 'email'],
            appearance: {
              theme: 'dark',
              accentColor: '#8b5cf6',
            },
            embeddedWallets: {
              ethereum: {
                createOnLogin: 'users-without-wallets',
              },
              solana: {
                createOnLogin: 'all-users',
              },
            },
          }}
        >
          {children}
        </PrivyProvider>
      </body>
    </html>
  );
}
