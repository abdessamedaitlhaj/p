// Game Configuration - Dynamic settings
export type GameSettings = {
  // Canvas shape
  canvasShape: "rectangle" | "square" | "wide";

  // Game rules
  scoreToWin: 3 | 5 | 7;

  // Ball physics
  ballSpeed: "slow" | "normal" | "fast";
};

export const BALL_SPEEDS = {
  slow: 2.5,
  normal: 4.5,
  fast: 6.5,
} as const;

export const CANVAS_SHAPES = {
  rectangle: { width: 800, height: 500 },
  square: { width: 600, height: 600 },
  wide: { width: 900, height: 400 },
} as const;

// Default game settings
export const DEFAULT_SETTINGS: GameSettings = {
  canvasShape: "rectangle",
  scoreToWin: 7,
  ballSpeed: "normal",
};

// Static configuration
export const GAME_CONFIG = {
  // Ball physics
  BALL_SIZE: 8,
  BALL_SPEED_INCREASE: 0.2, // Speed increase after each paddle hit

  // Paddle settings
  PADDLE_WIDTH: 15,
  PADDLE_HEIGHT: 100,
  PADDLE_SPEED: 5,
  PADDLE_OFFSET: 15, // Distance from canvas edge

  // Game timing
  RESET_DELAY: 1500, // Delay before ball reset after scoring (ms)

  // Visual settings
  CENTER_LINE_DASH: [8, 8],
  CENTER_SYMBOL_SIZE: 60,
} as const;
