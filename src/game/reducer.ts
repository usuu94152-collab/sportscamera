import type { GameState, GameAction } from "./types";

export function reduceGame(state: GameState, action: GameAction): GameState {
  const now = Date.now();
  switch (action.type) {
    case "SET_HOME_TEAM":
      return { ...state, homeTeam: action.name, version: state.version + 1, updatedAt: now };
    case "SET_AWAY_TEAM":
      return { ...state, awayTeam: action.name, version: state.version + 1, updatedAt: now };
    case "HOME_SCORE": {
      const next = Math.max(0, state.homeScore + action.delta);
      return { ...state, homeScore: next, version: state.version + 1, updatedAt: now };
    }
    case "AWAY_SCORE": {
      const next = Math.max(0, state.awayScore + action.delta);
      return { ...state, awayScore: next, version: state.version + 1, updatedAt: now };
    }
    case "SET_PERIOD":
      return { ...state, period: action.period, version: state.version + 1, updatedAt: now };
    case "TIMER_START": {
      if (state.timer.status === "running") return state;
      return {
        ...state,
        timer: { status: "running", elapsedMs: state.timer.elapsedMs, startedAt: performance.now() },
        version: state.version + 1,
        updatedAt: now,
      };
    }
    case "TIMER_PAUSE": {
      if (state.timer.status !== "running") return state;
      const elapsed = state.timer.elapsedMs + (performance.now() - (state.timer.startedAt ?? performance.now()));
      return {
        ...state,
        timer: { status: "paused", elapsedMs: elapsed, startedAt: null },
        version: state.version + 1,
        updatedAt: now,
      };
    }
    case "TIMER_RESET":
      return {
        ...state,
        timer: { status: "idle", elapsedMs: 0, startedAt: null },
        version: state.version + 1,
        updatedAt: now,
      };
    default:
      return state;
  }
}

export function calcTimerDisplayMs(state: GameState): number {
  if (state.timer.status === "running" && state.timer.startedAt !== null) {
    return state.timer.elapsedMs + (performance.now() - state.timer.startedAt);
  }
  return state.timer.elapsedMs;
}

export function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
