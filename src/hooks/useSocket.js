'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { usePrivy } from '@privy-io/react-auth';

export function useSocket() {
  const { user, authenticated } = usePrivy();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [authed, setAuthed] = useState(false);
  // Incrementing counter so consumers can re-run effects when socket changes
  const [socketReady, setSocketReady] = useState(0);

  useEffect(() => {
    if (!authenticated || !user) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[useSocket] connected, id:', socket.id);
      setConnected(true);
      socket.emit('auth', { privyId: user.id });
    });

    socket.on('auth:success', () => {
      console.log('[useSocket] auth success');
      setAuthed(true);
      setSocketReady(prev => prev + 1); // signal to re-register listeners
    });

    socket.on('disconnect', () => {
      console.log('[useSocket] disconnected');
      setConnected(false);
      setAuthed(false);
    });

    socketRef.current = socket;
    // Signal that a new socket was created
    setSocketReady(prev => prev + 1);

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authenticated, user]);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    const sock = socketRef.current;
    if (!sock) return () => {};
    sock.on(event, handler);
    return () => sock.off(event, handler);
  }, []);

  return { socket: socketRef.current, connected, authed, emit, on, socketReady };
}
