import type { GameAction, GameSnapshot } from "../game/types";

export type ClientMessage =
  | { type: "hello"; clientId: string; deviceName?: string; sentAt: number }
  | { type: "action"; action: GameAction; baseVersion: number }
  | { type: "request_snapshot" }
  | { type: "heartbeat"; sentAt: number };

export type HostMessage =
  | { type: "pending_approval" }
  | { type: "approved"; snapshot: GameSnapshot }
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "action_rejected"; reason: string; snapshot: GameSnapshot }
  | { type: "controller_replaced"; reason: string }
  | { type: "heartbeat"; sentAt: number; hostTime: number };

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "pending_approval"
  | "connected"
  | "disconnected"
  | "replaced";
