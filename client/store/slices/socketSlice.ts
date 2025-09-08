import { StateCreator } from 'zustand';
import { io, Socket } from 'socket.io-client';

export interface SocketSlice { 
  socket: Socket | null; 
  isConnected: boolean; 
  connect: (url: string, auth?: { accessToken?: string }) => void; 
  disconnect: () => void; 
}

export const createSocketSlice: StateCreator<SocketSlice, [], [], SocketSlice> = (set, get) => ({
  socket: null,
  isConnected: false,
  connect: (url, auth) => {
    const existingSocket = get().socket;
    if (existingSocket) {
      console.log('🔌 Socket already exists, disconnecting first');
      existingSocket.disconnect();
    }
    
    console.log('🔌 Attempting to connect with auth:', auth ? 'Yes' : 'No');
    
    const socketOptions: any = {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket','polling'],
  timeout: 12000,
  forceNew: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
    };

    // Add authentication if provided
    if (auth?.accessToken) {
      console.log('🔌 Adding access token to socket connection');
      socketOptions.auth = {
        accessToken: auth.accessToken
      };
    } else {
      console.warn('🔌 No access token provided for socket connection');
    }

    console.log('🔌 Connecting to:', url);
  const socket = io(url, socketOptions);
    set({ socket });
  // Only connect after setup so all handlers are attached
  socket.connect();
    
    socket.on('connect', () => {
      console.log('🔌 Socket connected successfully with ID:', socket.id);
      set({ isConnected: true });
  // Emit a small debug ping so we can confirm identity server-side
  try { socket.emit('debug_ping', { t: Date.now() }); } catch {}
      
      // Attempt auto-join if user already present
      const state: any = get();
      const userId = state.user?.id;
      if (userId && !state.hasJoined) {
        console.debug('[socketSlice] Auto-emit join on connect for user', userId);
        try { 
          socket.emit('join', userId); 
          (set as any)({ hasJoined: true }); 
        } catch (e) { 
          console.warn('join emit failed', e); 
        }
      }
      
      try {
        if (typeof state.initializeGameEvents === 'function') {
          console.debug('[socketSlice] Initializing game event listeners');
          state.initializeGameEvents();
        } else {
          console.warn('[socketSlice] initializeGameEvents not available on state');
        }
      } catch (e) {
        console.warn('[socketSlice] initializeGameEvents failed', e);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      set({ isConnected: false });
    });

    // Handle authentication errors
    socket.on('connect_error', (error) => {
      console.error('🚫 Socket connection failed:', error.message);
      if (error.message === 'Authentication required' || 
          error.message === 'Invalid token' || 
          error.message === 'Token expired') {
        // Handle authentication failure
        console.log('❌ Authentication failed, user needs to login again');
        // Could dispatch a logout action here
      }
    });
  },
  disconnect: () => {
    const s = get().socket;
    try { s?.disconnect(); } catch {}
    set({ socket: null, isConnected: false });
  },
});
