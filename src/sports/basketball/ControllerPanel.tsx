import type { GameState, GameAction } from "../../game/types";
import { formatTimer } from "../../game/reducer";

type Props = {
  state: GameState;
  timerDisplayMs: number;
  dispatch: (action: GameAction) => void;
};

export function BasketballControllerPanel({ state, timerDisplayMs, dispatch }: Props) {
  const periods = ["1Q", "2Q", "3Q", "4Q"];
  const isRunning = state.timer.status === "running";

  return (
    <div className="controller-panel">
      <div className="score-row">
        <div className="team-block">
          <input
            className="team-name-input"
            value={state.homeTeam}
            onChange={(e) => dispatch({ type: "SET_HOME_TEAM", name: e.target.value })}
            placeholder="홈팀"
          />
          <div className="score-display">{state.homeScore}</div>
          <div className="score-buttons">
            {[3, 2, 1].map((d) => (
              <button key={d} onClick={() => dispatch({ type: "HOME_SCORE", delta: d })}>
                +{d}
              </button>
            ))}
            <button className="minus-btn" onClick={() => dispatch({ type: "HOME_SCORE", delta: -1 })}>
              -1
            </button>
          </div>
        </div>

        <div className="score-sep">:</div>

        <div className="team-block">
          <input
            className="team-name-input"
            value={state.awayTeam}
            onChange={(e) => dispatch({ type: "SET_AWAY_TEAM", name: e.target.value })}
            placeholder="원정팀"
          />
          <div className="score-display">{state.awayScore}</div>
          <div className="score-buttons">
            {[3, 2, 1].map((d) => (
              <button key={d} onClick={() => dispatch({ type: "AWAY_SCORE", delta: d })}>
                +{d}
              </button>
            ))}
            <button className="minus-btn" onClick={() => dispatch({ type: "AWAY_SCORE", delta: -1 })}>
              -1
            </button>
          </div>
        </div>
      </div>

      <div className="period-row">
        {periods.map((p) => (
          <button
            key={p}
            className={state.period === p ? "period-btn active" : "period-btn"}
            onClick={() => dispatch({ type: "SET_PERIOD", period: p })}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="timer-row">
        <span className="timer-display">{formatTimer(timerDisplayMs)}</span>
        <div className="timer-buttons">
          {isRunning ? (
            <button onClick={() => dispatch({ type: "TIMER_PAUSE" })}>일시정지</button>
          ) : (
            <button onClick={() => dispatch({ type: "TIMER_START" })}>시작</button>
          )}
          <button onClick={() => dispatch({ type: "TIMER_RESET" })}>초기화</button>
        </div>
      </div>
    </div>
  );
}
