import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The hosted development container ships Chromium at a fixed path; CI installs
// the browser Playwright expects instead.
const localChromium = '/opt/pw-browsers/chromium';
const launchOptions = !process.env.CI && existsSync(localChromium) ? { executablePath: localChromium } : {};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    viewport: { width: 1400, height: 900 },
    launchOptions,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions },
    },
  ],
});
