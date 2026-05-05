#!/usr/bin/env node
/**
 * CapiCatcher — build:full
 * Build + commit + push → GitHub Actions despliega a GitHub Pages
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { colors, log, logSuccess, logError, logWarning } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const rootDir = dirname(dirname(__filename));

const PAGES_URL = 'https://genilsuarez.github.io/capicatcher/';
const REPO = 'genilsuarez/capicatcher';

/** Ejecuta un comando silencioso, retorna true/false */
function run(cmd, label) {
  const start = Date.now();
  process.stdout.write(`  ${label}... `);
  try {
    execSync(cmd, { stdio: 'pipe', cwd: rootDir });
    const s = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`${colors.green}✓${colors.reset} ${colors.white}(${s}s)${colors.reset}\n`);
    return true;
  } catch (err) {
    const s = ((Date.now() - start) / 1000).toFixed(1);
    process.stdout.write(`${colors.red}✗ (${s}s)${colors.reset}\n`);
    const msg = (err.stderr?.toString() || err.stdout?.toString() || err.message || '')
      .trim().split('\n').slice(-3).join('\n');
    if (msg) log(`    ${msg}`, colors.red);
    return false;
  }
}

function capture(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: rootDir, stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForDeploy(maxMinutes = 5) {
  const maxAttempts = maxMinutes * 4;
  process.stdout.write(`  Esperando deploy`);
  for (let i = 1; i <= maxAttempts; i++) {
    await sleep(15000);
    process.stdout.write('.');
    const raw = capture(
      `gh run list --repo ${REPO} --branch main --limit 1 --json status,conclusion --jq '.[0]'`
    );
    if (!raw) continue;
    let r;
    try { r = JSON.parse(raw); } catch { continue; }
    if (r.status === 'completed') {
      process.stdout.write('\n');
      return r.conclusion === 'success';
    }
  }
  process.stdout.write('\n');
  return false;
}

async function main() {
  const start = Date.now();
  console.log(`\n${colors.bright}${colors.cyan}🦫 CapiCatcher — deploy${colors.reset}\n`);

  // 1. Pre-build commit si hay cambios
  if (capture('git status --porcelain').length > 0) {
    if (!run('git add -A && git commit -m "chore: pre-build snapshot"', 'Commit cambios')) {
      process.exit(1);
    }
  }

  // 2. Sync
  if (!run('git pull --rebase', 'Sync remote')) process.exit(1);

  // 3. Build
  if (!run('npm run build', 'Build')) process.exit(1);

  // 4. Push
  const sha = capture('git rev-parse --short HEAD');
  run(`git add -A && git diff --cached --quiet || git commit -m "chore: deploy ${sha}"`, 'Post-build commit');
  if (!run('git push', 'Push')) process.exit(1);

  // 5. Monitor
  const ghOk = capture('which gh').length > 0;
  let ok = true;
  if (ghOk) {
    ok = await waitForDeploy(5);
  }

  // Resumen
  const total = ((Date.now() - start) / 1000).toFixed(1);
  const finalSha = capture('git rev-parse --short HEAD');
  console.log();
  if (ok) {
    logSuccess(`Deploy listo en ${total}s — ${PAGES_URL}`);
  } else {
    logWarning(`Push ok (${total}s) — verificar deploy: ${PAGES_URL}`);
  }
  log(`  commit ${finalSha}`, colors.white);
  console.log();
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});
