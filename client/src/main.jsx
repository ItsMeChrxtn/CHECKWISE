import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/*
 * Registered in production only.
 *
 * In development the dev server is the source of truth and a worker sitting in
 * front of it only produces confusing stale reloads. In production it is what
 * makes the site installable to a home screen, which is how CheckWise reaches
 * an iPhone at all - Apple allows no other way without a paid account.
 *
 * A failed registration is not worth interrupting anyone over. The site works
 * exactly as before without it; only installing and offline are lost.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
