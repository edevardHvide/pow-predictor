import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    launchOptions: {
      args: [
        "--use-gl=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blacklist",
        "--disable-gpu-sandbox",
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan",
      ],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
