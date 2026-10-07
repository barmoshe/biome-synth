import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import "./ui/app.css";

createRoot(document.getElementById("root")!).render(<App />);

// Offline after the first visit (production only: the dev server must never be cached).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
