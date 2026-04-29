import type { SportDefinition, GameState } from "../../game/types";
import { reduceGame } from "../../game/reducer";
import { drawBasketballOverlay } from "./overlayCanvas";
import { BasketballControllerPanel } from "./ControllerPanel";

function initialState(): GameState {
  return {
    sportId: "basketball",
    version: 0,
    homeTeam: "",
    awayTeam: "",
    homeScore: 0,
    awayScore: 0,
    period: "1Q",
    timer: { status: "idle", elapsedMs: 0, startedAt: null },
    updatedAt: Date.now(),
  };
}

export const basketballDef: SportDefinition = {
  id: "basketball",
  label: "농구",
  initialState,
  periods: ["1Q", "2Q", "3Q", "4Q"],
  timer: { mode: "up" },
  actions: [],
  reduce: reduceGame,
  drawOverlay: drawBasketballOverlay,
  ControllerPanel: BasketballControllerPanel as SportDefinition["ControllerPanel"],
};
