import type { GameState } from "./GameState";

export class GameEngine {
  static update(state: GameState, inputs: { p1: string[]; p2: string[] }): { state: GameState, scored: boolean, scoredBy?: 'p1'|'p2', paddleHit?: boolean } {

    const { settings } = state;
    const maxY = settings.canvasHeight - settings.paddleHeight;

    // Update paddles with more responsive movement
    if (inputs.p1.includes("w")) {
      state.paddles.p1 = Math.max(state.paddles.p1 - settings.paddleSpeed, 0);
    }
    if (inputs.p1.includes("s")) {
      state.paddles.p1 = Math.min(state.paddles.p1 + settings.paddleSpeed, maxY);
    }
    // Handle both original keys and normalized keys for player 2
    if (inputs.p2.includes("ArrowUp") || inputs.p2.includes("w")) {
      state.paddles.p2 = Math.max(state.paddles.p2 - settings.paddleSpeed, 0);
    }
    if (inputs.p2.includes("ArrowDown") || inputs.p2.includes("s")) {
      state.paddles.p2 = Math.min(state.paddles.p2 + settings.paddleSpeed, maxY);
    }

    // Update ball if game is active
  let scored = false;
  let scoredBy: 'p1'|'p2'|undefined = undefined;
  let paddleHit = false;
    if (state.gameStarted && !state.gameOver && !state.isPaused) {
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;

      // Wall collisions (top/bottom)
      if (state.ball.y <= settings.ballSize || 
          state.ball.y >= settings.canvasHeight - settings.ballSize) {
        state.ball.vy *= -1;
        // Ensure ball stays within bounds
        state.ball.y = Math.max(settings.ballSize, Math.min(settings.canvasHeight - settings.ballSize, state.ball.y));
      }

    // Paddle collisions
    paddleHit = this.handlePaddleCollision(state) || false;
      
    // Scoring
    const scoreRes = this.handleScoring(state);
    scored = scoreRes.scored;
    scoredBy = scoreRes.scoredBy;
    }
  
    return { 
      state: state,  // Return state directly instead of spreading for better performance
      scored, scoredBy, paddleHit // Return status and events
    };
  }

  private static handlePaddleCollision(state: GameState): boolean {
  let hit = false;
    const { settings, ball, paddles } = state;
    const paddleWidth = settings.paddleWidth;
    const paddleHeight = settings.paddleHeight;
    const ballSize = settings.ballSize;

    // Left paddle collision
    if (
      ball.x - ballSize <= settings.paddleOffset + paddleWidth &&
      ball.x + ballSize >= settings.paddleOffset &&
      ball.y + ballSize >= paddles.p1 &&
      ball.y - ballSize <= paddles.p1 + paddleHeight &&
      ball.vx < 0
    ) {
      // Calculate hit position (from -1 to 1)
      const hitPosition = (ball.y - (paddles.p1 + paddleHeight / 2)) / (paddleHeight / 2);
      
      // Change ball direction
      ball.vx = Math.abs(ball.vx) * 1.02; // Slight speed increase
      ball.vy = hitPosition * Math.abs(ball.vx) * 0.7; // Control the angle
      
      // Ensure ball moves away from paddle
      ball.x = settings.paddleOffset + paddleWidth + ballSize + 1;
  hit = true;
    }

    // Right paddle collision
    if (
      ball.x + ballSize >= settings.canvasWidth - settings.paddleOffset - paddleWidth &&
      ball.x - ballSize <= settings.canvasWidth - settings.paddleOffset &&
      ball.y + ballSize >= paddles.p2 &&
      ball.y - ballSize <= paddles.p2 + paddleHeight &&
      ball.vx > 0
    ) {
      // Calculate hit position (from -1 to 1)
      const hitPosition = (ball.y - (paddles.p2 + paddleHeight / 2)) / (paddleHeight / 2);
      
      // Change ball direction
      ball.vx = -Math.abs(ball.vx) * 1.02; // Slight speed increase
      ball.vy = hitPosition * Math.abs(ball.vx) * 0.7; // Control the angle
      
      // Ensure ball moves away from paddle
      ball.x = settings.canvasWidth - settings.paddleOffset - paddleWidth - ballSize - 1;
      hit = true;
    }
    return hit;
  }

  private static handleScoring(state: GameState): { scored: boolean, scoredBy?: 'p1'|'p2' } {
    const { settings, ball } = state;
    let scored = false;
    let scoredBy: 'p1'|'p2'|undefined = undefined;
    
    if (ball.x < 0) {
      state.score.p2++;
      this.resetAfterScore(state, "p1");
      scored = true;
      scoredBy = 'p2';
    } 
    else if (ball.x > settings.canvasWidth) {
      state.score.p1++;
      this.resetAfterScore(state, "p2");
      scored = true;
      scoredBy = 'p1';
    }
    
    return { scored, scoredBy };
  }
  private static resetAfterScore(state: GameState, loser: "p1" | "p2") {
    const { settings } = state;
    
    // Use ballSpeedValue for physics
    state.ball = {
      x: settings.canvasWidth / 2,
      y: settings.canvasHeight / 2,
      vx: loser === "p1" ? settings.ballSpeedValue : -settings.ballSpeedValue,
      vy: (Math.random() - 0.5) * settings.ballSpeedValue * 0.8,
    };
    
    // Only end game if someone reached the win condition
    if (state.score.p1 >= settings.scoreToWin || 
        state.score.p2 >= settings.scoreToWin) {
      state.gameOver = true;
      state.gameStarted = false;
    } else {
      state.isPaused = false;
    }
  }

}