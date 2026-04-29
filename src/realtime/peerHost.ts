import Peer, { type DataConnection } from "peerjs";
import type { GameSnapshot } from "../game/types";
import type { ClientMessage, HostMessage } from "./messages";

const PREFIX = "sportcast-";
const MAX_RETRIES = 5;
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_TIMEOUT_MS = 10000;

function genRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export type HostEventMap = {
  ready: (roomCode: string) => void;
  connectionRequest: (clientId: string, deviceName: string | undefined, conn: DataConnection) => void;
  action: (msg: Extract<ClientMessage, { type: "action" }>, conn: DataConnection) => void;
  controllerReplaced: (oldConn: DataConnection) => void;
  controllerDisconnected: () => void;
  error: (err: Error) => void;
};

export class PeerHost {
  private peer: Peer | null = null;
  private roomCode = "";
  private activeConn: DataConnection | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat = 0;
  private retryCount = 0;
  private listeners: Partial<HostEventMap> = {};
  private destroyed = false;

  on<K extends keyof HostEventMap>(event: K, fn: HostEventMap[K]) {
    this.listeners[event] = fn as HostEventMap[K];
  }

  start() {
    this.tryConnect();
  }

  private tryConnect() {
    if (this.destroyed) return;
    if (this.retryCount >= MAX_RETRIES) {
      this.listeners.error?.(new Error("방 코드 생성 실패: 최대 재시도 횟수 초과"));
      return;
    }
    const code = genRoomCode();
    const peerId = PREFIX + code;
    this.peer = new Peer(peerId);

    this.peer.on("open", () => {
      this.roomCode = code;
      this.retryCount = 0;
      this.listeners.ready?.(code);
    });

    this.peer.on("error", (err: { type: string } & Error) => {
      if (err.type === "unavailable-id") {
        this.retryCount++;
        this.peer?.destroy();
        this.tryConnect();
      } else {
        this.listeners.error?.(err);
      }
    });

    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        // send pending_approval immediately
        this.send(conn, { type: "pending_approval" });
        const helloTimeout = setTimeout(() => conn.close(), 5000);

        conn.on("data", (raw) => {
          const msg = raw as ClientMessage;
          if (msg.type === "hello") {
            clearTimeout(helloTimeout);
            this.listeners.connectionRequest?.(msg.clientId, msg.deviceName, conn);
          } else if (msg.type === "action") {
            if (conn === this.activeConn) {
              this.listeners.action?.(msg, conn);
            }
          } else if (msg.type === "heartbeat") {
            if (conn === this.activeConn) {
              this.lastHeartbeat = performance.now();
              this.send(conn, { type: "heartbeat", sentAt: Date.now(), hostTime: Date.now() });
            }
          } else if (msg.type === "request_snapshot") {
            // handled externally via approveController snapshot send
          }
        });

        conn.on("close", () => {
          if (conn === this.activeConn) {
            this.clearHeartbeat();
            this.activeConn = null;
            this.listeners.controllerDisconnected?.();
          }
        });
      });
    });
  }

  approveController(conn: DataConnection, snapshot: GameSnapshot) {
    if (this.activeConn && this.activeConn !== conn) {
      this.send(this.activeConn, { type: "controller_replaced", reason: "다른 기기가 승인되었습니다" });
      this.activeConn.close();
      this.listeners.controllerReplaced?.(this.activeConn);
    }
    this.activeConn = conn;
    this.lastHeartbeat = performance.now();
    this.startHeartbeat();
    this.send(conn, { type: "approved", snapshot });
  }

  rejectController(conn: DataConnection) {
    conn.close();
  }

  sendSnapshot(snapshot: GameSnapshot) {
    if (this.activeConn) {
      this.send(this.activeConn, { type: "snapshot", snapshot });
    }
  }

  disconnectController() {
    if (this.activeConn) {
      this.activeConn.close();
      this.activeConn = null;
      this.clearHeartbeat();
    }
  }

  regenerateRoomCode(snapshot: GameSnapshot) {
    this.disconnectController();
    this.peer?.destroy();
    this.retryCount = 0;
    this.tryConnect();
    void snapshot; // new controller will request snapshot after approval
  }

  get currentRoomCode() {
    return this.roomCode;
  }

  get hasActiveController() {
    return this.activeConn !== null;
  }

  destroy() {
    this.destroyed = true;
    this.clearHeartbeat();
    this.peer?.destroy();
    this.peer = null;
    this.activeConn = null;
  }

  private send(conn: DataConnection, msg: HostMessage) {
    try {
      conn.send(msg);
    } catch {
      // connection may be closing
    }
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.activeConn) return;
      if (performance.now() - this.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        this.activeConn.close();
        this.activeConn = null;
        this.clearHeartbeat();
        this.listeners.controllerDisconnected?.();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
