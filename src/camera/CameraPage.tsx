import { useEffect, useRef, useState, useCallback, useReducer } from "react";
import type { DataConnection } from "peerjs";
import type { SportId, GameState, GameAction } from "../game/types";
import { getSport, ALL_SPORTS } from "../game/sports";
import { calcTimerDisplayMs } from "../game/reducer";
import { CameraCanvas } from "./CameraCanvas";
import { Recorder, downloadSegment, revokeSegment } from "./Recorder";
import type { RecorderSegment } from "./Recorder";
import { PeerHost } from "../realtime/peerHost";

type CameraStatus = "idle" | "requesting" | "active" | "denied" | "mock";

type PendingConn = { conn: DataConnection; clientId: string; deviceName?: string };

function getCameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "카메라 권한이 허용되지 않았습니다. 브라우저 주소창 옆 자물쇠 아이콘에서 카메라를 허용한 뒤 다시 시도하세요.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "사용 가능한 카메라를 찾지 못했습니다. 기기에 카메라가 연결되어 있고 다른 앱에서 사용 중이 아닌지 확인하세요.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "카메라를 시작하지 못했습니다. 다른 앱이 카메라를 사용 중이면 닫고 다시 시도하세요.";
    }
  }

  return "카메라를 시작하지 못했습니다. 브라우저 권한과 기기 카메라 상태를 확인한 뒤 다시 시도하세요.";
}

export function CameraPage({ onBack }: { onBack: () => void }) {
  const [sportId, setSportId] = useState<SportId | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraError, setCameraError] = useState("");
  const [micEnabled, setMicEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [segments, setSegments] = useState<RecorderSegment[]>([]);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [controllerConnected, setControllerConnected] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [visibilityWarning, setVisibilityWarning] = useState(false);
  const [consentShown, setConsentShown] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const hostRef = useRef<PeerHost | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef(0);

  const sport = sportId ? getSport(sportId) : null;

  const [gameState, dispatchGame] = useReducer(
    (s: GameState, a: GameAction) => sport ? sport.reduce(s, a) : s,
    null as unknown as GameState
  );

  // init game state when sport selected
  useEffect(() => {
    if (sport && !gameState) {
      dispatchGame({ type: "TIMER_RESET" }); // triggers re-render with initial state
    }
  }, [sport, gameState]);

  // actual init via separate ref trick
  const gameStateRef = useRef<GameState | null>(null);
  const [gameStateLive, setGameStateLive] = useState<GameState | null>(null);

  const dispatchGameAction = useCallback((action: GameAction) => {
    if (!sport || !gameStateRef.current) return;
    const next = sport.reduce(gameStateRef.current, action);
    gameStateRef.current = next;
    setGameStateLive(next);
    // send snapshot to controller
    if (hostRef.current) {
      hostRef.current.sendSnapshot({
        state: next,
        hostTime: Date.now(),
        timerDisplayMs: calcTimerDisplayMs(next),
      });
    }
  }, [sport]);

  // initialize game state when sport chosen
  useEffect(() => {
    if (sport) {
      const initial = sport.initialState();
      gameStateRef.current = initial;
      setGameStateLive(initial);
    }
  }, [sport]);

  useEffect(() => {
    if (cameraStatus !== "active" || !videoRef.current || !streamRef.current) return;

    const stream = streamRef.current;
    attachStreamToVideo(stream);

    return () => {
      const video = videoRef.current;
      if (video?.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [cameraStatus]);

  // wake lock support detection
  useEffect(() => {
    setWakeLockSupported("wakeLock" in navigator);
  }, []);

  // visibility change
  useEffect(() => {
    const handler = () => {
      if (document.hidden && isRecording) {
        setVisibilityWarning(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isRecording]);

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (segments.length > 0 || isRecording) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [segments.length, isRecording]);

  // PeerHost setup
  useEffect(() => {
    if (!sportId) return;
    const host = new PeerHost();
    hostRef.current = host;

    host.on("ready", (code) => setRoomCode(code));
    host.on("connectionRequest", (clientId, deviceName, conn) => {
      setPendingConn({ conn, clientId, deviceName });
    });
    host.on("action", (msg) => {
      dispatchGameAction(msg.action);
    });
    host.on("controllerDisconnected", () => setControllerConnected(false));
    host.on("controllerReplaced", () => {});

    host.start();
    return () => host.destroy();
  }, [sportId, dispatchGameAction]);

  function attachStreamToVideo(stream: MediaStream) {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    video.muted = true;
    video.playsInline = true;
    video.play().catch(() => {});
  }

  async function requestCamera() {
    setCameraStatus("requesting");
    setCameraError("");

    if (!window.isSecureContext) {
      setCameraError("카메라는 HTTPS 주소 또는 localhost에서만 사용할 수 있습니다. 배포 주소가 https://로 열렸는지 확인하세요.");
      setCameraStatus("denied");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("이 브라우저는 카메라 권한 요청을 지원하지 않습니다. Chrome, Edge, Safari 최신 버전에서 다시 시도하세요.");
      setCameraStatus("denied");
      return;
    }

    const tryConstraints = async (width: number, height: number) => {
      return navigator.mediaDevices.getUserMedia({
        audio: micEnabled,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: 30, max: 30 },
        },
      });
    };

    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const [w, h] of [[1280, 720], [960, 540], [640, 480]]) {
      try {
        stream = await tryConstraints(w, h);
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
          break;
        }
        // try lower resolution
      }
    }
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: micEnabled, video: true });
      } catch (error) {
        setCameraStatus("denied");
        setCameraError(getCameraErrorMessage(error || lastError));
        return;
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = stream;
    attachStreamToVideo(stream);
    setCameraStatus("active");
  }

  async function acquireWakeLock() {
    if (!wakeLockSupported) return;
    try {
      wakeLockRef.current = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockActive(false);
        // try re-acquire
        acquireWakeLock();
      });
    } catch {
      setWakeLockActive(false);
    }
  }

  function releaseWakeLock() {
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    setWakeLockActive(false);
  }

  function switchCamera() {
    if (isRecording) return;
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraStatus("idle");
  }

  function startRecording() {
    if (!canvasRef.current || !gameStateLive || !sport) return;
    const canvas = canvasRef.current;
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (micEnabled && streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => tracks.push(t));
    }
    const finalStream = new MediaStream(tracks);

    if (!recorderRef.current) {
      recorderRef.current = new Recorder((seg) => {
        setSegments((prev) => [...prev, seg]);
        // auto-download attempt
        try {
          downloadSegment(seg);
        } catch {
          // blocked, stays in list
        }
      });
    }
    recorderRef.current.setMeta(sport.label, gameStateLive.homeTeam, gameStateLive.awayTeam);
    recorderRef.current.startSegment(finalStream, gameStateLive.period);
    setIsRecording(true);
    recordingStartRef.current = performance.now();
    recordingTimerRef.current = setInterval(() => {
      setRecordingMs(performance.now() - recordingStartRef.current);
    }, 500);
    acquireWakeLock();
  }

  function stopRecording() {
    recorderRef.current?.stopSegment();
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    releaseWakeLock();
  }

  function splitSegment() {
    if (!recorderRef.current || !gameStateLive || !canvasRef.current || !sport) return;
    recorderRef.current.stopSegment();
    // start new segment immediately
    const canvas = canvasRef.current;
    const canvasStream = canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (micEnabled && streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => tracks.push(t));
    }
    const finalStream = new MediaStream(tracks);
    recorderRef.current.startSegment(finalStream, gameStateLive.period);
  }

  function deleteSegment(id: string) {
    setSegments((prev) => {
      const seg = prev.find((s) => s.id === id);
      if (seg) revokeSegment(seg);
      return prev.filter((s) => s.id !== id);
    });
  }

  function regenerateRoomCode() {
    if (!gameStateLive) return;
    hostRef.current?.regenerateRoomCode({
      state: gameStateLive,
      hostTime: Date.now(),
      timerDisplayMs: calcTimerDisplayMs(gameStateLive),
    });
    setControllerConnected(false);
    setPendingConn(null);
  }

  function approveController() {
    if (!pendingConn || !gameStateLive) return;
    hostRef.current?.approveController(pendingConn.conn, {
      state: gameStateLive,
      hostTime: Date.now(),
      timerDisplayMs: calcTimerDisplayMs(gameStateLive),
    });
    setControllerConnected(true);
    setPendingConn(null);
  }

  function rejectController() {
    if (!pendingConn) return;
    hostRef.current?.rejectController(pendingConn.conn);
    setPendingConn(null);
  }

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  const cameraFeed = (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      aria-hidden="true"
      tabIndex={-1}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );

  // ── Consent screen ──
  if (!consentShown) {
    return (
      <div className="consent-screen">
        <h2>촬영 전 안내</h2>
        <ul>
          <li>녹화 전 참가자 또는 보호자의 동의가 필요합니다.</li>
          <li>촬영 파일은 이 기기에만 로컬 저장되며 클라우드에 업로드되지 않습니다.</li>
          <li>파일의 보관, 공유, 삭제 책임은 촬영 담당자 또는 학교 담당자에게 있습니다.</li>
          <li>공개 공유 시 학교 내부 규정과 초상권/개인정보 동의 절차를 따르세요.</li>
          <li>경기 종료 후 불필요한 파일은 삭제를 권장합니다.</li>
        </ul>
        <button className="primary-btn" onClick={() => setConsentShown(true)}>
          확인하고 시작
        </button>
        <button className="text-btn" onClick={onBack}>
          돌아가기
        </button>
      </div>
    );
  }

  // ── Sport selection ──
  if (!sportId) {
    return (
      <div className="select-screen">
        <h2>종목 선택</h2>
        <div className="sport-buttons">
          {ALL_SPORTS.map((s) => (
            <button key={s.id} className="sport-btn" onClick={() => setSportId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <button className="text-btn" onClick={onBack}>
          돌아가기
        </button>
      </div>
    );
  }

  // ── Camera permission / setup ──
  if (cameraStatus === "idle" || cameraStatus === "requesting" || cameraStatus === "denied") {
    return (
      <div className="setup-page">
        {cameraFeed}
        {/* 상단 방코드 — 컨트롤러가 먼저 연결 가능하도록 항상 노출 */}
        <div className="setup-roomcode-bar">
          <span>방코드</span>
          <strong className="setup-roomcode">{roomCode || "생성 중…"}</strong>
          <span className={`conn-status ${controllerConnected ? "connected" : "disconnected"}`}>
            {controllerConnected ? "● 컨트롤러 연결됨" : "○ 컨트롤러 대기"}
          </span>
        </div>

        {/* 컨트롤러 승인 요청 */}
        {pendingConn && (
          <div className="approval-dialog">
            <p>컨트롤러 연결 요청</p>
            <p className="device-name">{pendingConn.deviceName ?? pendingConn.clientId}</p>
            <div className="approval-buttons">
              <button className="primary-btn" onClick={approveController}>승인</button>
              <button className="danger-btn" onClick={rejectController}>거절</button>
            </div>
          </div>
        )}

        <div className="setup-body">
          <h2>{sport?.label} 카메라 준비</h2>

          {cameraStatus === "denied" && (
            <p className="setup-error">
              ⚠️ {cameraError || "카메라 권한이 거부되었습니다. 브라우저 주소창 옆 자물쇠 아이콘에서 카메라를 허용하세요."}
            </p>
          )}

          <label className="toggle-label">
            <input type="checkbox" checked={micEnabled} onChange={(e) => setMicEnabled(e.target.checked)} />
            {micEnabled ? "마이크 ON (현장음 녹음)" : "마이크 OFF (기본)"}
          </label>

          <button
            className="primary-btn"
            disabled={cameraStatus === "requesting"}
            onClick={requestCamera}
          >
            {cameraStatus === "requesting" ? "카메라 요청 중…" : "카메라 시작"}
          </button>

          <div className="setup-divider">또는</div>

          <button className="mock-btn" onClick={() => setCameraStatus("mock")}>
            🖥️ 테스트 모드 (카메라 없이)
          </button>
          <p className="setup-hint">PC에서 오버레이·컨트롤러 연동을 확인할 때 사용</p>

          <button className="text-btn" onClick={() => setSportId(null)}>← 종목 변경</button>
        </div>
      </div>
    );
  }

  // ── Main camera view (active or mock) ──
  return (
    <div className="camera-page">
      {cameraFeed}

      {/* recording canvas */}
      <div className="canvas-wrapper">
        {gameStateLive && sport && (
          <CameraCanvas
            videoRef={videoRef}
            sport={sport}
            gameState={gameStateLive}
            canvasRef={canvasRef}
          />
        )}
        {isRecording && <div className="rec-indicator">● REC</div>}
      </div>

      {/* DOM status layer */}
      <div className="status-bar">
        <span className="room-code">방코드: <strong>{roomCode || "…"}</strong></span>
        <span className={`conn-status ${controllerConnected ? "connected" : "disconnected"}`}>
          {controllerConnected ? "● 연결됨" : "○ 대기"}
        </span>
        {wakeLockSupported && (
          <span className={`wakelock-status ${wakeLockActive ? "active" : "inactive"}`}>
            {wakeLockActive ? "화면유지 ON" : "화면유지 OFF"}
          </span>
        )}
        {!wakeLockSupported && (
          <span className="wakelock-warn">설정→화면→자동잠금→안함</span>
        )}
      </div>

      {visibilityWarning && (
        <div className="warning-banner">
          ⚠️ 앱이 백그라운드로 전환되었습니다. 녹화가 중단될 수 있습니다.
          <button onClick={() => setVisibilityWarning(false)}>확인</button>
        </div>
      )}

      {/* controller approval */}
      {pendingConn && (
        <div className="approval-dialog">
          <p>컨트롤러 연결 요청</p>
          <p className="device-name">{pendingConn.deviceName ?? pendingConn.clientId}</p>
          <div className="approval-buttons">
            <button className="primary-btn" onClick={approveController}>승인</button>
            <button className="danger-btn" onClick={rejectController}>거절</button>
          </div>
        </div>
      )}

      {/* controls */}
      <div className="camera-controls">
        <div className="controls-row">
          {!isRecording ? (
            <button className="rec-btn" onClick={startRecording}>● 녹화 시작</button>
          ) : (
            <>
              <button className="stop-btn" onClick={stopRecording}>■ 녹화 종료</button>
              <button className="split-btn" onClick={splitSegment}>분할 저장</button>
            </>
          )}
          {isRecording && (
            <span className="rec-time">{formatMs(recordingMs)}</span>
          )}
        </div>

        <div className="controls-row">
          <button onClick={switchCamera} disabled={isRecording} title={isRecording ? "녹화 중지 후 전환 가능" : ""}>
            카메라 전환
          </button>
          <button onClick={regenerateRoomCode}>방코드 재생성</button>
          {controllerConnected && (
            <button onClick={() => hostRef.current?.disconnectController()}>컨트롤러 해제</button>
          )}
        </div>

        <div className="mic-row">
          <label>
            <input
              type="checkbox"
              checked={micEnabled}
              onChange={(e) => setMicEnabled(e.target.checked)}
              disabled={isRecording}
            />
            마이크 {micEnabled ? "ON" : "OFF"}
            {isRecording && " (다음 세그먼트부터 적용)"}
          </label>
        </div>
      </div>

      {/* pending segments */}
      {segments.length > 0 && (
        <div className="segment-list">
          <h4>저장 대기 영상 ({segments.length}개)</h4>
          {segments.length >= 2 && (
            <p className="segment-warn">⚠️ 저장하지 않은 영상이 쌓이고 있습니다. 저장하거나 삭제하세요.</p>
          )}
          {segments.map((seg) => (
            <div key={seg.id} className="segment-item">
              <span>{seg.filename}</span>
              <button onClick={() => downloadSegment(seg)}>저장</button>
              <button className="danger-btn" onClick={() => deleteSegment(seg.id)}>삭제</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
