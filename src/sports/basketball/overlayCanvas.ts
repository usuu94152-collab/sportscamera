import type { GameState, OverlayLayout } from "../../game/types";
import { formatTimer } from "../../game/reducer";

export function drawBasketballOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  timerDisplayMs: number,
  layout: OverlayLayout
): void {
  const { width } = layout;
  const barH = Math.round(layout.height * 0.11);
  const barW = Math.round(width * 0.9);
  const barX = Math.round((width - barW) / 2);
  const barY = Math.round(layout.safeAreaTop + layout.height * 0.015);
  const pad = Math.round(barH * 0.15);

  ctx.save();

  // background
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  roundRect(ctx, barX, barY, barW, barH, 8);
  ctx.fill();

  const scoreFontSize = Math.round(barH * 0.52);
  const labelFontSize = Math.round(barH * 0.28);
  const timerFontSize = Math.round(barH * 0.32);

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";

  const centerX = barX + barW / 2;
  const midY = barY + barH / 2;

  // score center
  ctx.font = `bold ${scoreFontSize}px sans-serif`;
  const scoreStr = `${state.homeScore}  :  ${state.awayScore}`;
  ctx.textAlign = "center";
  ctx.fillText(scoreStr, centerX, midY - Math.round(barH * 0.06));

  // period + timer below score
  ctx.font = `bold ${timerFontSize}px sans-serif`;
  ctx.fillStyle = "#ffdd57";
  const timerStr = `${state.period}  ${formatTimer(timerDisplayMs)}`;
  ctx.fillText(timerStr, centerX, midY + Math.round(barH * 0.32));

  // home team left
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${labelFontSize}px sans-serif`;
  ctx.textAlign = "left";
  const maxTeamW = Math.round(barW * 0.3);
  const homeLabel = truncateText(ctx, state.homeTeam || "홈팀", maxTeamW);
  ctx.fillText(homeLabel, barX + pad, midY);

  // away team right
  ctx.textAlign = "right";
  const awayLabel = truncateText(ctx, state.awayTeam || "원정팀", maxTeamW);
  ctx.fillText(awayLabel, barX + barW - pad, midY);

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) {
    t = t.slice(0, -1);
  }
  return t + "…";
}
