import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Stage } from "../stage";
import { BIOMES, ROLES } from "../shared/biomes";
import { useBand } from "./band";

const DRIFT_LABEL = ["Hold", "Drift", "Fly"];

export function App() {
  const stage = useMemo(() => new Stage(), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const snap = useSyncExternalStore(stage.subscribe, stage.getSnap);
  const band = useBand(stage);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __stage: Stage }).__stage = stage; // play-testing only
    stage.mount(canvas.current!);
    return () => stage.unmount();
  }, [stage]);

  const biome = BIOMES[snap.biome];

  return (
    <div className="app">
      <canvas ref={canvas} className="world" role="application" aria-label="Biome Synth. Tap creatures and the sky to play. Arrow keys travel, 1 to 7 play the band." />

      <div className="sr" aria-live="polite">
        {biome.name}
      </div>

      {snap.started && (
        <>
          <header className="hud top">
            <div className="where">
              <h1>{biome.name}</h1>
              <p>
                {snap.section}
                <span className={snap.sectionBy === "claude" ? "by claude" : "by"}>{snap.sectionBy === "claude" ? "claude" : "band"}</span>
              </p>
            </div>
            <div className="buttons">
              <button className="px" onClick={() => stage.cycleDrift()} aria-label={`Camera: ${DRIFT_LABEL[snap.drift]}`}>
                {DRIFT_LABEL[snap.drift]}
              </button>
              <button className={`px ${snap.bandMode !== "local" ? "on" : ""}`} onClick={band.toggle} aria-pressed={snap.bandMode !== "local"}>
                {snap.bandMode === "waking" ? "Waking" : snap.bandMode === "claude" ? "AI band" : "Wake AI"}
              </button>
              <button className="px" onClick={() => stage.toggleHelp()} aria-label="Help">
                ?
              </button>
            </div>
          </header>

          <nav className="hud map" aria-label="Travel">
            {BIOMES.map((b, i) => (
              <button key={b.id} className={`chip ${i === snap.biome ? "here" : ""}`} onClick={() => stage.goTo(i)} style={{ opacity: 0.55 + 0.45 * snap.weights[i] }}>
                {b.name}
              </button>
            ))}
            <i className="marker" style={{ left: `${snap.pos * 100}%` }} />
          </nav>
          {band.note && <p className="hud note">{band.note}</p>}
        </>
      )}

      {!snap.started && (
        <button className="title" onClick={() => void stage.start()}>
          <span className="logo">Biome Synth</span>
          <span className="tap">Tap to play</span>
          <span className="hint">Headphones on</span>
        </button>
      )}

      {snap.help && (
        <div className="help" role="dialog" aria-label="How to play" onClick={() => stage.toggleHelp(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <ul>
              <li>Tap a creature: it plays its part, in key</li>
              <li>Tap or slide across the sky: you lead, the world answers</li>
              <li>Hold a flower, crystal or sign: the chord rings</li>
              <li>Arrows, scroll or the map: travel between biomes</li>
              <li>
                1 to 7: {ROLES.join(", ")}
              </li>
              <li>D: drift speed. H: this help</li>
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
