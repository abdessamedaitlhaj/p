import type { GameSettings, PongTheme, GameStateSettings } from "../types";
import { CANVAS_SHAPES, BALL_SPEEDS, GAME_CONFIG } from "../types";

export interface GameState {
  ball: {
    x: number;
    y: number;
    vx: number;
    vy: number;
  };
  paddles: {
    p1: number;
    p2: number;
  };
  score: {
    p1: number;
    p2: number;
  };
  gameStarted: boolean;
  gameOver: boolean;
  isPaused: boolean;
  settings: GameStateSettings;  // Theme excluded; client renders theme independently
  endReason?: 'completed' | 'disconnected' | 'exited';
}

export const createInitialState = (settings: GameSettings & { theme?: PongTheme }): GameState => {
  const canvasConfig = CANVAS_SHAPES[settings.canvasShape];
  const ballSpeedValue = BALL_SPEEDS[settings.ballSpeed];
  
  return {
    ball: {
      x: canvasConfig.width / 2,
      y: canvasConfig.height / 2,
      vx: Math.random() > 0.5 ? ballSpeedValue : -ballSpeedValue,
      vy: (Math.random() - 0.5) * ballSpeedValue * 0.8,
    },
    paddles: {
      p1: (canvasConfig.height - GAME_CONFIG.PADDLE_HEIGHT) / 2,
      p2: (canvasConfig.height - GAME_CONFIG.PADDLE_HEIGHT) / 2,
    },
    score: { p1: 0, p2: 0 },
    gameStarted: false,
    gameOver: false,
    isPaused: false,
  endReason: undefined,
  settings: {
      canvasWidth: canvasConfig.width,
      canvasHeight: canvasConfig.height,
      paddleWidth: GAME_CONFIG.PADDLE_WIDTH,
      paddleHeight: GAME_CONFIG.PADDLE_HEIGHT,
      paddleSpeed: GAME_CONFIG.PADDLE_SPEED,
      paddleOffset: GAME_CONFIG.PADDLE_OFFSET,
      ballSize: GAME_CONFIG.BALL_SIZE,
      ballSpeedValue,  // Store numeric value
      scoreToWin: settings.scoreToWin,
    },
  };
};