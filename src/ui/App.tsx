import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Stage } from "../stage";
import { BIOMES } from "../shared/biomes";
import { canRecord } from "./recorder";

const DRIFT_LABEL = ["Hold", "Drift", "Fly"];
const COACH = ["Tap a creature", "Slide across the sky", "Flick to throw a star", "Travel: tap a place on the map"];

export function App() {
  // Painting the world takes a moment: show the loader first, then build the stage.
  const [stage, setStage] = useState<Stage | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setStage(new Stage()), 30);
    return () => clearTimeout(id);
  }, []);
  return (
    <Boundary>
      {stage ? <Game stage={stage} /> : <Loader />}
    </Boundary>
  );
}

function Loader() {
  return (
    <div className="loader" role="status">
      <span className="logo">Biome Synth</span>
      <span className="dots" aria-label="Painting the world">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fatal">
        <p>Something broke while painting the world.</p>
        <button className="px" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

function Game({ stage }: { stage: Stage }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const snap = useSyncExternalStore(stage.subscribe, stage.getSnap);
  const [recOk] = useState(canRecord);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __stage: Stage }).__stage = stage; // play-testing only
    stage.mount(canvas.current!);
    return () => stage.unmount();
  }, [stage]);

  const biome = BIOMES[snap.biome];
  const p = snap.prefs;

  return (
    <div className="app">
      <canvas ref={canvas} className="world" role="application" aria-label="Biome Synth. Tap creatures and the sky to play. Arrow keys travel, 1 to 7 play the band, M mutes, R records." />

      <div className="sr" aria-live="polite">
        {biome.name}. {snap.genre}.
      </div>

      {snap.started && (
        <>
          <header className="hud top">
            <div className="where">
              <h1>{biome.name}</h1>
              <p className="genre">{snap.bridging ? "crossing over" : `${snap.genre} · ${snap.bpm} bpm`}</p>
              <p className="section">
                {snap.title ?? snap.section}
                <span className={snap.sectionBy === "you" ? "by you" : "by"}>{snap.sectionBy === "you" ? "your theme" : "band"}</span>
              </p>
            </div>
            <div className="buttons">
              {recOk && (
                <button className={`px rec ${snap.recording !== null ? "on" : ""}`} onClick={() => void stage.toggleRecording()} aria-pressed={snap.recording !== null}>
                  {snap.recording !== null ? `Stop ${snap.recording}s` : "Rec"}
                </button>
              )}
              <button className={`px ${p.muted ? "on" : ""}`} onClick={() => stage.toggleMute()} aria-pressed={p.muted} aria-label={p.muted ? "Unmute" : "Mute"}>
                {p.muted ? "Muted" : "Sound"}
              </button>
              <button className="px" onClick={() => stage.toggleMenu()} aria-expanded={snap.menu} aria-controls="menu">
                Menu
              </button>
            </div>
          </header>

          {snap.menu && (
            <div id="menu" className="menu panel" role="dialog" aria-label="Menu">
              <label className="row">
                <span>Volume</span>
                <input type="range" min={0} max={1} step={0.01} value={p.muted ? 0 : p.volume} onChange={(e) => stage.setVolume(Number(e.target.value))} aria-label="Volume" />
              </label>
              <div className="row">
                <span>Camera</span>
                <button className="px small" onClick={() => stage.cycleDrift()}>
                  {DRIFT_LABEL[snap.drift]}
                </button>
              </div>
              <div className="row">
                <span>Motion</span>
                <div className="seg" role="radiogroup" aria-label="Motion">
                  {(["auto", "full", "reduced"] as const).map((m) => (
                    <button key={m} role="radio" aria-checked={p.motion === m} className={`px small ${p.motion === m ? "on" : ""}`} onClick={() => stage.setMotion(m)}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row">
                <button className="px small" onClick={() => stage.toggleHelp(true)}>
                  How to play
                </button>
                <button className="px small" onClick={() => stage.toggleMenu(false)}>
                  Close
                </button>
              </div>
            </div>
          )}

          <nav className="hud map" aria-label="Travel">
            {BIOMES.map((b, i) => (
              <button key={b.id} className={`chip ${i === snap.biome ? "here" : ""} ${snap.coach === 3 ? "pulse" : ""}`} onClick={() => stage.goTo(i)} style={{ opacity: 0.55 + 0.45 * snap.weights[i] }}>
                {b.name}
              </button>
            ))}
            <i className="marker" style={{ left: `${snap.pos * 100}%` }} />
          </nav>

          {snap.coach < 4 && (
            <>
              {snap.coach === 0 && snap.coachAt && <i className="arrow" style={{ left: snap.coachAt.x, top: snap.coachAt.y }} aria-hidden />}
              <div className="hud coach" role="status">
                <span>{COACH[snap.coach]}</span>
                <button className="px small" onClick={() => stage.skipCoach()}>
                  Skip
                </button>
              </div>
            </>
          )}

          {snap.toast && <p className="hud note">{snap.toast}</p>}
        </>
      )}

      {!snap.started && !snap.error && (
        <button className="title" onClick={() => void stage.start()}>
          <span className="logo">Biome Synth</span>
          <span className="sub">A pixel world you play</span>
          <span className="tap">Tap to play</span>
          <span className="hint">Headphones on</span>
        </button>
      )}

      {snap.error && (
        <div className="fatal" role="alert">
          <p>{snap.error}</p>
        </div>
      )}

      {snap.help && (
        <div className="help" role="dialog" aria-label="How to play" onClick={() => stage.toggleHelp(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <ul>
              <li>Tap a creature: it plays its part, in key</li>
              <li>Slide across the sky to lead; sweep over creatures to strum them</li>
              <li>Flick to throw a star that plays a cascade</li>
              <li>Travel with the map, the arrows or a scroll: each place is its own music</li>
              <li>Leave it alone and the creatures play by themselves</li>
              <li>Keys: 1 to 7 play the band, M mute, R record, D camera, H help</li>
            </ul>
            <button className="px" onClick={() => stage.toggleHelp(false)}>
              Play
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
