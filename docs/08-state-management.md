# Secure State Management Architecture

This document explains how **authenticated state** is handled throughout the application, including Zustand store architecture for authenticated users, React Context usage, and security considerations for client-side state.

## Security-Aware State Management Strategy

The application uses a hybrid approach with **security considerations**:

1. **React Context**: **Authenticated** user lifecycle and secure persistence coordination
2. **Zustand**: Modern, modular slices for **authenticated** real-time data (games, chat, socket connections)
3. **SessionStorage**: Temporary game session data (no sensitive information)
4. **LocalStorage**: User preferences and persistence flags (no sensitive tokens)

## 🔐 Security Considerations

### Token Storage Security
- **Access tokens**: Stored in React Context state (memory only, not persisted)
- **Refresh tokens**: Stored in secure httpOnly cookies (not accessible via JavaScript)
- **No tokens in localStorage**: Prevents XSS token theft

```typescript
// SECURE: Access token in memory only
const { state } = useAuth();
const accessToken = state.user?.accessToken; // Only in memory

// SECURE: Refresh token in httpOnly cookie (set by server)
// Client cannot access refresh token directly - prevents XSS attacks
```

### Authenticated State Pattern
All sensitive state operations require authentication:

```typescript
// All state updates verify user authentication
export interface UserSlice {
  user: AuthenticatedUser | null;           // Contains JWT info
  isAuthenticated: boolean;                 // Computed from user state
  isLocked: boolean;                       // Activity locks for authenticated users
  lockReason: string;
  
  // Actions require authenticated context
  setUser: (user: AuthenticatedUser | null) => void;
  setLocked: (locked: boolean, reason?: string) => void;
  logout: () => void;                      // Clears all user state
}
```

## Zustand Store Architecture

### Root Store Creation

```typescript
// client/store/createRootStore.ts
import { create } from 'zustand';
import { createUserSlice, UserSlice } from './slices/userSlice';
import { createChatSlice, ChatSlice } from './slices/chatSlice';
import { createSocketSlice, SocketSlice } from './slices/socketSlice';
import { createGameEventsSlice, GameEventsSlice } from './slices/gameEventsSlice';

export type RootStore = UserSlice & ChatSlice & SocketSlice & GameEventsSlice;

export const useStore = create<RootStore>()(
  (...a) => ({
    ...createUserSlice(...a),
    ...createChatSlice(...a),
    ...createSocketSlice(...a),
    ...createGameEventsSlice(...a),
  })
);
```

### Store Slice Pattern

Each slice follows a consistent pattern for modularity and type safety:

```typescript
// Slice interface defines the state and actions
export interface UserSlice {
  user: User | null;
  isLocked: boolean;
  lockReason: string;
  setUser: (user: User | null) => void;
  setLocked: (locked: boolean, reason?: string) => void;
}

// StateCreator provides type-safe slice creation
export const createUserSlice: StateCreator<UserSlice, [], [], UserSlice> = (set, get) => ({
  user: null,
  isLocked: false,
  lockReason: 'none',
  
  setUser: (user) => set({ user }),
  setLocked: (locked, reason = 'none') => set({ isLocked: locked, lockReason: reason }),
});
```

## Individual Store Slices

### User Slice (`userSlice.ts`)

Manages user authentication state and activity locks:

```typescript
export interface UserSlice {
  user: User | null;              // Current authenticated user
  isLocked: boolean;              // Activity lock status
  lockReason: string;             // Reason for lock (match, tournament, invite)
  setUser: (user: User | null) => void;
  setLocked: (locked: boolean, reason?: string) => void;
}

// Usage in components
const { user, isLocked, lockReason, setUser, setLocked } = useStore();

// Cross-slice interaction - triggers game events initialization
setUser: (user) => {
  set({ user });
  
  // Initialize game event listeners when user is set
  const state = get() as any;
  if (user && state.socket && !state.hasJoined) {
    state.ensureJoined();
  }
}
```

### Socket Slice (`socketSlice.ts`)

Manages WebSocket connection lifecycle:

```typescript
export interface SocketSlice {
  socket: Socket | null;          // Socket.IO connection
  isConnected: boolean;           // Connection status
  connect: (url: string) => void; // Establish connection
  disconnect: () => void;         // Close connection
}

// Connection management with cross-slice coordination
connect: (url) => {
  if (get().socket) return;
  
  const socket = io(url, {
    autoConnect: true,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    timeout: 10000,
    forceNew: true,
  });
  
  set({ socket });
  
  socket.on('connect', () => {
    set({ isConnected: true });
    
    // Auto-join user's personal room
    const state = get() as any;
    const userId = state.user?.id;
    if (userId && !state.hasJoined) {
      socket.emit('join', userId);
      state.setHasJoined(true);
    }
    
    // Initialize game event listeners
    if (typeof state.initializeGameEvents === 'function') {
      state.initializeGameEvents();
    }
  });
  
  socket.on('disconnect', () => set({ isConnected: false }));
}
```

### Chat Slice (`chatSlice.ts`)

Manages real-time messaging state:

```typescript
export interface ChatSlice {
  messages: Message[];                    // All loaded messages
  activeConversation: string | null;      // Current conversation user ID
  typingUsers: Set<string>;              // Users currently typing
  unreadCounts: Map<string, number>;     // Unread message counts per user
  
  addMessage: (message: Message) => void;
  setActiveConversation: (userId: string | null) => void;
  setTyping: (userId: string, isTyping: boolean) => void;
  markAsRead: (userId: string) => void;
  loadConversation: (userId: string) => void;
}

// Message handling with optimistic updates
addMessage: (message) => {
  set((state) => ({
    messages: [...state.messages, message].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }));
  
  // Update unread counts
  const state = get();
  if (message.sender_id !== state.user?.id) {
    const senderId = String(message.sender_id);
    const currentCount = state.unreadCounts.get(senderId) || 0;
    state.unreadCounts.set(senderId, currentCount + 1);
  }
}
```

### Game Events Slice (`gameEventsSlice.ts`)

Handles game-related socket events and navigation:

```typescript
export interface GameEventsSlice {
  hasJoined: boolean;                    // Has joined personal socket room
  onlineUsers: string[];                 // List of online user IDs
  setOnlineUsers: (users: string[]) => void;
  ensureJoined: () => void;              // Ensure joined personal room
  initializeGameEvents: () => void;       // Setup game event listeners
}

// Game event initialization
initializeGameEvents: () => {
  const state = get() as any;
  const socket = state.socket;
  const user = state.user;
  
  if (!socket || !user) return;
  
  // Local game events
  socket.on('room_joined', ({ roomId }) => {
    console.log('Joined local room', roomId);
  });
  
  // Remote game navigation
  socket.on('remote_room_joined', ({ roomId, playerId, matchType, p1Name, p2Name, p1Id, p2Id }) => {
    const gameInfo = {
      roomId,
      playerId,
      socketId: socket.id,
      matchType: matchType || 'remote',
      p1Name: p1Name || 'Player 1',
      p2Name: p2Name || 'Player 2',
      p1Id,
      p2Id,
      timestamp: Date.now()
    };
    
    // Store for navigation
    sessionStorage.setItem('remoteGameInfo', JSON.stringify(gameInfo));
    
    // Trigger navigation event
    window.dispatchEvent(new CustomEvent('navigateToRemote', { 
      detail: gameInfo 
    }));
  });
  
  // Activity lock events
  socket.on('user_locked', ({ reason, inMatch }) => {
    state.setLocked(true, reason);
  });
  
  socket.on('user_unlocked', () => {
    state.setLocked(false, 'none');
  });
}
```

## React Context Integration

### Authentication Context

Legacy React Context handles authentication lifecycle and persistence:

```typescript
// client/context/Context.tsx
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType {
  auth: AuthState;
  dispatch: React.Dispatch<AuthAction>;
  persist: boolean;
  setPersist: (persist: boolean) => void;
}

// Context bridges to Zustand for modern components
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [auth, dispatch] = useReducer(authReducer, initialState);
  const [persist, setPersist] = useState(() => {
    const stored = localStorage.getItem('persist');
    return stored === 'true';
  });
  
  // Sync auth state to Zustand store
  const setUser = useStore(state => state.setUser);
  
  useEffect(() => {
    setUser(auth.user);
  }, [auth.user, setUser]);
  
  // Persistence coordination
  useEffect(() => {
    localStorage.setItem('persist', persist.toString());
  }, [persist]);
  
  return (
    <AuthContext.Provider value={{ auth, dispatch, persist, setPersist }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Authentication Reducer

```typescript
// client/context/Reducer.ts
type AuthAction = 
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'LOGOUT' };

export const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false
      };
      
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      };
      
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false
      };
      
    default:
      return state;
  }
};
```

## Cross-Slice Communication Patterns

### State Synchronization

Slices coordinate through direct calls and shared state:

```typescript
// User slice triggers game events initialization
setUser: (user) => {
  set({ user });
  
  // Cross-slice coordination
  const state = get() as any;
  if (user && state.socket && !state.hasJoined) {
    state.ensureJoined(); // Calls gameEventsSlice method
  }
}

// Socket slice initializes game events when connected
socket.on('connect', () => {
  set({ isConnected: true });
  
  const state = get() as any;
  if (typeof state.initializeGameEvents === 'function') {
    state.initializeGameEvents(); // Calls gameEventsSlice method
  }
});
```

### Event-Driven Updates

Some coordination uses custom events for loose coupling:

```typescript
// Navigation events for game routing
window.dispatchEvent(new CustomEvent('navigateToRemote', { 
  detail: gameInfo 
}));

// Component listening for navigation
useEffect(() => {
  const handleNavigateToRemote = (event: CustomEvent) => {
    const gameInfo = event.detail;
    navigate('/remote-game', { state: gameInfo });
  };
  
  window.addEventListener('navigateToRemote', handleNavigateToRemote);
  
  return () => {
    window.removeEventListener('navigateToRemote', handleNavigateToRemote);
  };
}, [navigate]);
```

## Storage Strategies

### Session Storage

Temporary data that should survive page refreshes but not browser sessions:

```typescript
// Remote game session data
const gameInfo = {
  roomId,
  playerId, 
  socketId: socket.id,
  matchType,
  timestamp: Date.now()
};
sessionStorage.setItem('remoteGameInfo', JSON.stringify(gameInfo));

// Retrieve on page load
const storedGameInfo = sessionStorage.getItem('remoteGameInfo');
if (storedGameInfo) {
  const gameInfo = JSON.parse(storedGameInfo);
  // Validate and use game info
}
```

### Local Storage

Persistent user preferences:

```typescript
// Theme persistence
const theme = localStorage.getItem('theme') || 'dark';
localStorage.setItem('theme', newTheme);

// Auth persistence preference
const persistAuth = localStorage.getItem('persist') === 'true';
localStorage.setItem('persist', persist.toString());

// Remote theme selection
const remoteThemeId = localStorage.getItem('remoteThemeId') || 'pacman';
localStorage.setItem('remoteThemeId', themeId);
```

## Performance Considerations

### Selective Updates

Zustand allows selective subscriptions to avoid unnecessary re-renders:

```typescript
// Only subscribe to specific slice properties
const user = useStore(state => state.user);
const isLocked = useStore(state => state.isLocked);

// Avoid subscribing to entire store
const { user, isLocked } = useStore(); // ❌ Re-renders on any state change
```

### Computed Values

Use selectors for derived state:

```typescript
// Selector for derived state
const useUnreadCount = () => useStore(state => 
  Array.from(state.unreadCounts.values()).reduce((total, count) => total + count, 0)
);

// Usage in component
const totalUnread = useUnreadCount();
```

### Memory Management

Clean up subscriptions and event listeners:

```typescript
useEffect(() => {
  if (!socket) return;
  
  const handleMessage = (message: Message) => {
    addMessage(message);
  };
  
  socket.on('receive_message', handleMessage);
  
  return () => {
    socket.off('receive_message', handleMessage);
  };
}, [socket, addMessage]);
```

## Testing State Management

### Mock Store for Tests

```typescript
// Test utility for mocking Zustand store
import { create } from 'zustand';

export const createMockStore = (initialState: Partial<RootStore> = {}) =>
  create<RootStore>()(() => ({
    // Default state
    user: null,
    isLocked: false,
    messages: [],
    socket: null,
    isConnected: false,
    
    // Override with test-specific state
    ...initialState,
    
    // Mock actions
    setUser: jest.fn(),
    setLocked: jest.fn(),
    addMessage: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  }));
```

### Integration Testing

```typescript
// Test cross-slice interactions
test('user login triggers game events initialization', () => {
  const mockSocket = { emit: jest.fn() };
  const store = createMockStore({
    socket: mockSocket as any,
    isConnected: true,
    hasJoined: false
  });
  
  // Simulate user login
  store.getState().setUser({ id: 1, username: 'test' });
  
  // Verify game events were initialized
  expect(mockSocket.emit).toHaveBeenCalledWith('join', 1);
});
```

This hybrid state management approach provides the benefits of both modern Zustand patterns for high-frequency updates and traditional React Context for authentication lifecycle management, while maintaining clear separation of concerns and type safety throughout the application.
