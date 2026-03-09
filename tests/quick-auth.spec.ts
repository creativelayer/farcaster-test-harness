import { test, expect } from '@playwright/test'

const QUICK_AUTH = 'http://localhost:4100'

// Helper: build a SIWE message matching the harness format
function buildSiweMessage(opts: { domain: string; address: string; nonce: string; fid: number; chainId?: number }) {
  const chainId = opts.chainId || 10
  let msg = `${opts.domain} wants you to sign in with your Ethereum account:\n`
  msg += `${opts.address}\n`
  msg += `\n`
  msg += `Farcaster Auth\n`
  msg += `\n`
  msg += `URI: http://${opts.domain}\n`
  msg += `Version: 1\n`
  msg += `Chain ID: ${chainId}\n`
  msg += `Nonce: ${opts.nonce}\n`
  msg += `Issued At: ${new Date().toISOString()}`
  msg += `\nResources:\n- farcaster://fid/${opts.fid}`
  return msg
}

test('POST /nonce returns a nonce', async ({ request }) => {
  const res = await request.post(`${QUICK_AUTH}/nonce`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toHaveProperty('nonce')
  expect(typeof body.nonce).toBe('string')
  expect(body.nonce.length).toBeGreaterThan(0)
})

test('POST /verify-siwf returns a signed JWT', async ({ request }) => {
  // Get a nonce first
  const nonceRes = await request.post(`${QUICK_AUTH}/nonce`)
  const { nonce } = await nonceRes.json()

  const domain = 'testapp.example.com'
  const address = '0x1234567890abcdef1234567890abcdef12345678'
  const message = buildSiweMessage({ domain, address, nonce, fid: 3621 })

  const res = await request.post(`${QUICK_AUTH}/verify-siwf`, {
    data: { domain, message, signature: '0xmocksig' }
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.valid).toBe(true)
  expect(typeof body.token).toBe('string')

  // Decode the JWT payload (base64url)
  const parts = body.token.split('.')
  expect(parts.length).toBe(3)
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  expect(payload.sub).toBe('3621')
  expect(payload.aud).toBe(domain)
  expect(payload.iss).toBe(QUICK_AUTH)
  expect(payload.address).toBe(address)
})

test('GET /.well-known/jwks.json returns valid JWKS', async ({ request }) => {
  const res = await request.get(`${QUICK_AUTH}/.well-known/jwks.json`)
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body).toHaveProperty('keys')
  expect(Array.isArray(body.keys)).toBe(true)
  expect(body.keys.length).toBe(1)
  const key = body.keys[0]
  expect(key.kty).toBe('RSA')
  expect(key.alg).toBe('RS256')
  expect(key.use).toBe('sig')
  expect(key).toHaveProperty('kid')
})

test('JWT is verifiable using JWKS', async ({ request }) => {
  // Get token
  const nonceRes = await request.post(`${QUICK_AUTH}/nonce`)
  const { nonce } = await nonceRes.json()
  const domain = 'verify-test.example.com'
  const message = buildSiweMessage({
    domain,
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    nonce,
    fid: 9999,
  })
  const tokenRes = await request.post(`${QUICK_AUTH}/verify-siwf`, {
    data: { domain, message, signature: '0xmocksig' }
  })
  const { token } = await tokenRes.json()

  // Get JWKS
  const jwksRes = await request.get(`${QUICK_AUTH}/.well-known/jwks.json`)
  const jwks = await jwksRes.json()

  // Verify using jose (dynamically imported since it's ESM)
  const { createLocalJWKSet, jwtVerify } = await import('jose')
  const JWKS = createLocalJWKSet(jwks)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: QUICK_AUTH,
    audience: domain,
  })
  expect(payload.sub).toBe('9999')
  expect(payload.address).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
})

test('POST /verify-siwf rejects missing fields', async ({ request }) => {
  const res = await request.post(`${QUICK_AUTH}/verify-siwf`, {
    data: { domain: 'test.com' }  // missing message
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.valid).toBe(false)
})

test('full Quick Auth flow through harness + mock server', async ({ page, request }) => {
  // Use a real URL (not about:blank) so buildSiweMessage produces a valid domain
  await page.goto('http://localhost:4000/host?url=http://localhost:4100&fixture=launcher')

  // Step 1: Get nonce from mock Quick Auth server (via Playwright request)
  const nonceRes = await request.post(`${QUICK_AUTH}/nonce`)
  const { nonce } = await nonceRes.json()

  // Step 2: signIn via comlink through the harness iframe
  await page.evaluate((scriptContent: string) => {
    const iframe = document.getElementById('miniapp-frame') as HTMLIFrameElement
    iframe.srcdoc = `
      <html><body>
        <div id="fid-display">loading...</div>
        <div id="fixture-type">loading...</div>
        <div id="result">waiting...</div>
        <script>${scriptContent}<\/script>
      </body></html>
    `
  }, `
    const signInId = 'qa-signin-' + Math.random().toString(16).slice(2)
    window.parent.postMessage({
      id: signInId,
      type: 'APPLY',
      path: ['signIn'],
      argumentList: [{ type: 'RAW', value: { nonce: '${nonce}', acceptAuthAddress: true } }]
    }, '*')
    window.addEventListener('message', (e) => {
      if (e.data.id === signInId && e.data.type === 'RAW') {
        document.getElementById('result').textContent = JSON.stringify(e.data.value)
      }
    })
  `)

  const appFrame = page.frameLocator('#miniapp-frame')
  await expect(appFrame.locator('#result')).not.toHaveText('waiting...', { timeout: 5000 })
  const signInResultText = await appFrame.locator('#result').textContent()
  const signInResult = JSON.parse(signInResultText!)
  expect(signInResult.result).toBeTruthy()
  expect(signInResult.result.message).toContain('Farcaster Auth')
  expect(signInResult.result.message).toContain(`farcaster://fid/3621`)

  // Step 3: verify-siwf with the SIWE message (via Playwright request)
  const firstLine = signInResult.result.message.split('\n')[0]
  const domain = firstLine.replace(' wants you to sign in with your Ethereum account:', '')

  const verifyRes = await request.post(`${QUICK_AUTH}/verify-siwf`, {
    data: {
      domain,
      message: signInResult.result.message,
      signature: signInResult.result.signature,
    }
  })
  expect(verifyRes.status()).toBe(200)
  const verifyData = await verifyRes.json()
  expect(verifyData.valid).toBe(true)
  expect(verifyData.token).toBeTruthy()

  // Step 4: Verify JWT payload
  const parts = verifyData.token.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  expect(payload.sub).toBe('3621')
  expect(payload.address).toBe('0x1234567890abcdef1234567890abcdef12345678')
  expect(payload.iss).toBe(QUICK_AUTH)
  expect(payload.aud).toBe(domain)
  expect(payload.exp).toBeGreaterThan(Date.now() / 1000)
})
