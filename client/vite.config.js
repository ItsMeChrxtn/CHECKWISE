import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * `--mode mobile` serves the app over HTTPS on the local network, which is the
 * only way the camera scanner works on a phone: browsers only hand out a camera
 * in a secure context, and a plain http:// address on the LAN is not one.
 *
 * A mode flag rather than an env var keeps the command identical on every OS.
 */
export default defineConfig(({ mode }) => {
  const mobile = mode === "mobile";

  return {
    plugins: [react(), tailwindcss(), ...(mobile ? [basicSsl()] : [])],
    server: {
      port: 5173,
      // Reachable from a phone on the same Wi-Fi when serving over HTTPS.
      host: mobile ? true : "localhost",
      // Proxying keeps the browser on one origin in development, so cookies and
      // relative /uploads paths behave exactly as they will in production.
      proxy: {
        "/api": { target: "http://localhost:5000", changeOrigin: true },
        "/uploads": { target: "http://localhost:5000", changeOrigin: true },
      },
    },
  };
});
