import { useState } from "react";
import { CameraPage } from "../camera/CameraPage";
import { ControllerPage } from "../controller/ControllerPage";

type Mode = "home" | "camera" | "controller";

export function App() {
  const [mode, setMode] = useState<Mode>("home");

  if (mode === "camera") return <CameraPage onBack={() => setMode("home")} />;
  if (mode === "controller") return <ControllerPage onBack={() => setMode("home")} />;

  return (
    <div className="home-screen">
      <div className="home-inner">
        <h1 className="app-title">⚽ 스포츠 중계 카메라</h1>
        <p className="app-subtitle">학교 스포츠클럽 경기를 TV 중계 스타일로 촬영하세요</p>
        <div className="mode-buttons">
          <button className="mode-btn camera-mode-btn" onClick={() => setMode("camera")}>
            <span className="mode-icon">📷</span>
            <span className="mode-label">카메라</span>
            <span className="mode-desc">영상 촬영·녹화 담당</span>
          </button>
          <button className="mode-btn controller-mode-btn" onClick={() => setMode("controller")}>
            <span className="mode-icon">🎮</span>
            <span className="mode-label">컨트롤러</span>
            <span className="mode-desc">점수·타이머 조작 담당</span>
          </button>
        </div>
      </div>
    </div>
  );
}
