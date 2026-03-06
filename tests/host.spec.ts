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
        <div id="result">waiting...</div>
        <script>
          ${scriptContent}
        <\/script>
      </body></html>
    `
  }, script)
}

// ── Existing Tests ─────────────────────────────────────────────────────

test('host emulator responds to getContext and receives ready', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')
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
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

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
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=notification')

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

// ── SWIF (Sign In With Farcaster) Tests ────────────────────────────────

test('signIn returns proper SIWE message with result wrapper', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const signInId = 'test-signin-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: signInId,
      type: 'APPLY',
      path: ['signIn'],
      argumentList: [{ type: 'RAW', value: { nonce: 'test-nonce-abc123', acceptAuthAddress: true } }]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === signInId && e.data.type === 'RAW') {
        const v = e.data.value
        const parts = []
        // Check result wrapper exists
        if (v.result) parts.push('has-result')
        if (v.result?.authMethod === 'custody') parts.push('custody')
        if (v.result?.signature === '0xmock_signature_test-nonce-abc123') parts.push('sig-ok')
        if (v.result?.message?.includes('Farcaster Auth')) parts.push('siwe-ok')
        if (v.result?.message?.includes('Nonce: test-nonce-abc123')) parts.push('nonce-ok')
        if (v.result?.message?.includes('farcaster://fid/3621')) parts.push('fid-ok')
        document.getElementById('result').textContent = parts.join(',')
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText(
    'has-result,custody,sig-ok,siwe-ok,nonce-ok,fid-ok',
    { timeout: 5000 }
  )
})

// ── getCapabilities / getChains Tests ──────────────────────────────────

test('getCapabilities returns supported capabilities', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const capsId = 'test-caps-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: capsId,
      type: 'APPLY',
      path: ['getCapabilities'],
      argumentList: []
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === capsId && e.data.type === 'RAW') {
        const caps = e.data.value
        const parts = []
        if (Array.isArray(caps)) parts.push('is-array')
        if (caps.includes('wallet.getEthereumProvider')) parts.push('has-eth')
        if (caps.includes('actions.signIn')) parts.push('has-signin')
        if (caps.includes('actions.ready')) parts.push('has-ready')
        document.getElementById('result').textContent = parts.join(',')
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText(
    'is-array,has-eth,has-signin,has-ready',
    { timeout: 5000 }
  )
})

test('getChains returns CAIP-2 chain identifiers', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const chainsId = 'test-chains-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: chainsId,
      type: 'APPLY',
      path: ['getChains'],
      argumentList: []
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === chainsId && e.data.type === 'RAW') {
        const chains = e.data.value
        const parts = []
        if (Array.isArray(chains)) parts.push('is-array')
        if (chains.includes('eip155:10')) parts.push('has-op')
        if (chains.includes('eip155:8453')) parts.push('has-base')
        document.getElementById('result').textContent = parts.join(',')
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText(
    'is-array,has-op,has-base',
    { timeout: 5000 }
  )
})

// ── Wallet / ethProvider Tests ─────────────────────────────────────────

test('ethProviderRequestV2 returns accounts and chainId', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const results = {}
    let pending = 2

    function checkDone() {
      pending--
      if (pending <= 0) {
        document.getElementById('result').textContent = Object.entries(results).map(([k,v]) => k + ':' + v).join(',')
      }
    }

    window.addEventListener('message', (e) => {
      if (e.data.type !== 'RAW') return
      if (e.data.id === reqAccId) {
        const rpc = e.data.value
        if (rpc.result && rpc.result[0] === '0x1234567890abcdef1234567890abcdef12345678') {
          results.accounts = 'ok'
        } else {
          results.accounts = 'fail'
        }
        checkDone()
      }
      if (e.data.id === chainId) {
        const rpc = e.data.value
        if (rpc.result === '0xa') {
          results.chain = 'ok'
        } else {
          results.chain = 'fail:' + rpc.result
        }
        checkDone()
      }
    })

    const reqAccId = 'test-acc-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: reqAccId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 1, method: 'eth_requestAccounts', params: [] } }]
    }, '*')

    const chainId = 'test-chain-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: chainId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 2, method: 'eth_chainId', params: [] } }]
    }, '*')
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText(
    'accounts:ok,chain:ok',
    { timeout: 5000 }
  )
})

test('ethProvider personal_sign returns deterministic mock signature', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const signId = 'test-psign-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: signId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: {
        jsonrpc: '2.0', id: 1,
        method: 'personal_sign',
        params: ['0x48656c6c6f', '0x1234567890abcdef1234567890abcdef12345678']
      }}]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === signId && e.data.type === 'RAW') {
        const rpc = e.data.value
        if (rpc.result && rpc.result.startsWith('0xmock_personal_sign_')) {
          document.getElementById('result').textContent = 'sig-ok'
        } else {
          document.getElementById('result').textContent = 'sig-fail:' + JSON.stringify(rpc)
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('sig-ok', { timeout: 5000 })
})

test('wallet_switchEthereumChain updates chain', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    let step = 0
    window.addEventListener('message', (e) => {
      if (e.data.type !== 'RAW') return
      if (e.data.id === switchId) {
        // Switch succeeded, now query chainId
        const checkId2 = 'test-check-' + Math.random().toString(16).slice(2)
        window.checkChainId = checkId2
        window.parent.postMessage({
          id: checkId2,
          type: 'APPLY',
          path: ['ethProviderRequestV2'],
          argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 2, method: 'eth_chainId', params: [] } }]
        }, '*')
      }
      if (window.checkChainId && e.data.id === window.checkChainId) {
        const rpc = e.data.value
        // 0x2105 = 8453 (Base)
        if (rpc.result === '0x2105') {
          document.getElementById('result').textContent = 'switched-ok'
        } else {
          document.getElementById('result').textContent = 'switched-fail:' + rpc.result
        }
      }
    })

    const switchId = 'test-switch-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: switchId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: {
        jsonrpc: '2.0', id: 1,
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2105' }]
      }}]
    }, '*')
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('switched-ok', { timeout: 5000 })
})

test('disconnected wallet rejects eth_requestAccounts with 4001', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&wallet=disconnected')

  await injectApp(page, `
    const reqId = 'test-disc-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: reqId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 1, method: 'eth_requestAccounts', params: [] } }]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === reqId && e.data.type === 'RAW') {
        const rpc = e.data.value
        if (rpc.error && rpc.error.code === 4001) {
          document.getElementById('result').textContent = 'rejected-4001'
        } else {
          document.getElementById('result').textContent = 'unexpected:' + JSON.stringify(rpc)
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('rejected-4001', { timeout: 5000 })
})

test('eth_sendTransaction returns mock tx hash', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher')

  await injectApp(page, `
    const txId = 'test-tx-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: txId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: {
        jsonrpc: '2.0', id: 1,
        method: 'eth_sendTransaction',
        params: [{ to: '0x0000000000000000000000000000000000000001', value: '0x1' }]
      }}]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === txId && e.data.type === 'RAW') {
        const rpc = e.data.value
        if (rpc.result && rpc.result.startsWith('0xmock_tx_')) {
          document.getElementById('result').textContent = 'tx-ok'
        } else {
          document.getElementById('result').textContent = 'tx-fail:' + JSON.stringify(rpc)
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('tx-ok', { timeout: 5000 })
})

test('chain query param configures initial chain', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&chain=8453')

  await injectApp(page, `
    const chainId = 'test-chain-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: chainId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] } }]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === chainId && e.data.type === 'RAW') {
        const rpc = e.data.value
        // 0x2105 = 8453 (Base)
        if (rpc.result === '0x2105') {
          document.getElementById('result').textContent = 'base-ok'
        } else {
          document.getElementById('result').textContent = 'base-fail:' + rpc.result
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('base-ok', { timeout: 5000 })
})

// ── Failure Simulation Tests ──────────────────────────────────────────

test('signIn=rejected returns rejected_by_user error', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&signIn=rejected')

  await injectApp(page, `
    const signInId = 'test-signin-rej-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: signInId,
      type: 'APPLY',
      path: ['signIn'],
      argumentList: [{ type: 'RAW', value: { nonce: 'test-nonce-123' } }]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === signInId && e.data.type === 'RAW') {
        const v = e.data.value
        if (v.error && v.error.type === 'rejected_by_user') {
          document.getElementById('result').textContent = 'rejected-ok'
        } else {
          document.getElementById('result').textContent = 'unexpected:' + JSON.stringify(v)
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('rejected-ok', { timeout: 5000 })
})

test('tx=rejected rejects eth_sendTransaction with 4001', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&tx=rejected')

  await injectApp(page, `
    const results = {}
    let pending = 2

    function checkDone() {
      pending--
      if (pending <= 0) {
        document.getElementById('result').textContent = Object.entries(results).map(([k,v]) => k + ':' + v).join(',')
      }
    }

    window.addEventListener('message', (e) => {
      if (e.data.type !== 'RAW') return
      if (e.data.id === accId) {
        const rpc = e.data.value
        if (rpc.result && rpc.result[0]) {
          results.accounts = 'ok'
        } else {
          results.accounts = 'fail'
        }
        checkDone()
      }
      if (e.data.id === txId) {
        const rpc = e.data.value
        if (rpc.error && rpc.error.code === 4001) {
          results.tx = 'rejected'
        } else {
          results.tx = 'unexpected'
        }
        checkDone()
      }
    })

    // eth_requestAccounts should still succeed
    const accId = 'test-acc-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: accId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: { jsonrpc: '2.0', id: 1, method: 'eth_requestAccounts', params: [] } }]
    }, '*')

    // eth_sendTransaction should be rejected
    const txId = 'test-tx-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: txId,
      type: 'APPLY',
      path: ['ethProviderRequestV2'],
      argumentList: [{ type: 'RAW', value: {
        jsonrpc: '2.0', id: 2,
        method: 'eth_sendTransaction',
        params: [{ to: '0x0000000000000000000000000000000000000001', value: '0x1' }]
      }}]
    }, '*')
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('accounts:ok,tx:rejected', { timeout: 5000 })
})

test('capabilities=no-wallet omits wallet capability', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&capabilities=no-wallet')

  await injectApp(page, `
    const capsId = 'test-caps-nw-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: capsId,
      type: 'APPLY',
      path: ['getCapabilities'],
      argumentList: []
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === capsId && e.data.type === 'RAW') {
        const caps = e.data.value
        const parts = []
        if (Array.isArray(caps)) parts.push('is-array')
        if (!caps.includes('wallet.getEthereumProvider')) parts.push('no-wallet')
        if (caps.includes('actions.signIn')) parts.push('has-signin')
        if (caps.includes('actions.ready')) parts.push('has-ready')
        document.getElementById('result').textContent = parts.join(',')
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText(
    'is-array,no-wallet,has-signin,has-ready',
    { timeout: 5000 }
  )
})

test('delay adds response latency', async ({ page }) => {
  await page.goto('http://localhost:4000/host?url=about:blank&fixture=launcher&delay=500')

  await injectApp(page, `
    const contextId = 'test-delay-' + Math.random().toString(16).slice(2)
    const start = Date.now()
    window.parent.postMessage({ id: contextId, type: 'GET', path: ['context'] }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === contextId && e.data.type === 'RAW') {
        const elapsed = Date.now() - start
        if (elapsed >= 400) {
          document.getElementById('result').textContent = 'delayed-ok'
        } else {
          document.getElementById('result').textContent = 'too-fast:' + elapsed + 'ms'
        }
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).toHaveText('delayed-ok', { timeout: 10000 })
})
