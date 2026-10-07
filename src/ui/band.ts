// The AI band toggle. Step 6 wires Claude in; until then it says the band is local.
import { useState } from "react";
import type { Stage } from "../stage";

export function useBand(stage: Stage) {
  const [note, setNote] = useState<string | null>(null);
  const toggle = () => {
    if (stage.snap.bandMode !== "local") {
      stage.setComposer(null, "local");
      setNote(null);
      return;
    }
    setNote("AI band is not connected yet");
    setTimeout(() => setNote(null), 2500);
  };
  return { toggle, note };
}
