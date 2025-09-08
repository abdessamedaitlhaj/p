import { GameState, createInitialState } from "./GameState";
import { GameEngine } from "./GameEngine";
import { Socket } from "socket.io";
import type { GameResult, GameSettingsWithTheme } from "../types";
import { saveGameResult } from "../controllers/statistics";
import { createStatsTracker, recordPaddleHit, recordScored, buildResult } from './remoteStats';

export class RemoteGameRoom {
  public state: GameState;
  private inputs: { p1: string[]; p2: string[] } = { p1: [], p2: [] };
  private interval: NodeJS.Timeout | null = null;
  private pauseTimeout: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private gameSaved = false;
  private originalSettings: GameSettingsWithTheme;
  private player1UserId: string;
  private player2UserId: string;
  // Original owning socket (tab) for lifecycle enforcement
  private ownerSocketId: string;
  // Stats tracking
  private stats = createStatsTracker();
  // Optional override for result tagging (e.g., matchmaking)
  public matchTypeOverride?: 'matchmaking';
  // Keep references to bound socket listeners so we can remove them on cleanup
  private onP1InputBound?: (key: string, isKeyDown: boolean) => void;
  private onP2InputBound?: (key: string, isKeyDown: boolean) => void;
  private onP1StartBound?: () => void;
  private onP2StartBound?: () => void;
  private onP1DisconnectBound?: () => void;
  private onP2DisconnectBound?: () => void;

  constructor(
    public id: string,
    public player1: Socket,
    public player2: Socket,
    public player1Id: string,
    public player2Id: string,
    settings?: GameSettingsWithTheme
  ) {
    console.log(`Creating RemoteGameRoom ${id} for players ${player1Id} vs ${player2Id}`);
    
    // Use default settings with default theme for remote games
    this.originalSettings = settings || {
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
      }
    };
    
    this.player1UserId = player1Id;
    this.player2UserId = player2Id;
  // Define owner as player1's socket initially (inviter / first side)
  this.ownerSocketId = player1.id;
  // Pass settings without requiring theme; client controls visual theme
  this.state = createInitialState(this.originalSettings as any);
    this.setupSocketListeners();
    this.startGameLoop();
    
    // Send initial state immediately
    this.broadcastState();
    
    // Auto-start for matchmaking games after 3 seconds if not manually started
    setTimeout(() => {
      if (!this.state.gameStarted && !this.state.gameOver && !this.isDestroyed) {
        console.log(`⏰ Auto-starting remote game ${this.id} after timeout`);
        this.forceStart('manual');
      }
    }, 3000);
  }

  // Expose user ids for external queries (CLI)
  public getPlayer1UserId() { return this.player1UserId; }
  public getPlayer2UserId() { return this.player2UserId; }
  public getOwnerSocketId() { return this.ownerSocketId; }
  public transferOwnership(newOwnerSocket: Socket) {
    console.log(`[RemoteGameRoom] Ownership transfer ${this.ownerSocketId} -> ${newOwnerSocket.id}`);
    this.ownerSocketId = newOwnerSocket.id;
  }

  public movePaddleBySide(side: 'p1'|'p2', direction: 'up'|'down') {
    const speed = this.state.settings.paddleSpeed;
    const height = this.state.settings.canvasHeight;
    const paddleHeight = this.state.settings.paddleHeight;
    const delta = direction === 'up' ? -speed : speed;
    const oldPos = this.state.paddles[side];
    const newPos = Math.max(0, Math.min(height - paddleHeight, oldPos + delta));
    this.state.paddles[side] = newPos;
    // Broadcast minimal update
    try { this.player1.emit('remote_game_state', this.state); this.player2.emit('remote_game_state', this.state); } catch (e) { console.error('Broadcast error', e); }
    return newPos;
  }

  // Force start (used for tournaments / auto-start contexts)
  public forceStart(reason: 'tournament' | 'matchmaking' | 'manual' = 'manual') {
    if (!this.state.gameStarted && !this.state.gameOver) {
      console.log(`⚡ Force starting remote game ${this.id} (${reason})`);
      this.state.gameStarted = true;
      this.state.isPaused = false;
      this.broadcastState();
    }
  }

  private saveGameResult(status: 'completed' | 'disconnected' | 'exited') {
  this.state.endReason = status;
    const winner: 'p1' | 'p2' | 'none' = 
      this.state.score.p1 > this.state.score.p2 ? 'p1' :
      this.state.score.p2 > this.state.score.p1 ? 'p2' : 'none';

    const { theme: _omitTheme, ...settingsNoTheme } = this.originalSettings as any;

  const result = buildResult(this.stats, this.state, this.originalSettings, winner, this.matchTypeOverride || 'remote', { p1: this.player1UserId, p2: this.player2UserId }, this.id);
  result.status = status; // override status based on save context
  saveGameResult(result as GameResult);
    import('../activityManager').then(({ activityManager }) => {
      try { activityManager.unlockFromMatch(this.player1UserId, this.player2UserId); } catch {}
    }).catch(()=>{});
    this.gameSaved = true;
  }

  startGameLoop() {
    // console.log("🔄 Starting remote game loop for room", this.id); // Reduced logging
    this.interval = setInterval(() => {
      if (this.isDestroyed) return;
      
      if (this.state.gameStarted && !this.state.gameOver) {
        const result = GameEngine.update(this.state, this.inputs);
        this.state = result.state;
        if (result.paddleHit) recordPaddleHit(this.stats);
        if (result.scored) {
          recordScored(this.stats, this.state, result.scoredBy);
        }
        
        // Only pause after score if game is still ongoing
        if (result.scored && !this.state.gameOver) {
          this.pauseAfterScore(30);
        }
        
        this.broadcastState();
        
        // Save result after game over
        if (this.state.gameOver && !this.gameSaved) {
          console.log(`[RemoteGameRoom:${this.id}] Game over detected (engine loop). Final score p1=${this.state.score.p1} p2=${this.state.score.p2}`);
          this.saveGameResult('completed');
        }
      }
    }, 1000 / 60);
  }

  stopGameLoop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }
    this.isDestroyed = true;
  }
  
  private setupSocketListeners() {
    // Clean up any existing listeners first
    this.cleanup();
    
    // Player 1 listeners (left paddle)
    this.onP1InputBound = (key: string, isKeyDown: boolean) => {
      this.handleInput(key, isKeyDown, "p1");
    };
    this.onP1StartBound = () => {
      // console.log("🚀 SERVER: Player 1 wants to start remote game"); // Reduced logging
      this.tryStartGame();
    };
    this.onP1DisconnectBound = () => {
      console.log("❌ Player 1 disconnected from remote game");
      if (this.state.gameStarted && !this.gameSaved) {
        this.state.gameOver = true;
        this.state.endReason = 'disconnected';
        this.state.score.p2 = Math.max(this.state.score.p2, this.originalSettings.scoreToWin);
        console.log(`[RemoteGameRoom:${this.id}] Forcing game over due to player 1 disconnect. p1=${this.state.score.p1} p2=${this.state.score.p2}`);
        this.saveGameResult('disconnected');
        this.broadcastState();
      }
      this.stopGameLoop();
    };
    
    this.player1.on("remote_game_input", this.onP1InputBound);
    this.player1.on("remote_start_game", this.onP1StartBound);
    this.player1.on("disconnect", this.onP1DisconnectBound);

    // Player 2 listeners (right paddle)
    this.onP2InputBound = (key: string, isKeyDown: boolean) => {
      this.handleInput(key, isKeyDown, "p2");
    };
    this.onP2StartBound = () => {
      // console.log("🚀 SERVER: Player 2 wants to start remote game"); // Reduced logging
      this.tryStartGame();
    };
    this.onP2DisconnectBound = () => {
      console.log("❌ Player 2 disconnected from remote game");
      if (this.state.gameStarted && !this.gameSaved) {
        this.state.gameOver = true;
        this.state.endReason = 'disconnected';
        this.state.score.p1 = Math.max(this.state.score.p1, this.originalSettings.scoreToWin);
        console.log(`[RemoteGameRoom:${this.id}] Forcing game over due to player 2 disconnect. p1=${this.state.score.p1} p2=${this.state.score.p2}`);
        this.saveGameResult('disconnected');
        this.broadcastState();
      }
      this.stopGameLoop();
    };
    
    this.player2.on("remote_game_input", this.onP2InputBound);
    this.player2.on("remote_start_game", this.onP2StartBound);
    this.player2.on("disconnect", this.onP2DisconnectBound);
  }

  private tryStartGame() {
    if (!this.state.gameStarted && !this.state.gameOver) {
      // console.log("✅ Starting remote game..."); // Reduced logging
      this.state.gameStarted = true;
      this.state.isPaused = false;
      this.broadcastState();
      // console.log("📡 Broadcasted remote game state with gameStarted=true"); // Reduced logging
    }
  }

  private handleInput(key: string, isKeyDown: boolean, player: "p1" | "p2") {
    // For remote games, both w/s and up/down keys control the same player
    const normalizedKey = this.normalizeKey(key);
    
    if (isKeyDown && !this.inputs[player].includes(normalizedKey)) {
      this.inputs[player].push(normalizedKey);
    } else if (!isKeyDown) {
      this.inputs[player] = this.inputs[player].filter(k => k !== normalizedKey);
    }
  }

  private normalizeKey(key: string): string {
    // Normalize all up/down keys to their respective directions
    if (key === "w" || key === "ArrowUp") return "w";
    if (key === "s" || key === "ArrowDown") return "s";
    return key;
  }

  private broadcastState() {
    if (this.isDestroyed) return;
    
    try {
      // Send to both players
      this.player1.emit("remote_game_state", this.state);
      this.player2.emit("remote_game_state", this.state);
    } catch (error) {
      console.error("Error broadcasting remote game state:", error);
    }
  }

  // Clean up event listeners to avoid leaks
  public cleanup() {
    try {
      if (this.onP1InputBound) this.player1.off("remote_game_input", this.onP1InputBound);
      if (this.onP1StartBound) this.player1.off("remote_start_game", this.onP1StartBound);
      if (this.onP1DisconnectBound) this.player1.off("disconnect", this.onP1DisconnectBound);
      if (this.onP2InputBound) this.player2.off("remote_game_input", this.onP2InputBound);
      if (this.onP2StartBound) this.player2.off("remote_start_game", this.onP2StartBound);
      if (this.onP2DisconnectBound) this.player2.off("disconnect", this.onP2DisconnectBound);
    } catch (e) {
      console.error(`Error during RemoteGameRoom(${this.id}) cleanup:`, e);
    } finally {
      this.onP1InputBound = undefined;
      this.onP1StartBound = undefined;
      this.onP1DisconnectBound = undefined;
      this.onP2InputBound = undefined;
      this.onP2StartBound = undefined;
      this.onP2DisconnectBound = undefined;
    }
  }

  // Called when a participant explicitly exits the room without disconnecting the socket
  public onPlayerExit(exitingSocketId: string) {
    if (this.isDestroyed) return;
    const exiting = exitingSocketId === this.player1.id ? 'p1' : exitingSocketId === this.player2.id ? 'p2' : null;
    if (!exiting) return;
    const winner = exiting === 'p1' ? 'p2' : 'p1';
    if (!this.state.gameOver) {
      this.state.gameOver = true;
  this.state.endReason = 'exited';
      // Ensure winner reaches scoreToWin for clear result
      this.state.score[winner] = Math.max(this.state.score[winner], this.originalSettings.scoreToWin);
  console.log(`[RemoteGameRoom:${this.id}] Player ${exiting} exited. Winner ${winner}. Final score p1=${this.state.score.p1} p2=${this.state.score.p2}`);
      if (!this.gameSaved) this.saveGameResult('exited');
      this.broadcastState();
    }
    this.stopGameLoop();
  }

  public addPlayer(player: Socket): boolean {
    // Remote games always have exactly 2 players
    console.log(`Remote game room - cannot add additional players`);
    return false;
  }

  public pauseAfterScore(duration: number = 1000) {
    this.state.isPaused = true;
    // Don't broadcast immediately - let the current frame complete
    
    this.pauseTimeout = setTimeout(() => {
      if (!this.isDestroyed && !this.state.gameOver) {
        this.state.isPaused = false;
        this.broadcastState();
      }
    }, duration);
  }
}
