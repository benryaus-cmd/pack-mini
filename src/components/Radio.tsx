import { useSyncExternalStore } from "react";
import { radio } from "../services/radio";
export function RadioButton() {
  const s = useSyncExternalStore(radio.subscribe, radio.snapshot);
  const on = s.status === "playing" || s.status === "loading";
  return (
    <button
      className="mini-radio"
      aria-label={on ? "Pause PopTron radio" : "Play PopTron radio"}
      title="SomaFM PopTron · session only"
      onClick={() => (on ? radio.pause() : radio.play())}
    >
      {s.status === "loading"
        ? "♫ …"
        : on
          ? "♫ ON"
          : s.status === "error"
            ? "♫ RETRY"
            : "♫ OFF"}
    </button>
  );
}
