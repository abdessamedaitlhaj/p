import { GameState } from '../../../../server/game/GameState';

export interface InterpolatedGameState extends GameState {
  interpolated?: {
    ball: { x: number; y: number };
    paddles: { p1: number; p2: number };
  };
}

export class GameStateInterpolator {
  private previousState: GameState | null = null;
  private currentState: GameState | null = null;
  private lastUpdateTime = 0;
  private targetUpdateInterval = 1000 / 60; // Server runs at 60 FPS
  private interpolationEnabled = true;
  private updateCount = 0;
  private isInitialized = false;
  private ballOutOfBounds = false;
  private lastBallPosition: { x: number; y: number } | null = null;

  // Smooth interpolation parameters
  private ballSmoothing = 0.7; // Reduced for less lag
  private paddleSmoothing = 0.6;
  private trajectoryMemory: Array<{ x: number; y: number; vx: number; vy: number; timestamp: number }> = [];
  private maxTrajectoryMemory = 3;

  updateState(newState: GameState) {
    this.previousState = this.currentState;
    this.currentState = { ...newState };
    this.lastUpdateTime = performance.now();
    
    this.updateCount++;
    
    // Track ball trajectory for better prediction
    if (this.currentState.gameStarted && !this.currentState.gameOver && !this.currentState.isPaused) {
      this.trajectoryMemory.push({
        x: this.currentState.ball.x,
        y: this.currentState.ball.y,
        vx: this.currentState.ball.vx,
        vy: this.currentState.ball.vy,
        timestamp: this.lastUpdateTime
      });
      
      // Keep only recent trajectory data
      if (this.trajectoryMemory.length > this.maxTrajectoryMemory) {
        this.trajectoryMemory.shift();
      }
    }
    
    // Detect if ball went out of bounds and reset
    if (this.lastBallPosition && this.currentState.gameStarted) {
      const currentX = this.currentState.ball.x;
      const prevX = this.lastBallPosition.x;
      
      // Check if ball was reset to center (indicates score)
      const ballWasReset = Math.abs(currentX - this.currentState.settings.canvasWidth / 2) < 50 &&
                          Math.abs(prevX - this.currentState.settings.canvasWidth / 2) > 100;
      
      if (ballWasReset) {
        this.ballOutOfBounds = true;
        this.trajectoryMemory = []; // Clear trajectory memory on reset
        this.updateCount = 0; // Reset update count for re-initialization
      }
    }
    
    this.lastBallPosition = { x: this.currentState.ball.x, y: this.currentState.ball.y };
    
    // Initialize with gradual stabilization
    if (!this.isInitialized && this.updateCount > 3 && this.currentState.gameStarted) {
      this.isInitialized = true;
    }
  }

  getInterpolatedState(): InterpolatedGameState {
    if (!this.currentState || !this.interpolationEnabled) {
      return this.currentState as InterpolatedGameState;
    }

    const now = performance.now();
    const timeSinceUpdate = now - this.lastUpdateTime;
    
    // If too much time has passed, don't interpolate (avoid overshooting)
    if (timeSinceUpdate > this.targetUpdateInterval * 2) {
      return this.currentState as InterpolatedGameState;
    }

    // If we don't have a previous state, return current state
    if (!this.previousState) {
      return this.currentState as InterpolatedGameState;
    }
    
    // During initialization, use gentler interpolation to reduce shaking
    if (!this.isInitialized || this.updateCount <= 5) {
      const stabilizationFactor = Math.min(this.updateCount / 5, 1);
      const gentleInterpolation = 0.2 * stabilizationFactor;
      
      const interpolatedBall = {
        x: lerp(this.previousState.ball.x, this.currentState.ball.x, gentleInterpolation),
        y: lerp(this.previousState.ball.y, this.currentState.ball.y, gentleInterpolation)
      };
      
      return {
        ...this.currentState,
        interpolated: {
          ball: interpolatedBall,
          paddles: {
            p1: lerp(this.previousState.paddles.p1, this.currentState.paddles.p1, gentleInterpolation),
            p2: lerp(this.previousState.paddles.p2, this.currentState.paddles.p2, gentleInterpolation)
          }
        }
      } as InterpolatedGameState;
    }
    
    // If ball just went out of bounds, show actual position to avoid shaking
    if (this.ballOutOfBounds && timeSinceUpdate < 100) {
      return this.currentState as InterpolatedGameState;
    }
    
    this.ballOutOfBounds = false;

    // Calculate interpolation factor (0 = previous, 1 = current)
    const factor = Math.min(timeSinceUpdate / this.targetUpdateInterval, 1);
    
    // Smooth interpolation for ball position
    const interpolatedBall = this.interpolateBall(
      this.previousState.ball,
      this.currentState.ball,
      factor
    );

    // Smooth interpolation for paddle positions
    const interpolatedPaddles = this.interpolatePaddles(
      this.previousState.paddles,
      this.currentState.paddles,
      factor
    );

    return {
      ...this.currentState,
      interpolated: {
        ball: interpolatedBall,
        paddles: interpolatedPaddles
      }
    } as InterpolatedGameState;
  }

  private interpolateBall(
    prev: { x: number; y: number; vx: number; vy: number },
    curr: { x: number; y: number; vx: number; vy: number },
    factor: number
  ): { x: number; y: number } {
    
    // Detect significant position jumps (like ball reset or collision corrections)
    const distance = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
    const expectedDistance = Math.sqrt(curr.vx ** 2 + curr.vy ** 2);
    
    // If position jump is too large, don't interpolate (avoid trajectory jumps)
    if (distance > expectedDistance * 3) {
      return { x: curr.x, y: curr.y };
    }
    
    // Use improved trajectory prediction with velocity averaging
    let predictiveVx = curr.vx;
    let predictiveVy = curr.vy;
    
    // Average recent velocities for smoother prediction
    if (this.trajectoryMemory.length >= 2) {
      const recentTrajectories = this.trajectoryMemory.slice(-2);
      const avgVx = recentTrajectories.reduce((sum, t) => sum + t.vx, 0) / recentTrajectories.length;
      const avgVy = recentTrajectories.reduce((sum, t) => sum + t.vy, 0) / recentTrajectories.length;
      
      // Blend current and average velocities for stability
      predictiveVx = curr.vx * 0.7 + avgVx * 0.3;
      predictiveVy = curr.vy * 0.7 + avgVy * 0.3;
    }
    
    // Use predicted position with improved velocity
    const predictedX = curr.x + predictiveVx * factor * 0.5; // Reduced prediction factor
    const predictedY = curr.y + predictiveVy * factor * 0.5;
    
    // Lerp between previous position and predicted position with reduced smoothing
    const lerpedX = prev.x + (predictedX - prev.x) * this.ballSmoothing;
    const lerpedY = prev.y + (predictedY - prev.y) * this.ballSmoothing;
    
    return {
      x: lerpedX,
      y: lerpedY
    };
  }

  private interpolatePaddles(
    prev: { p1: number; p2: number },
    curr: { p1: number; p2: number },
    factor: number
  ): { p1: number; p2: number } {
    
    // Simple lerp for paddle positions (they move more predictably)
    const lerpedP1 = prev.p1 + (curr.p1 - prev.p1) * this.paddleSmoothing;
    const lerpedP2 = prev.p2 + (curr.p2 - prev.p2) * this.paddleSmoothing;
    
    return {
      p1: lerpedP1,
      p2: lerpedP2
    };
  }

  // Method to enable/disable interpolation
  setInterpolationEnabled(enabled: boolean) {
    this.interpolationEnabled = enabled;
  }

  // Method to adjust smoothing parameters
  setSmoothingFactors(ball: number, paddle: number) {
    this.ballSmoothing = Math.max(0, Math.min(1, ball));
    this.paddleSmoothing = Math.max(0, Math.min(1, paddle));
  }

  // Reset interpolator (e.g., when game starts/restarts)
  reset() {
    this.previousState = null;
    this.currentState = null;
    this.lastUpdateTime = 0;
  }
}

// Utility function for smooth lerp
export function lerp(start: number, end: number, factor: number): number {
  return start + (end - start) * factor;
}

// Utility function for smooth step interpolation (ease-in-out)
export function smoothStep(start: number, end: number, factor: number): number {
  const t = factor * factor * (3 - 2 * factor); // Smooth step function
  return start + (end - start) * t;
}
