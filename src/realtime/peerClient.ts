import Peer, { type DataConnection } from "peerjs";
import type { GameAction, GameSnapshot } from "../game/types";
import type { ClientMessage, HostMessage, ConnectionStatus } from "./messages";

const PREFIX = "sportcast-";
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_TIMEOUT_MS = 10000;
const RETRY_INTERVAL_MS = 3000;
const MAX_AUTO_RETRIES = 20;

export type ClientEventMap = {
  statusChange: (status: ConnectionStatus) => void;
  snapshotReceived: (snapshot: GameSnapshot, receivedAt: number) => void;
  replaced: () => void;
  error: (err: Error) => void;
};

export class PeerClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private clientId = crypto.randomUUID();
  private deviceName = navigator.userAgent.slice(0, 40);
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private retryCount = 0;
  private roomCode = "";
  private destroyed = false;
  private listeners: Partial<ClientEventMap> = {};

  on<K extends keyof ClientEventMap>(event: K, fn: ClientEventMap[K]) {
    this.listeners[event] = fn as ClientEventMap[K];
  }

  connect(roomCode: string) {
    this.roomCode = roomCode;
    this.retryCount = 0;
    this.clearRetry();
    this.initPeer();
  }

  private initPeer() {
    if (this.destroyed) return;
    if (!this.peer || this.peer.destroyed) {
      this.peer = new Peer();
      this.peer.on("open", () => this.attemptConnect());
      this.peer.on("error", (err) => this.listeners.error?.(err));
    } else {
      this.attemptConnect();
    }
  }

  private attemptConnect() {
    if (this.destroyed) return;
    this.emit("connecting");
    const hostId = PREFIX + this.roomCode;
    const conn = this.peer!.connect(hostId, { reliable: true });

    conn.on("open", () => {
      this.conn = conn;
      this.lastHeartbeat = performance.now();
      this.startHeartbeat();
      const hello: ClientMessage = {
        type: "hello",
        clientId: this.clientId,
        deviceName: this.deviceName,
        sentAt: Date.now(),
      };
      conn.send(hello);
    });

    conn.on("data", (raw) => {
      const msg = raw as HostMessage;
      if (msg.type === "pending_approval") {
        this.emit("pending_approval");
      } else if (msg.type === "approved") {
        this.emit("connected");
        this.listeners.snapshotReceived?.(msg.snapshot, performance.now());
      } else if (msg.type === "snapshot") {
        this.listeners.snapshotReceived?.(msg.snapshot, performance.now());
      } else if (msg.type === "action_rejected") {
        this.listeners.snapshotReceived?.(msg.snapshot, performance.now());
      } else if (msg.type === "controller_replaced") {
        this.emit("replaced");
        this.listeners.replaced?.();
        this.clearHeartbeat();
        conn.close();
        this.conn = null;
      } else if (msg.type === "heartbeat") {
        this.lastHeartbeat = performance.now();
      }
    });

    conn.on("close", () => {
      if (this.conn === conn) {
        this.conn = null;
        this.clearHeartbeat();
        this.emit("disconnected");
        this.scheduleRetry();
      }
    });

    conn.on("error", () => {
      this.emit("disconnected");
      this.scheduleRetry();
    });
  }

  sendAction(action: GameAction, baseVersion: number) {
    const msg: ClientMessage = { type: "action", action, baseVersion };
    this.conn?.send(msg);
  }

  requestSnapshot() {
    const msg: ClientMessage = { type: "request_snapshot" };
    this.conn?.send(msg);
  }

  disconnect() {
    this.clearRetry();
    this.clearHeartbeat();
    this.conn?.close();
    this.conn = null;
    this.emit("idle");
  }

  destroy() {
    this.destroyed = true;
    this.disconnect();
    this.peer?.destroy();
    this.peer = null;
  }

  private scheduleRetry() {
    if (this.destroyed || this.retryCount >= MAX_AUTO_RETRIES) return;
    this.retryTimer = setTimeout(() => {
      this.retryCount++;
      this.attemptConnect();
    }, RETRY_INTERVAL_MS);
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.conn) return;
      if (performance.now() - this.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        this.conn.close();
        this.conn = null;
        this.clearHeartbeat();
        this.emit("disconnected");
        this.scheduleRetry();
        return;
      }
      const msg: ClientMessage = { type: "heartbeat", sentAt: Date.now() };
      this.conn.send(msg);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private emit(status: ConnectionStatus) {
    this.listeners.statusChange?.(status);
  }
}
