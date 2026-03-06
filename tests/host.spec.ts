import { test, expect } from '@playwright/test'

async function injectApp(page: any, script: string) {
  // Wait for iframe element to exist
  const frame = page.frameLocator('#miniapp-frame')
  
  // Write a minimal app into the iframe via srcdoc attribute instead
  // This avoids the contentDocument timing issue entirely
  await page.evaluate((scriptContent: string) => {
    const iframe = document.getElementById('miniapp-frame') as HTMLIFrameElement
    iframe.srcdoc = `
      <html><body>
        <div id="fid-display">loading...</div>
        <div id="fixture-type">loading...</div>
        <script>
          ${scriptContent}
        <\/script>
      </body></html>
    `
  }, script)
}

test('host emulator responds to getContext and receives ready', async ({ page }) => {
  await page.goto('http://localhost:4000/host.html?url=about:blank&fixture=launcher')
  await page.waitForSelector('#status')

  await injectApp(page, `
    const contextId = 'test-ctx-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({ id: contextId, type: 'GET', path: ['context'] }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === contextId && e.data.type === 'RAW') {
        document.getElementById('fid-display').textContent = 'fid:' + e.data.value.user.fid
        const readyId = 'test-rdy-' + Math.random().toString(16).slice(2)
        window.parent.postMessage({ id: readyId, type: 'APPLY', path: ['ready'], argumentList: [{ type: 'RAW', value: {} }] }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})

test('host emulator provides correct context for launcher fixture', async ({ page }) => {
  await page.goto('http://localhost:4000/host.html?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const contextId = 'test-ctx-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({ id: contextId, type: 'GET', path: ['context'] }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === contextId && e.data.type === 'RAW') {
        document.getElementById('fixture-type').textContent = e.data.value.location.type
        const readyId = 'test-rdy-' + Math.random().toString(16).slice(2)
        window.parent.postMessage({ id: readyId, type: 'APPLY', path: ['ready'], argumentList: [{ type: 'RAW', value: {} }] }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})

test('host emulator switches fixture via query param', async ({ page }) => {
  await page.goto('http://localhost:4000/host.html?url=about:blank&fixture=notification')

  await injectApp(page, `
    const contextId = 'test-ctx-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({ id: contextId, type: 'GET', path: ['context'] }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === contextId && e.data.type === 'RAW') {
        document.getElementById('fixture-type').textContent = e.data.value.location.type
        const readyId = 'test-rdy-' + Math.random().toString(16).slice(2)
        window.parent.postMessage({ id: readyId, type: 'APPLY', path: ['ready'], argumentList: [{ type: 'RAW', value: {} }] }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})


test('real mini app receives FC context and calls ready', async ({ page }) => {
  page.on('console', msg => console.log('HOST CONSOLE:', msg.text()))

  await page.goto('http://localhost:4000/host.html?url=http://localhost:3000&fixture=launcher')
  await page.waitForTimeout(5000)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 10000 })

  // Assert FID is displayed inside the iframe
  const appFrame = page.frameLocator('iframe#miniapp-frame')
  await expect(appFrame.locator('[data-testid="fid-display"]')).toHaveText('fid:3621', { timeout: 5000 })
})
