import { PongTheme } from '@/lib/themes';

// Cache for pre-rendered background patterns
const patternCache = new Map<string, HTMLCanvasElement>();

// Clear cache when canvas dimensions change (prevent memory leaks)
export function clearPatternCache() {
  patternCache.clear();
}

// Individual background pattern drawers extracted from legacy drawUtils for clarity.
export function drawBackgroundPattern(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: string
) {
  // Create cache key
  const cacheKey = `${pattern}_${width}_${height}`;
  
  // Check if we have a cached version for static patterns
  if (pattern !== 'space-stars' && patternCache.has(cacheKey)) {
    const cachedCanvas = patternCache.get(cacheKey)!;
    ctx.drawImage(cachedCanvas, 0, 0);
    return;
  }

  switch (pattern) {
    case 'pacman-dots':
      drawPacmanDotsOptimized(ctx, width, height, cacheKey);
      break;
    case 'japanese-pattern':
      drawJapanesePatternOptimized(ctx, width, height, cacheKey);
      break;
    case 'arcade-grid':
      drawArcadeGridOptimized(ctx, width, height, cacheKey);
      break;
    case 'space-stars':
      drawSpaceStars(ctx, width, height); // Dynamic pattern - no caching
      break;
  }
}

// Optimized cached version for static patterns
function drawPacmanDotsOptimized(ctx: CanvasRenderingContext2D, width: number, height: number, cacheKey: string) {
  // Create off-screen canvas for caching
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  const cacheCtx = cacheCanvas.getContext('2d')!;
  
  // Draw to cache canvas
  drawPacmanDotsToContext(cacheCtx, width, height);
  
  // Store in cache
  patternCache.set(cacheKey, cacheCanvas);
  
  // Draw to main canvas
  ctx.drawImage(cacheCanvas, 0, 0);
}

function drawJapanesePatternOptimized(ctx: CanvasRenderingContext2D, width: number, height: number, cacheKey: string) {
  // Create off-screen canvas for caching
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  const cacheCtx = cacheCanvas.getContext('2d')!;
  
  // Draw to cache canvas
  drawJapanesePatternToContext(cacheCtx, width, height);
  
  // Store in cache
  patternCache.set(cacheKey, cacheCanvas);
  
  // Draw to main canvas
  ctx.drawImage(cacheCanvas, 0, 0);
}

function drawArcadeGridOptimized(ctx: CanvasRenderingContext2D, width: number, height: number, cacheKey: string) {
  // Create off-screen canvas for caching
  const cacheCanvas = document.createElement('canvas');
  cacheCanvas.width = width;
  cacheCanvas.height = height;
  const cacheCtx = cacheCanvas.getContext('2d')!;
  
  // Draw to cache canvas
  drawArcadeGridToContext(cacheCtx, width, height);
  
  // Store in cache
  patternCache.set(cacheKey, cacheCanvas);
  
  // Draw to main canvas
  ctx.drawImage(cacheCanvas, 0, 0);
}

// Core drawing functions (extracted from original)
function drawPacmanDotsToContext(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const dotSize = 3; 
  const spacing = 35; 
  const opacity = 0.3;
  
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#FFFF00';
  
  for (let x = spacing; x < width; x += spacing) {
    for (let y = spacing; y < height; y += spacing) {
      const centerX = width / 2;
      const paddleLeftArea = x < 80;
      const paddleRightArea = x > width - 80;
      const centerArea = Math.abs(x - centerX) < 50;
      
      if (!paddleLeftArea && !paddleRightArea && !centerArea) {
        ctx.beginPath();
        ctx.arc(x, y, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  
  ctx.restore();
}

function drawJapanesePatternToContext(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const opacity = 0.1;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#cc0000';
  ctx.lineWidth = 1;
  
  const waveHeight = 20;
  const waveLength = 60;
  const numWaves = Math.ceil(width / waveLength) + 1;
  
  for (let i = 0; i < 5; i++) {
    const y = (height / 6) * (i + 1);
    ctx.beginPath();
    for (let j = 0; j <= numWaves; j++) {
      const x = (j * waveLength) - waveLength;
      const waveY = y + Math.sin((x / waveLength) * Math.PI * 2) * waveHeight;
      if (j === 0) ctx.moveTo(x, waveY);
      else ctx.lineTo(x, waveY);
    }
    ctx.stroke();
  }
  
  ctx.restore();
}

function drawArcadeGridToContext(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const opacity = 0.2;
  const gridSize = 40;
  
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1;
  
  for (let x = gridSize; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  for (let y = gridSize; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  
  ctx.restore();
}

export function drawPacmanDots(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // This is a static pattern - use cached version
  const cacheKey = `pacman-dots-${width}-${height}`;
  const cachedPattern = patternCache.get(cacheKey);
  
  if (cachedPattern) {
    ctx.drawImage(cachedPattern, 0, 0);
  } else {
    drawPacmanDotsOptimized(ctx, width, height, cacheKey);
  }
}

export function drawJapanesePattern(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // This is a static pattern - use cached version
  const cacheKey = `japanese-pattern-${width}-${height}`;
  const cachedPattern = patternCache.get(cacheKey);
  
  if (cachedPattern) {
    ctx.drawImage(cachedPattern, 0, 0);
  } else {
    drawJapanesePatternOptimized(ctx, width, height, cacheKey);
  }
}

export function drawArcadeGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // This is a static pattern - use cached version
  const cacheKey = `arcade-grid-${width}-${height}`;
  const cachedPattern = patternCache.get(cacheKey);
  
  if (cachedPattern) {
    ctx.drawImage(cachedPattern, 0, 0);
  } else {
    drawArcadeGridOptimized(ctx, width, height, cacheKey);
  }
}

export function drawSpaceStars(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const opacity = 0.8; const numStars = 60; const numLightningDots = 15; ctx.save(); ctx.globalAlpha = opacity;
  const stars: Array<{x:number;y:number;size:number;brightness:number}> = [];
  for (let i = 0; i < numStars; i++) {
    const seed = (i * 9301 + 49297) % 233280; const random1 = (seed / 233280);
    const seed2 = ((i + 1) * 9301 + 49297) % 233280; const random2 = (seed2 / 233280);
    const seed3 = ((i + 2) * 9301 + 49297) % 233280; const random3 = (seed3 / 233280);
    stars.push({ x: random1 * width, y: random2 * height, size: random3 * 1.5 + 0.5, brightness: random3 * 0.4 + 0.6 });
  }
  stars.forEach(star => { ctx.fillStyle = `rgba(255,255,255,${star.brightness})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill(); });
  const lightningDots: Array<{x:number;y:number}> = [];
  for (let i = 0; i < numLightningDots; i++) {
    const seed = ((i + 100) * 9301 + 49297) % 233280; const random1 = (seed / 233280);
    const seed2 = ((i + 101) * 9301 + 49297) % 233280; const random2 = (seed2 / 233280);
    lightningDots.push({ x: random1 * width, y: random2 * height });
  }
  lightningDots.forEach((dot, index) => {
    const time = Date.now() * 0.003; const pulsePhase = (time + index * 0.5) % (Math.PI * 2); const intensity = (Math.sin(pulsePhase) + 1) / 2; const brightness = 0.4 + intensity * 0.6; const size = 2 + intensity * 2;
    ctx.save(); ctx.globalAlpha = brightness * 0.3; ctx.fillStyle = '#00ffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(dot.x, dot.y, size * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha = brightness; ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (intensity > 0.7) {
      ctx.save(); ctx.globalAlpha = (intensity - 0.7) * 2; ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1; ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 5; const sparkLength = 8;
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) { ctx.beginPath(); ctx.moveTo(dot.x, dot.y); ctx.lineTo(dot.x + Math.cos(angle) * sparkLength, dot.y + Math.sin(angle) * sparkLength); ctx.stroke(); }
      ctx.restore();
    }
  });
  ctx.restore();
}
