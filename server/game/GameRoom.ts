import { GameState, createInitialState } from "./GameState";
import { GameEngine } from "./GameEngine";
import { Socket } from "socket.io";
import type { GameResult, GameSettingsWithTheme , GameStateSettings} from "../types";

import { saveGameResult } from "../controllers/statistics"

export class GameRoom {
  public state: GameState;
  private inputs: { p1: string[]; p2: string[] } = { p1: [], p2: [] };
  private interval: NodeJS.Timeout | null = null;
  private pauseTimeout: NodeJS.Timeout | null = null;
  private autoStartTimeout: NodeJS.Timeout | null = null;
  private isDestroyed = false;
  private gameSaved = false;
  private originalSettings: GameSettingsWithTheme; // Store original settings

  constructor(
    public id: string,
    public player1: Socket,
    public player2: Socket | null,
    settings: GameSettingsWithTheme
  ) {
    console.log(`Creating GameRoom ${id} with settings:`, settings);
    this.originalSettings = settings; // Store the original settings
    this.state = createInitialState(settings);
  // Mark creation time for race condition debugging
  (this as any).createdAt = Date.now();
    this.setupSocketListeners();
    this.startGameLoop();
    
    // Send initial state immediately
    this.broadcastState();

    // Failsafe: auto-start shortly after room creation if no explicit start
    this.autoStartTimeout = setTimeout(() => {
      if (!this.isDestroyed && !this.state.gameStarted && !this.state.gameOver) {
        console.log("⏱️ Auto-starting local game (failsafe)", this.id);
        this.state.gameStarted = true;
        this.state.isPaused = false;
        this.broadcastState();
      }
    }, 700);
  }
  // Keep references to bound socket listeners so we can remove them on cleanup
  private onGameInputBound?: (key: string, isKeyDown: boolean) => void;
  private onStartGameBound?: () => void;
  private onDisconnectBound?: () => void;
  private saveGameResult(status: 'completed' | 'disconnected' | 'exited') {
  this.state.endReason = status;
    const winner: 'p1' | 'p2' | 'none' = 
      this.state.score.p1 > this.state.score.p2 ? 'p1' :
      this.state.score.p2 > this.state.score.p1 ? 'p2' : 'none';

    // Strip theme from settings for persisted result (clients render their own theme)
    const { theme: _omitTheme, ...settingsNoTheme } = this.originalSettings as any;

    const result: GameResult = {
      roomId: this.id,
      winner,
      score: this.state.score,
      settings: settingsNoTheme,
      status,
  matchType: 'local',
      endedAt: new Date().toISOString()
    };

    saveGameResult(result);
    this.gameSaved = true;
  }

  
  startGameLoop() {
    // console.log("🔄 Starting game loop for room", this.id); // Reduced logging
    this.interval = setInterval(() => {
      if (this.isDestroyed) return;
      
      if (this.state.gameStarted && !this.state.gameOver) {
        const result = GameEngine.update(this.state, this.inputs);
        this.state = result.state;
        
        // Only pause after score if game is still ongoing
        if (result.scored && !this.state.gameOver) {
          this.pauseAfterScore(30);
        }
        
        this.broadcastState();
        
        // Save result after game over
        if (this.state.gameOver && !this.gameSaved) {
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
    if (this.autoStartTimeout) {
      clearTimeout(this.autoStartTimeout);
      this.autoStartTimeout = null;
    }
    this.isDestroyed = true;
  }
  
  private setupSocketListeners() {
    // Bind handlers once so we can remove them later
    this.onGameInputBound = (key: string, isKeyDown: boolean) => {
      this.handleInput(key, isKeyDown);
    };
    this.onStartGameBound = () => {
      console.log(`🎬 start_game event received for room ${this.id}`);
      if (!this.state.gameStarted && !this.state.gameOver) {
        this.state.gameStarted = true;
        this.state.isPaused = false;
        this.broadcastState();
        console.log(`✅ Local game ${this.id} started (manual trigger)`);
      }
    };
    this.onDisconnectBound = () => {
      if (this.state.gameStarted && !this.gameSaved) {
        this.saveGameResult('disconnected');
      }
      this.stopGameLoop();
    };

    // Player 1 listeners
    this.player1.on("game_input", this.onGameInputBound);
    this.player1.on("start_game", this.onStartGameBound);
    this.player1.on("disconnect", this.onDisconnectBound);

    // For local play, we don't need separate player2 listeners since it's the same socket
    // The input handling will determine which player based on the key pressed
  }

  // Ensure we fully detach event listeners when deleting a room
  public cleanup() {
    try {
      if (this.onGameInputBound) this.player1.off("game_input", this.onGameInputBound);
      if (this.onStartGameBound) this.player1.off("start_game", this.onStartGameBound);
      if (this.onDisconnectBound) this.player1.off("disconnect", this.onDisconnectBound);
    } catch (e) {
      console.error(`Error during GameRoom(${this.id}) cleanup:`, e);
    } finally {
      this.onGameInputBound = undefined;
      this.onStartGameBound = undefined;
      this.onDisconnectBound = undefined;
      if (this.autoStartTimeout) {
        clearTimeout(this.autoStartTimeout);
        this.autoStartTimeout = null;
      }
    }
  }


  private handleInput(key: string, isKeyDown: boolean) {
    if (this.isDestroyed) return;
    
    // Map keys to players and update inputs
    if (["w", "s"].includes(key)) {
      if (isKeyDown && !this.inputs.p1.includes(key)) {
        this.inputs.p1.push(key);
      } else if (!isKeyDown) {
        this.inputs.p1 = this.inputs.p1.filter(k => k !== key);
      }
    } else if (["ArrowUp", "ArrowDown"].includes(key)) {
      if (isKeyDown && !this.inputs.p2.includes(key)) {
        this.inputs.p2.push(key);
      } else if (!isKeyDown) {
        this.inputs.p2 = this.inputs.p2.filter(k => k !== key);
      }
    }
    // console.log(`Inputs: P1: ${this.inputs.p1}, P2: ${this.inputs.p2}`); // Removed debug logging
  }

  private broadcastState() {
    if (this.isDestroyed) return;
    
    try {
      // console.log("📡 Broadcasting state to player1:", this.state.gameStarted ? "GAME RUNNING" : "GAME STOPPED");
      this.player1.emit("game_state", this.state);
      // For local play, player2 is the same as player1, so no need to emit twice
    } catch (error) {
      console.error("Error broadcasting state:", error);
    }
  }

  public addPlayer(player: Socket): boolean {
    // For local play, we don't add additional players
    // The room is designed for one socket handling both players
    return false;
  }

  // Method to handle post-score pause
  public pauseAfterScore(duration: number = 1000) {
    this.state.isPaused = true;
    this.broadcastState();
    
    this.pauseTimeout = setTimeout(() => {
      if (!this.isDestroyed && !this.state.gameOver) {
        this.state.isPaused = false;
        this.broadcastState();
      }
    }, duration);
  }
}