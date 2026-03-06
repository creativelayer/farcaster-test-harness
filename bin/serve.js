#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');

const hostDir = path.resolve(__dirname, '..');
const port = process.argv[2] || '4000';

// Resolve the serve CLI from this package's dependency tree,
// regardless of hoisting or pnpm's strict layout.
const servePkg = path.dirname(require.resolve('serve/package.json'));
const serveBin = path.join(servePkg, 'build', 'main.js');

execFileSync(process.execPath, [serveBin, hostDir, '-p', port], { stdio: 'inherit' });
