#!/usr/bin/env node

async function main() {
  const { createServer } = require('http')
  const crypto = require('crypto')
  const { generateKeyPair, exportJWK, SignJWT } = await import('jose')

  const port = parseInt(process.argv[2] || '4100', 10)
  const serverOrigin = `http://localhost:${port}`

  // Generate RSA key pair at startup
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const publicJwk = await exportJWK(publicKey)
  const kid = crypto.randomUUID()

  const jwks = {
    keys: [{ ...publicJwk, kid, alg: 'RS256', use: 'sig' }]
  }

  // In-memory nonce store
  const nonces = new Set()

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()))
        } catch {
          resolve(null)
        }
      })
      req.on('error', reject)
    })
  }

  function json(res, status, data) {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end(body)
  }

  function extractFid(message) {
    const match = message.match(/farcaster:\/\/fid\/(\d+)/)
    return match ? match[1] : null
  }

  function extractAddress(message) {
    const lines = message.split('\n')
    // Address is on the second line of a SIWE message
    return lines.length >= 2 ? lines[1].trim() : null
  }

  const server = createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Length': '0',
      })
      res.end()
      return
    }

    const url = new URL(req.url, serverOrigin)

    // POST /nonce
    if (req.method === 'POST' && url.pathname === '/nonce') {
      const nonce = crypto.randomUUID()
      nonces.add(nonce)
      json(res, 200, { nonce })
      return
    }

    // POST /verify-siwf
    if (req.method === 'POST' && url.pathname === '/verify-siwf') {
      const body = await readBody(req)
      if (!body || !body.message || !body.domain) {
        json(res, 400, { valid: false, message: 'Missing required fields: message, domain' })
        return
      }

      const fid = extractFid(body.message)
      const address = extractAddress(body.message)

      if (!fid) {
        json(res, 400, { valid: false, message: 'Could not extract FID from SIWE message' })
        return
      }

      const token = await new SignJWT({ sub: fid, address })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(serverOrigin)
        .setAudience(body.domain)
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey)

      json(res, 200, { token, valid: true })
      return
    }

    // GET /.well-known/jwks.json
    if (req.method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      json(res, 200, jwks)
      return
    }

    json(res, 404, { error: 'Not found' })
  })

  server.listen(port, () => {
    console.log(`QUICK_AUTH_READY on port ${port}`)
    console.log(`  POST ${serverOrigin}/nonce`)
    console.log(`  POST ${serverOrigin}/verify-siwf`)
    console.log(`  GET  ${serverOrigin}/.well-known/jwks.json`)
  })
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
