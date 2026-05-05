/**
 * Logger Utility - Consistent logging across all scripts
 */
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

export function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

export function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, colors.bright + colors.cyan);
  console.log('='.repeat(60));
}

export function logSuccess(message) { log(`✅ ${message}`, colors.green); }
export function logError(message)   { log(`❌ ${message}`, colors.red); }
export function logWarning(message) { log(`⚠️  ${message}`, colors.yellow); }
export function logInfo(message)    { log(`ℹ️  ${message}`, colors.blue); }
