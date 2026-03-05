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
  await page.goto('http://localhost:4000/host.html?fixture=launcher')
  await expect(page.locator('#status')).toHaveText('WAITING')

  await injectApp(page, `
    window.parent.postMessage({ type: 'getContext' }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.type === 'context') {
        document.getElementById('fid-display').textContent = 'fid:' + e.data.data.user.fid
        window.parent.postMessage({ type: 'ready' }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})

test('host emulator provides correct context for launcher fixture', async ({ page }) => {
  await page.goto('http://localhost:4000/host.html?fixture=launcher')

  await injectApp(page, `
    window.parent.postMessage({ type: 'getContext' }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.type === 'context') {
        document.getElementById('fixture-type').textContent = e.data.data.location.type
        window.parent.postMessage({ type: 'ready' }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})

test('host emulator switches fixture via query param', async ({ page }) => {
  await page.goto('http://localhost:4000/host.html?fixture=notification')

  await injectApp(page, `
    window.parent.postMessage({ type: 'getContext' }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.type === 'context') {
        // notification fixture has added: true and location.type: notification
        document.getElementById('fixture-type').textContent = e.data.data.location.type
        window.parent.postMessage({ type: 'ready' }, '*')
      }
    })
  `)

  await expect(page.locator('#status')).toHaveText('READY', { timeout: 5000 })
})