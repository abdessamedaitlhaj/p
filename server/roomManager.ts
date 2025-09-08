import { GameRoom } from "./game/GameRoom";
import { RemoteGameRoom } from "./game/RemoteGameRoom";
import { Socket } from "socket.io";
import { GameSettingsWithTheme } from "./types";

class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private remoteRooms: Map<string, RemoteGameRoom> = new Map();

  async createLocalRoom(player: Socket, settings?: GameSettingsWithTheme): Promise<string> {
    console.log(`🎮 Creating LOCAL game room for player ${player.id}`);
    const roomId = `local_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    
    const defaultSettings: GameSettingsWithTheme = {
      ballSpeed: "normal" as const,
      canvasShape: "rectangle" as const,
      scoreToWin: 5,
      canvasWidth: 800,
      canvasHeight: 400,
      paddleWidth: 20,
      paddleHeight: 80,
      paddleSpeed: 8,
      paddleOffset: 20,
      ballSize: 10,
      theme: {
        id: "pacman",
        name: "Pacman Arcade",
        fontFamily: "font-arcade",
        colors: {
          background: "#000000",
          paddle: "#FFFF00",
          ball: "#FFFF00",
          accent: "#00FFFF",
          text: "#FFFF00",
        },
        centerSymbol: "",
        glowEffect: true,
      },
    };
    
    // Use provided settings or fall back to defaults
    const finalSettings = settings || defaultSettings;
    
    try {
      // Create new room with custom settings
      const room = new GameRoom(roomId, player, null, finalSettings);
      this.rooms.set(roomId, room);

      // Auto-cleanup room after 10 minutes of inactivity
      setTimeout(() => {
        if (this.rooms.has(roomId)) {
          const room = this.rooms.get(roomId);
          if (room && !room.state.gameStarted) {
            console.log(`⏰ Room ${roomId} auto-cleanup after inactivity`);
            this.deleteRoom(roomId);
          }
        }
      }, 10 * 60 * 1000);

      return roomId;
    } catch (error) {
      console.error(`❌ Failed to create room ${roomId}:`, error);
      throw error;
    }
  }

  createRemoteGameRoom(
    player1: Socket,
    player2: Socket,
    player1Id: string,
    player2Id: string,
    settings?: GameSettingsWithTheme,
  options?: { matchType?: 'remote' | 'matchmaking' | string, ownerSocketId?: string }
  ): string {
    
    // CRITICAL FIX: Check for existing room by user IDs, not socket IDs (prevents duplicates)
    for (const [rid, room] of this.remoteRooms.entries()) {
      const roomP1Id = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
      const roomP2Id = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
      
      // Check if same user pair exists in any order
      if (
        (String(roomP1Id) === String(player1Id) && String(roomP2Id) === String(player2Id)) ||
        (String(roomP1Id) === String(player2Id) && String(roomP2Id) === String(player1Id))
      ) {
        console.warn('⚠️ Preventing duplicate remote room creation - users already have active room', rid);
        
        // Check if the room is still active and not completed
        if (!(room as any).state?.gameOver && !(room as any).isDestroyed) {
          console.log('🔄 Updating existing active room with latest sockets:', rid);
          
          // Update socket references to latest sockets to prevent stale references
          try {
            if (String(roomP1Id) === String(player1Id)) {
              (room as any).player1 = player1;
              (room as any).player2 = player2;
            } else {
              (room as any).player1 = player2;
              (room as any).player2 = player1;
            }
            
            // Re-setup socket listeners with new socket references
            (room as any).cleanup?.();
            (room as any).setupSocketListeners?.();
            
          } catch (error) {
            console.error('Error updating socket references:', error);
          }
          
          return rid;
        } else {
          console.log('🗑️ Cleaning up completed room before creating new one:', rid);
          this.deleteRemoteRoom(rid);
        }
      }
    }
    
    const roomId = `remote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      const gameRoom = new RemoteGameRoom(roomId, player1, player2, player1Id, player2Id, settings);
      if (options?.ownerSocketId && options.ownerSocketId !== player1.id) {
        // If owner differs (e.g., tournament auto-match), set explicitly
        (gameRoom as any).transferOwnership?.({ id: options.ownerSocketId } as any);
      }
  // Attach metadata
  (gameRoom as any).createdAt = Date.now();
      // Mark match type on the state so results reflect matchmaking
      if (options?.matchType === 'matchmaking') {
        // @ts-ignore - extend state dynamically for tagging
        gameRoom.state.endReason = undefined; // ensure defined
        // Store hint on instance to tweak result
        // @ts-ignore
        gameRoom.matchTypeOverride = 'matchmaking';
      } else if (options?.matchType && options.matchType !== 'remote') {
        // Tournament id case: tag override with tournament id
        // @ts-ignore
        gameRoom.matchTypeOverride = options.matchType as any;
      }
      this.remoteRooms.set(roomId, gameRoom);
      
      // Auto-cleanup after 10 minutes of inactivity
      setTimeout(() => {
        if (this.remoteRooms.has(roomId)) {
          const room = this.remoteRooms.get(roomId);
          if (room && (room.state.gameOver || !room.state.gameStarted)) {
            console.log(`⏰ Remote room ${roomId} auto-cleanup after inactivity`);
            this.deleteRemoteRoom(roomId);
          }
        }
      }, 600000); // 10 minutes
      
      player1.join(roomId);
      player2.join(roomId);
  
      return roomId;
    } catch (error) {
      console.error(`❌ Failed to create remote room ${roomId}:`, error);
      throw error;
    }
  }


  broadcastToRoom(roomId: string, event: string, data: any) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.player1.to(roomId).emit(event, data);
    }
  }

  deleteRoom(roomId: string): boolean {
    console.log(`🗑️ Deleting room ${roomId}`);
    
    const room = this.rooms.get(roomId);
    if (room) {
      // Prevent deleting just-created room within 500ms (race guard)
      const createdAt: number | undefined = (room as any).createdAt;
      if (createdAt && Date.now() - createdAt < 500) {
        console.warn(`⏳ Skip deletion of ${roomId} (created ${Date.now() - createdAt}ms ago)`);
        return false;
      }
      try {
  // Stop loop and detach listeners to prevent leaks affecting other rooms
  room.stopGameLoop();
  room.cleanup();
        const deleted = this.rooms.delete(roomId);
        
        return deleted;
      } catch (error) {
        console.error(`❌ Error deleting room ${roomId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  deleteRemoteRoom(roomId: string): boolean {
    console.log(`🗑️ Deleting remote room ${roomId}`);
    
    const room = this.remoteRooms.get(roomId);
    if (room) {
      const createdAt: number | undefined = (room as any).createdAt;
      if (createdAt && Date.now() - createdAt < 500) {
        console.warn(`⏳ Skip deletion of remote ${roomId} (created ${Date.now() - createdAt}ms ago)`);
        return false;
      }
  try {
  room.stopGameLoop();
  // Detach listeners to avoid leaks affecting other rooms
  room.cleanup?.();
    try {
      const p1: string = (room as any).player1UserId || (room as any).player1Id;
      const p2: string = (room as any).player2UserId || (room as any).player2Id;
      if (p1 && p2) {
        const { activityManager } = require('./activityManager');
        activityManager.unlockFromMatch(String(p1), String(p2));
      }
    } catch {}
        const deleted = this.remoteRooms.delete(roomId);
        
        return deleted;
      } catch (error) {
        console.error(`❌ Error deleting remote room ${roomId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  getRemoteRoom(roomId: string): RemoteGameRoom | undefined {
    return this.remoteRooms.get(roomId);
  }

  getRoomCount(): number {
    // Clean up any invalid rooms
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room || room.state === undefined) {
        console.log(`🧹 Cleaning up invalid room ${roomId}`);
        this.rooms.delete(roomId);
      }
    }
    
    // Clean up any invalid remote rooms
    for (const [roomId, room] of this.remoteRooms.entries()) {
      if (!room || room.state === undefined) {
        console.log(`🧹 Cleaning up invalid remote room ${roomId}`);
        this.remoteRooms.delete(roomId);
      }
    }
    
    return this.rooms.size + this.remoteRooms.size;
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values()).filter(room => room && room.state);
  }

  getAllRemoteRooms(): RemoteGameRoom[] {
    return Array.from(this.remoteRooms.values()).filter(room => room && room.state);
  }

  findRemoteRoomByUserId(userId: string): { room: RemoteGameRoom; side: 'p1'|'p2' } | undefined {
    for (const room of this.remoteRooms.values()) {
      const p1: any = (room as any).getPlayer1UserId?.() || (room as any).player1UserId;
      const p2: any = (room as any).getPlayer2UserId?.() || (room as any).player2UserId;
      if (String(p1) === String(userId)) return { room, side: 'p1' };
      if (String(p2) === String(userId)) return { room, side: 'p2' };
    }
    return undefined;
  }

  // Debug method to get room status
  getRoomStatus(): { [key: string]: any } {
    const status: { [key: string]: any } = {};
    
    for (const [roomId, room] of this.rooms.entries()) {
      status[roomId] = {
        id: room.id,
        players: 2, // Always 2 for local play
        gameStarted: room.state?.gameStarted || false,
        gameOver: room.state?.gameOver || false,
        isLocal: roomId.startsWith('local_'),
        type: 'local'
      };
    }

    for (const [roomId, room] of this.remoteRooms.entries()) {
      status[roomId] = {
        id: room.id,
        players: 2, // Always 2 for remote play
        gameStarted: room.state?.gameStarted || false,
        gameOver: room.state?.gameOver || false,
        isRemote: roomId.startsWith('remote_'),
        type: 'remote'
      };
    }
    
    return status;
  }
}

export const roomManager = new RoomManager();

// Debug logging every 5 minutes (reduced frequency)
setInterval(() => {
  const status = roomManager.getRoomStatus();
  const totalRooms = Object.keys(status).length;
  if (totalRooms > 0) {
    console.log(`🎮 Room Manager Status: ${totalRooms} active rooms`);
  }
}, 300000); // 5 minutes