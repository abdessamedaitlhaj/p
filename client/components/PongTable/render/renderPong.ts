import { PongTheme } from '@/lib/themes';
import { GameState } from '../../../../server/game/GameState';
import { drawBackgroundPattern } from './backgroundPatterns';
import { drawCenterSymbol } from './centerSymbol';
import { InterpolatedGameState } from './interpolation';

export function renderPong(
  ctx: CanvasRenderingContext2D,
  gameState: GameState | InterpolatedGameState,
  theme: PongTheme
) {
  const { canvasWidth, canvasHeight } = gameState.settings;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (theme.canvas.backgroundPattern) {
    drawBackgroundPattern(
      ctx,
      canvasWidth,
      canvasHeight,
      theme.canvas.backgroundPattern
    );
  }

  if (theme.centerSymbol) {
    drawCenterSymbol(
      ctx,
      canvasWidth,
      canvasHeight,
      theme.centerSymbol,
      theme
    );
  }

  // Use interpolated positions if available, otherwise use actual positions
  const interpolated = (gameState as InterpolatedGameState).interpolated;
  const ballPos = interpolated?.ball || gameState.ball;
  const paddlePos = interpolated?.paddles || gameState.paddles;

  // paddles
  ctx.fillStyle = theme.colors.paddle;
  if (theme.canvas.paddleShape === 'rounded') {
    const r = 8;
    const leftX = gameState.settings.paddleOffset;
    const leftY = paddlePos.p1;
    ctx.beginPath();
    (ctx as any).roundRect(
      leftX,
      leftY,
      gameState.settings.paddleWidth,
      gameState.settings.paddleHeight,
      r
    );
    ctx.fill();

    const rightX =
      canvasWidth -
      gameState.settings.paddleOffset -
      gameState.settings.paddleWidth;
    const rightY = paddlePos.p2;
    ctx.beginPath();
    (ctx as any).roundRect(
      rightX,
      rightY,
      gameState.settings.paddleWidth,
      gameState.settings.paddleHeight,
      r
    );
    ctx.fill();
  } else {
    ctx.fillRect(
      gameState.settings.paddleOffset,
      paddlePos.p1,
      gameState.settings.paddleWidth,
      gameState.settings.paddleHeight
    );
    ctx.fillRect(
      canvasWidth -
        gameState.settings.paddleOffset -
        gameState.settings.paddleWidth,
      paddlePos.p2,
      gameState.settings.paddleWidth,
      gameState.settings.paddleHeight
    );
  }

  // paddle accents
  if (theme.colors.paddleAccent) {
    ctx.fillStyle = theme.colors.paddleAccent;
    const accentWidth = 2;
    ctx.fillRect(
      gameState.settings.paddleOffset +
        gameState.settings.paddleWidth -
        accentWidth,
      paddlePos.p1,
      accentWidth,
      gameState.settings.paddleHeight
    );
    ctx.fillRect(
      canvasWidth -
        gameState.settings.paddleOffset -
        gameState.settings.paddleWidth,
      paddlePos.p2,
      accentWidth,
      gameState.settings.paddleHeight
    );
  }

  // ball with motion blur effect for fast movement
  if (theme.canvas.hasGlow) {
    ctx.save();
    ctx.shadowColor = theme.colors.ball;
    ctx.shadowBlur = 15;
    ctx.globalAlpha = 0.8;
  }

  // Add motion blur trail for fast ball movement
  const ballSpeed = Math.sqrt(gameState.ball.vx * gameState.ball.vx + gameState.ball.vy * gameState.ball.vy);
  if (ballSpeed > 6) {
    // Draw trail effect
    ctx.save();
    const trailLength = Math.min(ballSpeed * 2, 20);
    const trailSteps = 5;
    const stepAlpha = 0.1;
    
    for (let i = 1; i <= trailSteps; i++) {
      const factor = i / trailSteps;
      const trailX = ballPos.x - gameState.ball.vx * factor * (trailLength / ballSpeed);
      const trailY = ballPos.y - gameState.ball.vy * factor * (trailLength / ballSpeed);
      
      ctx.globalAlpha = stepAlpha * (1 - factor);
      ctx.beginPath();
      ctx.arc(trailX, trailY, gameState.settings.ballSize * (1 - factor * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = theme.colors.ball;
      ctx.fill();
    }
    ctx.restore();
  }

  // Main ball
  ctx.beginPath();
  ctx.arc(
    ballPos.x,
    ballPos.y,
    gameState.settings.ballSize,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = theme.colors.ball;
  ctx.fill();
  if (theme.canvas.hasGlow) ctx.restore();

  // score
  ctx.fillStyle = theme.colors.text;
  ctx.font = `32px ${theme.canvas.font}`;
  ctx.textAlign = 'center';
  if (theme.canvas.hasGlow) {
    ctx.save();
    ctx.shadowColor = theme.colors.text;
    ctx.shadowBlur = 10;
  }
  ctx.fillText(`${gameState.score.p1}`, canvasWidth * 0.25, 50);
  ctx.fillText(`${gameState.score.p2}`, canvasWidth * 0.75, 50);
  if (theme.canvas.hasGlow) ctx.restore();

  // center line
  ctx.strokeStyle = theme.colors.text;
  ctx.globalAlpha = 0.5;
  switch (theme.centerLineStyle) {
    case 'dotted':
      ctx.setLineDash([5, 10]);
      break;
    case 'dashed':
      ctx.setLineDash([15, 10]);
      break;
    default:
      ctx.setLineDash([]);
  }
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(canvasWidth / 2, 0);
  ctx.lineTo(canvasWidth / 2, canvasHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
