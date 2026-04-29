import type { SportDefinition, GameState } from "../../game/types";
import { reduceGame } from "../../game/reducer";
import { drawSoccerOverlay } from "./overlayCanvas";
import { SoccerControllerPanel } from "./ControllerPanel";

function initialState(): GameState {
  return {
    sportId: "soccer",
    version: 0,
    homeTeam: "",
    awayTeam: "",
    homeScore: 0,
    awayScore: 0,
    period: "전반",
    timer: { status: "idle", elapsedMs: 0, startedAt: null },
    updatedAt: Date.now(),
  };
}

export const soccerDef: SportDefinition = {
  id: "soccer",
  label: "축구",
  initialState,
  periods: ["전반", "후반"],
  timer: { mode: "up" },
  actions: [],
  reduce: reduceGame,
  drawOverlay: drawSoccerOverlay,
  ControllerPanel: SoccerControllerPanel as SportDefinition["ControllerPanel"],
};
