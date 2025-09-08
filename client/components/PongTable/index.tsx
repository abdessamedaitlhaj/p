import { useEffect, useRef, useState } from 'react';
import { GameState } from '../../../server/game/GameState';
import { PongTheme } from '@/lib/themes';
import { renderPong } from './render/renderPong';
import { GameStateInterpolator } from './render/interpolation';

export interface PongTableProps { 
  gameState: GameState | null; 
  theme: PongTheme; 
  className?: string; 
  enableInterpolation?: boolean;
}

export function PongTable({ 
  gameState, 
  theme, 
  className = '', 
  enableInterpolation = true
}: PongTableProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interpolatorRef = useRef<GameStateInterpolator>(new GameStateInterpolator());
  const animationFrameRef = useRef<number>();
  const [isAnimating, setIsAnimating] = useState(false);

  // Update interpolator when new game state arrives
  useEffect(() => {
    if (gameState) {
      interpolatorRef.current.updateState(gameState);
      interpolatorRef.current.setInterpolationEnabled(enableInterpolation);
      
      // Start animation loop if not already running
      if (!isAnimating && enableInterpolation && gameState.gameStarted && !gameState.gameOver) {
        setIsAnimating(true);
      }
    }
  }, [gameState, enableInterpolation]);

  // Animation loop for smooth interpolation
  useEffect(() => {
    if (!isAnimating || !gameState || !canvasRef.current) return;

    const animate = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx || !gameState) return;

      // Get interpolated state and render
      const interpolatedState = interpolatorRef.current.getInterpolatedState();
      renderPong(ctx, interpolatedState, theme);

      // Continue animation if game is still active
      if (gameState.gameStarted && !gameState.gameOver) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAnimating, gameState, theme]);

  // Fallback render for when interpolation is disabled or game is not active
  useEffect(() => {
    if (!gameState || !canvasRef.current || isAnimating) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    renderPong(ctx, gameState, theme);
  }, [gameState, theme, isAnimating]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      interpolatorRef.current.reset();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={gameState?.settings.canvasWidth || 800}
      height={gameState?.settings.canvasHeight || 600}
      className={`border-4 rounded-xl ${className}`}
      style={{ borderColor: theme.colors.accent }}
    />
  );
}

export default PongTable;
