import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [cesium(), tailwindcss()],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
});
