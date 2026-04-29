import { useState, useEffect, useRef, useCallback } from "react";
import type { SportId, GameState, GameAction } from "../game/types";
import { getSport, ALL_SPORTS } from "../game/sports";
import { PeerClient } from "../realtime/peerClient";
import type { ConnectionStatus } from "../realtime/messages";
import { interpolateTimerMs } from "../realtime/clockSync";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "연결 전",
  connecting: "연결 중…",
  pending_approval: "승인 대기 중…",
  connected: "연결됨",
  disconnected: "끊김",
  replaced: "다른 기기로 교체됨",
};

export function ControllerPage({ onBack }: { onBack: () => void }) {
  const [sportId, setSportId] = useState<SportId | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [snapshotTimerMs, setSnapshotTimerMs] = useState(0);
  const [snapshotReceivedAt, setSnapshotReceivedAt] = useState(0);
  const [displayTimerMs, setDisplayTimerMs] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const clientRef = useRef<PeerClient | null>(null);
  const rafRef = useRef<number>(0);

  const sport = sportId && gameState ? getSport(sportId) : null;

  // timer interpolation loop
  useEffect(() => {
    function tick() {
      if (gameState && snapshotReceivedAt > 0) {
        setDisplayTimerMs(
          interpolateTimerMs(snapshotTimerMs, gameState.timer.status === "running", snapshotReceivedAt)
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameState, snapshotTimerMs, snapshotReceivedAt]);

  useEffect(() => {
    return () => {
      clientRef.current?.destroy();
    };
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    if (!clientRef.current || connStatus !== "connected" || !gameState) return;
    clientRef.current.sendAction(action, gameState.version);
  }, [connStatus, gameState]);

  function connect() {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code || !sportId) return;

    const client = new PeerClient();
    clientRef.current?.destroy();
    clientRef.current = client;

    client.on("statusChange", (status) => {
      setConnStatus(status);
      if (status === "replaced") {
        alert("다른 기기가 컨트롤러로 승인되었습니다. 조작이 비활성화됩니다.");
      }
    });

    client.on("snapshotReceived", (snapshot, receivedAt) => {
      setGameState(snapshot.state);
      setSportId(snapshot.state.sportId);
      setSnapshotTimerMs(snapshot.timerDisplayMs);
      setSnapshotReceivedAt(receivedAt);
      setLastSyncAt(Date.now());
    });

    client.connect(code);
  }

  function disconnect() {
    clientRef.current?.disconnect();
    setConnStatus("idle");
    setGameState(null);
  }

  const isActive = connStatus === "connected";

  return (
    <div className="controller-page">
      <div className="controller-header">
        <button className="text-btn" onClick={onBack}>← 뒤로</button>
        <h2>컨트롤러</h2>
      </div>

      {/* sport selection */}
      {!sportId && (
        <div className="select-screen">
          <h3>종목 선택</h3>
          <div className="sport-buttons">
            {ALL_SPORTS.map((s) => (
              <button key={s.id} className="sport-btn" onClick={() => setSportId(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* connection */}
      {sportId && (
        <div className="connection-row">
          <input
            className="room-code-input"
            value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
            placeholder="방코드 8자리"
            maxLength={8}
            disabled={connStatus !== "idle" && connStatus !== "disconnected"}
          />
          {connStatus === "idle" || connStatus === "disconnected" ? (
            <button className="primary-btn" onClick={connect} disabled={roomCodeInput.length < 8}>
              연결
            </button>
          ) : (
            <button className="danger-btn" onClick={disconnect}>끊기</button>
          )}
          <span className={`conn-badge ${connStatus}`}>{STATUS_LABEL[connStatus]}</span>
        </div>
      )}

      {connStatus === "disconnected" && (
        <p className="conn-hint">카메라 기기가 켜져 있는지 확인하세요. 자동으로 재연결을 시도합니다.</p>
      )}

      {lastSyncAt && (
        <p className="sync-time">마지막 동기화: {new Date(lastSyncAt).toLocaleTimeString()}</p>
      )}

      {/* controller panel */}
      {sport && gameState && (
        <div className={isActive ? "" : "panel-disabled"}>
          {!isActive && <div className="disabled-overlay">연결 후 조작 가능</div>}
          <sport.ControllerPanel
            state={gameState}
            timerDisplayMs={displayTimerMs}
            dispatch={isActive ? dispatch : () => {}}
          />
        </div>
      )}
    </div>
  );
}
