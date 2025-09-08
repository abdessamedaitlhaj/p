# Game Backend Architecture

This document explains how the game works on the backend, including socket room management, game loop mechanics, state broadcasting, frontend rendering, caching, and interpolation systems.

## Overview

The Pong platform uses a **secure, authoritative server architecture** where game physics and state are calculated on the backend at 60 FPS and streamed to authenticated clients. The system supports both local (same-device) and remote (multiplayer) games with different room management strategies.

## 🔐 Security Architecture

### Socket Authentication
All socket connections now require **JWT authentication** via the `socketAuth` middleware:

```typescript
// All namespaces require authentication
chatNamespace.use(socketAuthMiddleware);
gameNamespace.use(socketAuthMiddleware);
lobbyNamespace.use(socketAuthMiddleware);
tournamentNamespace.use(socketAuthMiddleware);
```

### Namespace Isolation
The system uses **separate namespaces** for different functionalities:
- `/chat` - Chat-related events only
- `/game` - Game physics and state updates
- `/lobby` - Matchmaking and room discovery
- `/tournament` - Tournament management

### Input Validation
All socket events use **Zod schemas** for comprehensive input validation:
```typescript
JoinGameSchema.parse(payload); // Validates game settings
SendMessageSchema.parse(payload); // Validates message content
```

## Game Engine Core

### Game Engine (`server/game/GameEngine.ts`)

The `GameEngine` class handles pure game physics and logic:

```typescript
export class GameEngine {
  static update(state: GameState, inputs: { p1: string[]; p2: string[] }): {
    state: GameState,
    scored: boolean,
    scoredBy?: 'p1'|'p2',
    paddleHit?: boolean
  }
}
```

**Key Features:**
- **Pure Functions**: Stateless engine for predictable physics
- **60 FPS Updates**: Consistent frame rate for smooth gameplay
- **Physics Simulation**: Ball movement, paddle collisions, wall bounces
- **Dynamic Ball Physics**: Speed increases and angle variations on paddle hits
- **Event Detection**: Returns scored/paddleHit flags for additional processing

### Physics Implementation

```typescript
// Ball movement per frame
state.ball.x += state.ball.vx;
state.ball.y += state.ball.vy;

// Wall collisions (top/bottom)
if (state.ball.y <= settings.ballSize || 
    state.ball.y >= settings.canvasHeight - settings.ballSize) {
  state.ball.vy *= -1;
  state.ball.y = Math.max(settings.ballSize, 
    Math.min(settings.canvasHeight - settings.ballSize, state.ball.y));
}

// Paddle collision with dynamic angle
const hitPosition = (ball.y - (paddle.y + paddleHeight / 2)) / (paddleHeight / 2);
ball.vx = Math.abs(ball.vx) * 1.02; // Speed increase
ball.vy = hitPosition * Math.abs(ball.vx) * 0.7; // Angle control
```

## Socket Room Management

### Room Types and Architecture

```ascii
Room Management Architecture

┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Room Manager  │    │   Activity Mgr   │    │  Tournament Mgr  │
│                 │    │                  │    │                  │
│ Local Rooms     │◄──►│ User Locks       │◄──►│ Match Invites    │
│ Remote Rooms    │    │ - inMatch        │    │ - Bracket Logic  │
│ Room Cleanup    │    │ - tournament     │    │ - Result Flow    │
└─────────────────┘    │ - pendingInvite  │    └──────────────────┘
                       └──────────────────┘
```

### Local Game Rooms (`GameRoom`)

Local games are controlled by a single socket with both players on the same device:

```typescript
export class GameRoom {
  constructor(
    public id: string,
    public player1: Socket,      // Controlling socket
    public player2: Socket | null, // Always null for local games
    settings: GameSettingsWithTheme
  )

  // Input handling - single socket controls both paddles
  private setupSocketListeners() {
    this.player1.on('game_input', (key: string, isKeyDown: boolean) => {
      // Map keys to players
      if (['w', 's'].includes(key)) {
        // Player 1 (left paddle)
        this.handleInput(key, isKeyDown, "p1");
      } else if (['ArrowUp', 'ArrowDown'].includes(key)) {
        // Player 2 (right paddle) 
        this.handleInput(key, isKeyDown, "p2");
      }
    });
  }
}
```

### Remote Game Rooms (`RemoteGameRoom`)

Remote games have two separate sockets, each controlling one paddle:

```typescript
export class RemoteGameRoom {
  constructor(
    public id: string,
    public player1: Socket,    // Left paddle socket
    public player2: Socket,    // Right paddle socket
    public player1Id: string,  // User ID for player 1
    public player2Id: string   // User ID for player 2
  )

  private setupSocketListeners() {
    // Player 1 controls left paddle
    this.player1.on('remote_game_input', (key: string, isKeyDown: boolean) => {
      this.handleInput(key, isKeyDown, "p1");
    });

    // Player 2 controls right paddle  
    this.player2.on('remote_game_input', (key: string, isKeyDown: boolean) => {
      this.handleInput(key, isKeyDown, "p2");
    });
  }
}
```

### Socket Room Joining Process

```ascii
Socket Room Joining Flow

Client Request → Room Manager → Room Creation → Socket Listeners → Game Loop Start

1. Socket Event        2. Validation         3. Room Instance      4. Event Binding
   'join_game'             - User locks          new GameRoom()       - Input handlers
   'send_invite'           - Settings valid      new RemoteRoom()     - Start handlers
   'matchmaking_join'      - Players available   - State init         - Disconnect handlers
```

**Local Game Join:**
```typescript
socket.on('join_game', async ({ settings, userId, clientRoomId }) => {
  // Create local room with single controlling socket
  const room = roomManager.createGameRoom(socket, settings);
  socket.join(`game_${room.id}`);
  socket.emit('room_joined', { roomId: room.id, type: 'local' });
});
```

**Remote Game Join (via Invite):**
```typescript
socket.on('accept_invite', async ({ inviterId }) => {
  // Create remote room with both players
  const room = roomManager.createRemoteGameRoom(
    inviterSocket, accepterSocket, inviterId, accepterId
  );
  
  // Both sockets join the room
  inviterSocket.join(`remote_${room.id}`);
  accepterSocket.join(`remote_${room.id}`);
  
  // Notify both players
  inviterSocket.emit('remote_room_joined', { roomId: room.id });
  accepterSocket.emit('remote_room_joined', { roomId: room.id });
});
```

## Game Loop and State Broadcasting

### 60 FPS Game Loop

Both room types run identical game loops at 60 FPS:

```typescript
startGameLoop() {
  this.interval = setInterval(() => {
    if (this.isDestroyed) return;
    
    if (this.state.gameStarted && !this.state.gameOver) {
      // Update physics
      const result = GameEngine.update(this.state, this.inputs);
      this.state = result.state;
      
      // Handle events
      if (result.paddleHit) this.recordPaddleHit();
      if (result.scored && !this.state.gameOver) {
        this.pauseAfterScore(30); // Brief pause after scoring
      }
      
      // Broadcast new state
      this.broadcastState();
      
      // Save on game completion
      if (this.state.gameOver && !this.gameSaved) {
        this.saveGameResult('completed');
      }
    }
  }, 1000 / 60); // 60 FPS = ~16.67ms intervals
}
```

### State Broadcasting Strategies

**Local Game Broadcasting:**
```typescript
// Single socket receives state
broadcastState() {
  if (this.player1?.connected) {
    this.player1.emit('game_state', this.state);
  }
}
```

**Remote Game Broadcasting:**
```typescript
// Both sockets receive state
broadcastState() {
  try {
    if (this.player1?.connected) {
      this.player1.emit('remote_game_state', this.state);
    }
    if (this.player2?.connected) {
      this.player2.emit('remote_game_state', this.state);
    }
  } catch (error) {
    console.error('Broadcast error:', error);
  }
}
```

### Input Queuing and Processing

```typescript
// Input queue prevents frame skipping
private inputs: { p1: string[]; p2: string[] } = { p1: [], p2: [] };

handleInput(key: string, isKeyDown: boolean, player: "p1" | "p2") {
  // Validate allowed keys
  const allowedKeys = ['w', 's', 'ArrowUp', 'ArrowDown'];
  if (!allowedKeys.includes(key)) return;

  // Update input state immediately
  const inputArray = this.inputs[player];
  if (isKeyDown) {
    if (!inputArray.includes(key)) {
      inputArray.push(key);
    }
  } else {
    const index = inputArray.indexOf(key);
    if (index > -1) {
      inputArray.splice(index, 1);
    }
  }
}
```

## Frontend Rendering and Caching

### Game State Reception

The frontend receives game states and renders them smoothly:

```typescript
// client/hooks/useLocalGame.ts
useEffect(() => {
  if (!socket) return;
  
  const handleGameState = (gameState: GameState) => {
    // Cache the latest state
    gameStateRef.current = gameState;
    setGameState(gameState);
    
    // Trigger re-render of game canvas
    if (gameState.gameStarted) {
      requestAnimationFrame(renderFrame);
    }
  };

  socket.on('game_state', handleGameState);
  socket.on('remote_game_state', handleGameState);
  
  return () => {
    socket.off('game_state', handleGameState);
    socket.off('remote_game_state', handleGameState);
  };
}, [socket]);
```

### Canvas Rendering Pipeline

```typescript
// client/components/PongTable/render/gameRenderer.ts
export const renderGame = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  theme: Theme,
  interpolationFactor?: number
) => {
  // Clear canvas
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, state.settings.canvasWidth, state.settings.canvasHeight);
  
  // Render paddles with interpolation
  renderPaddles(ctx, state, theme, interpolationFactor);
  
  // Render ball with interpolation
  renderBall(ctx, state, theme, interpolationFactor);
  
  // Render UI elements
  renderScore(ctx, state, theme);
  renderCenterLine(ctx, state, theme);
};
```

### Client-Side Caching Strategy

```typescript
// State caching for smooth rendering
const gameStateCache = {
  current: null as GameState | null,
  previous: null as GameState | null,
  timestamp: 0,
  
  update(newState: GameState) {
    this.previous = this.current;
    this.current = newState;
    this.timestamp = performance.now();
  },
  
  getInterpolated(factor: number): GameState {
    if (!this.previous || !this.current) return this.current;
    
    // Interpolate ball position
    return {
      ...this.current,
      ball: {
        x: lerp(this.previous.ball.x, this.current.ball.x, factor),
        y: lerp(this.previous.ball.y, this.current.ball.y, factor),
        vx: this.current.ball.vx,
        vy: this.current.ball.vy
      }
    };
  }
};
```

## Interpolation System

### Client-Side Interpolation

To smooth out network jitter and provide 60+ FPS rendering on clients:

```typescript
// Interpolation between received states
const INTERPOLATION_DELAY = 100; // ms behind server

function interpolateGameState(
  previousState: GameState,
  currentState: GameState,
  progress: number
): GameState {
  return {
    ...currentState,
    ball: {
      x: lerp(previousState.ball.x, currentState.ball.x, progress),
      y: lerp(previousState.ball.y, currentState.ball.y, progress),
      vx: currentState.ball.vx,
      vy: currentState.ball.vy
    },
    paddles: {
      p1: lerp(previousState.paddles.p1, currentState.paddles.p1, progress),
      p2: lerp(previousState.paddles.p2, currentState.paddles.p2, progress)
    }
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
```

### Rendering Frame Management

```typescript
// Smooth rendering loop independent of network updates
let animationFrameId: number;

const renderLoop = () => {
  const now = performance.now();
  const timeSinceUpdate = now - lastStateTimestamp;
  const interpolationFactor = Math.min(timeSinceUpdate / (1000/60), 1.0);
  
  if (previousState && currentState) {
    const interpolatedState = interpolateGameState(
      previousState, 
      currentState, 
      interpolationFactor
    );
    renderGame(ctx, interpolatedState, theme);
  }
  
  animationFrameId = requestAnimationFrame(renderLoop);
};
```

### Network Compensation

```typescript
// Lag compensation for input
const inputBuffer = [];
const PREDICTION_TIME = 50; // ms

function predictPlayerPosition(currentPosition: number, inputs: string[]): number {
  let predicted = currentPosition;
  const frames = PREDICTION_TIME / (1000/60);
  
  for (let i = 0; i < frames; i++) {
    if (inputs.includes('w') || inputs.includes('ArrowUp')) {
      predicted -= paddleSpeed;
    }
    if (inputs.includes('s') || inputs.includes('ArrowDown')) {
      predicted += paddleSpeed;
    }
  }
  
  return Math.max(0, Math.min(canvasHeight - paddleHeight, predicted));
}
```

## Room Lifecycle Management

### Room Creation and Cleanup

```typescript
// roomManager.ts
export class RoomManager {
  private gameRooms = new Map<string, GameRoom>();
  private remoteRooms = new Map<string, RemoteGameRoom>();
  
  createGameRoom(socket: Socket, settings: GameSettings): GameRoom {
    const roomId = `local_${Date.now()}_${Math.random()}`;
    const room = new GameRoom(roomId, socket, null, settings);
    this.gameRooms.set(roomId, room);
    
    // Auto-cleanup after inactivity
    setTimeout(() => {
      this.deleteGameRoom(roomId);
    }, 30 * 60 * 1000); // 30 minutes
    
    return room;
  }
  
  deleteRemoteRoom(roomId: string, reason: string = 'cleanup') {
    const room = this.remoteRooms.get(roomId);
    if (!room) return;
    
    console.log(`🗑️ Deleting remote room ${roomId} (${reason})`);
    
    // Save game if not already saved
    if (!room.gameSaved) {
      room.saveGameResult('exited');
    }
    
    // Stop game loop
    room.stopGameLoop();
    
    // Remove from registry
    this.remoteRooms.delete(roomId);
  }
}
```

### Disconnect Handling

```typescript
// Handle player disconnection gracefully
socket.on('disconnect', () => {
  const room = findRoomBySocket(socket);
  if (!room) return;
  
  if (room instanceof RemoteGameRoom) {
    // Award win to remaining player
    if (!room.gameSaved && room.state.gameStarted) {
      const disconnectedPlayer = room.player1.id === socket.id ? 'p1' : 'p2';
      const remainingPlayer = disconnectedPlayer === 'p1' ? 'p2' : 'p1';
      
      room.state.gameOver = true;
      room.state.score[remainingPlayer] = room.originalSettings.scoreToWin;
      room.saveGameResult('disconnected');
    }
  } else {
    // Local game - just clean up
    roomManager.deleteGameRoom(room.id);
  }
});
```

## Performance Optimizations

### Efficient State Updates

```typescript
// Only broadcast when state actually changes
let lastBroadcastState: string = '';

broadcastState() {
  const currentStateStr = JSON.stringify(this.state);
  if (currentStateStr === lastBroadcastState) return;
  
  lastBroadcastState = currentStateStr;
  
  // Broadcast to connected sockets
  this.player1?.emit('game_state', this.state);
  this.player2?.emit('remote_game_state', this.state);
}
```

### Memory Management

```typescript
// Automatic room cleanup prevents memory leaks
setInterval(() => {
  const now = Date.now();
  const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  for (const [roomId, room] of this.gameRooms.entries()) {
    if (now - room.createdAt > ROOM_TIMEOUT) {
      this.deleteGameRoom(roomId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes
```

### Network Optimization

```typescript
// Minimize payload size
const optimizedState = {
  ball: { x: state.ball.x, y: state.ball.y },
  paddles: state.paddles,
  score: state.score,
  gameStarted: state.gameStarted,
  gameOver: state.gameOver,
  isPaused: state.isPaused
  // Omit settings and other static data
};
```

This architecture provides a robust, real-time gaming experience with smooth rendering, network resilience, and proper resource management across both local and remote multiplayer scenarios.
