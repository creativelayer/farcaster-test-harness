import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  use: {
    headless: true,
  },
  webServer: [
    {
      command: 'npx serve . -p 4000',
      port: 4000,
      reuseExistingServer: true,
    },
    {
      command: 'node bin/quick-auth-server.js 4100',
      port: 4100,
      reuseExistingServer: true,
      stdout: 'pipe',
    },
  ],
})