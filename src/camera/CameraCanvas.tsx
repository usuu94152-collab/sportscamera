import { useEffect, useRef } from "react";
import type { GameState } from "../game/types";
import type { SportDefinition } from "../game/types";
import { calcTimerDisplayMs } from "../game/reducer";

type Props = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sport: SportDefinition;
  gameState: GameState;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

export function CameraCanvas({ videoRef, sport, gameState, canvasRef }: Props) {
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      ctx!.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          ctx!.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        } catch {
          // Keep the preview video visible underneath if a mobile browser delays canvas drawing.
        }
      }
      const timerMs = calcTimerDisplayMs(gameState);
      sport.drawOverlay(ctx!, gameState, timerMs, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        safeAreaTop: 0,
        safeAreaBottom: 0,
      });
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sport, gameState, canvasRef, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
        background: "transparent",
      }}
    />
  );
}
