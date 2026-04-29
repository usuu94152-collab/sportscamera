import type { SportId, SportDefinition } from "./types";
import { basketballDef } from "../sports/basketball/definition";
import { soccerDef } from "../sports/soccer/definition";

const registry: Record<SportId, SportDefinition> = {
  basketball: basketballDef,
  soccer: soccerDef,
};

export function getSport(id: SportId): SportDefinition {
  return registry[id];
}

export const ALL_SPORTS: SportDefinition[] = [basketballDef, soccerDef];
