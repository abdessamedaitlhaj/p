
export interface GameSettings {
	ballSpeed: "slow" | "normal" | "fast";
	canvasShape: "rectangle" | "square" | "wide";
	scoreToWin: 3 | 5 | 7;
	canvasWidth: number;
	canvasHeight: number;
	paddleWidth: number;
	paddleHeight: number;
	paddleSpeed: number;
	paddleOffset: number;
	ballSize: number;
}
export interface GameSettingsWithTheme extends GameSettings {
  theme: PongTheme;
}

export interface PerMatchStats {
	finalScore: { p1: number; p2: number };
	pointsTimeline: Array<'p1'|'p2'>;
	rallyLengths: number[]; // paddle hits per rally
	longestRally: number;
	averageRally: number;
	comebackFactor: number; // largest deficit winner overcame
	momentumTimeline: Array<{ t: number; leader: 'p1'|'p2'|'tie'; score: { p1: number; p2: number } }>;
	matchDurationMs: number;
}

  export interface GameStateSettings {
	canvasWidth: number;
	canvasHeight: number;
	paddleWidth: number;
	paddleHeight: number;
	paddleSpeed: number;
	paddleOffset: number;
	ballSize: number;
	ballSpeedValue: number;  // Numeric value for physics
	scoreToWin: number;
  }
  
  export interface PongTheme {
	id: string;
	name: string;
	colors: {
	  background: string;
	  paddle: string;
	  ball: string;
	  text: string;
	  accent: string;
	};
	centerSymbol: string;
	fontFamily: string;
	glowEffect: boolean;
  }
  
  
  export const CANVAS_SHAPES = {
	rectangle: { width: 800, height: 600 },
	square: { width: 600, height: 600 },
	wide: { width: 1000, height: 500 },
  };
  
  export const BALL_SPEEDS = {
	slow: 4,
	normal: 6,
	fast: 8,
  };
  
  export const GAME_CONFIG = {
	PADDLE_HEIGHT: 100,
	PADDLE_WIDTH: 15,
	PADDLE_SPEED: 10,
	PADDLE_OFFSET: 20,
	BALL_SIZE: 8,
  };
  
  export const DEFAULT_SETTINGS: GameSettings = {
	ballSpeed: "normal",
	canvasShape: "rectangle",
	scoreToWin: 5,
	canvasWidth: CANVAS_SHAPES.rectangle.width,
	canvasHeight: CANVAS_SHAPES.rectangle.height,
	paddleWidth: GAME_CONFIG.PADDLE_WIDTH,
	paddleHeight: GAME_CONFIG.PADDLE_HEIGHT,
	paddleSpeed: GAME_CONFIG.PADDLE_SPEED,
	paddleOffset: GAME_CONFIG.PADDLE_OFFSET,
	ballSize: GAME_CONFIG.BALL_SIZE,
  };


  export interface GameResult {
	roomId: string;
	winner: 'p1' | 'p2' | 'none';
	score: { p1: number; p2: number };
	settings: GameSettings; // Theme omitted in persisted results to allow per-user themes
	status: 'completed' | 'disconnected' | 'exited';
	matchType: string; // e.g., 'local' | 'remote' | 'matchmaking' | tournamentId
	endedAt: string;
	player1UserId?: string; // For remote games
	player2UserId?: string; // For remote games
	perMatchStats?: PerMatchStats;
  }