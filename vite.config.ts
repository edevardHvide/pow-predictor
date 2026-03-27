import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";
import { version } from "./package.json";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [cesium(), tailwindcss()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  server: {
    proxy: {
      "/api/nve": {
        target: "https://gts.nve.no",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nve/, "/api"),
      },
      "/api/conditions-summary": {
        target: "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com",
        changeOrigin: true,
      },
      "/api/feedback": {
        target: "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com",
        changeOrigin: true,
      },
      "/api/errors": {
        target: "https://1uv0uf8m0g.execute-api.eu-north-1.amazonaws.com",
        changeOrigin: true,
      },
    },
  },
});
