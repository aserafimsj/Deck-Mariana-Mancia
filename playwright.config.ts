import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

// Requer o build de teste antes (o script `pnpm test:e2e` já faz isso) e o banco de teste (`pnpm db:e2e`).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "celular", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    // Banco local (scripts/db-setup.mjs) e login local de teste. O build precisa de NEXT_PUBLIC_DEV_AUTH=1.
    env: {
      SUPABASE_DB_URL: process.env.E2E_DB_URL ?? "postgres://postgres@localhost:54329/scragbadum_e2e",
      DEV_AUTH_SECRET: "e2e-segredo-local-0123456789",
    },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
