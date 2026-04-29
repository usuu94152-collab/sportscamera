export type SportId = "basketball" | "soccer";

export type GameStatus = "idle" | "running" | "paused" | "finished";

export type TimerState = {
  status: GameStatus;
  elapsedMs: number;
  startedAt: number | null; // performance.now() on host
};

export type GameState = {
  sportId: SportId;
  version: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: string;
  timer: TimerState;
  updatedAt: number;
};

export type GameSnapshot = {
  state: GameState;
  hostTime: number;
  timerDisplayMs: number;
};

export type GameAction =
  | { type: "SET_HOME_TEAM"; name: string }
  | { type: "SET_AWAY_TEAM"; name: string }
  | { type: "HOME_SCORE"; delta: number }
  | { type: "AWAY_SCORE"; delta: number }
  | { type: "SET_PERIOD"; period: string }
  | { type: "TIMER_START" }
  | { type: "TIMER_PAUSE" }
  | { type: "TIMER_RESET" };

export type TimerMode =
  | { mode: "up" }
  | { mode: "down"; initialMs: number };

export type OverlayLayout = {
  width: number;
  height: number;
  safeAreaTop: number;
  safeAreaBottom: number;
};

export type GameActionDefinition = {
  label: string;
  action: GameAction;
};

export type SportDefinition = {
  id: SportId;
  label: string;
  initialState: () => GameState;
  periods: string[];
  timer: TimerMode;
  actions: GameActionDefinition[];
  reduce: (state: GameState, action: GameAction) => GameState;
  drawOverlay: (
    ctx: CanvasRenderingContext2D,
    state: GameState,
    timerDisplayMs: number,
    layout: OverlayLayout
  ) => void;
  ControllerPanel: React.ComponentType<{
    state: GameState;
    timerDisplayMs: number;
    dispatch: (action: GameAction) => void;
  }>;
};
