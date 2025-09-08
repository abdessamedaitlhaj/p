import { PongTheme } from '@/lib/themes';

export function drawCenterSymbol(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  symbol: string,
  theme: PongTheme
) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  const centerX = width / 2;
  const centerY = height / 2;
  let fontSize = 60;
  let fontFamily = 'Arial';
  switch (theme.id) {
    case 'japanese':
      fontFamily = "'Noto Sans JP','Hiragino Sans','Yu Gothic','Meiryo',sans-serif";
      fontSize = 80;
      break;
    case 'arcade':
    case 'pacman':
      fontFamily = "'Orbitron','Courier New',monospace";
      fontSize = 50;
      break;
    case 'space':
      fontFamily = "'Orbitron','Arial',sans-serif";
      fontSize = 50;
      break;
  }
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.colors.text;
  ctx.fillText(symbol, centerX, centerY);
  ctx.restore();
}
