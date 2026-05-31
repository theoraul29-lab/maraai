#!/usr/bin/env node

/**
 * MaraAI Pre-Deployment Verification Checklist
 */

import fs from 'fs';
import path from 'path';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, condition: boolean, failMessage: string): void {
  results.push({ name, status: condition ? 'PASS' : 'FAIL', message: condition ? '✓ OK' : failMessage });
}

function warn(name: string, message: string): void {
  results.push({ name, status: 'WARN', message });
}

async function runChecks(): Promise<void> {
  console.log('🚀 MaraAI Pre-Deployment Verification\n');

  // 1. Environment Variables
  console.log('📋 Checking Environment Variables...');
  check('ANTHROPIC_API_KEY', !!process.env.ANTHROPIC_API_KEY, 'Missing ANTHROPIC_API_KEY — AI responses will fail');
  check('SESSION_SECRET', !!process.env.SESSION_SECRET, 'Missing SESSION_SECRET — sessions insecure');
  check('DATABASE_URL', !!process.env.DATABASE_URL, 'Missing DATABASE_URL — set to /data/mara.db for Railway');
  check('NODE_ENV', !!process.env.NODE_ENV, 'NODE_ENV not set');

  // 2. Frontend Source Files
  console.log('\n📁 Checking Frontend Files...');
  const frontendFiles = [
    'frontend/src/App.tsx',
    'frontend/src/main.tsx',
    'frontend/src/Nav.tsx',
    'frontend/src/HomePage.tsx',
    'frontend/src/Missions.tsx',
    'frontend/src/Pricing.tsx',
    'frontend/src/VIP.tsx',
    'frontend/src/WritersHub.tsx',
    'frontend/src/reels.tsx',
    'frontend/src/you.tsx',
    'frontend/src/creator.tsx',
    'frontend/src/modules.css',
    'frontend/index.html',
  ];
  for (const file of frontendFiles) {
    check(`Frontend: ${file}`, fs.existsSync(path.join(process.cwd(), file)), `Missing: ${file}`);
  }

  // 3. Backend Files
  console.log('\n⚙️  Checking Backend Files...');
  const backendFiles = [
    'server/index.ts',
    'server/routes.ts',
    'server/auth.ts',
    'server/db.ts',
    'server/ai.ts',
    'server/llm.ts',
    'server/mara-brain/index.ts',
    'server/mara-brain/core.ts',
    'server/missions/engine.ts',
    'server/missions/routes.ts',
    'server/billing/stripe.ts',
    'server/billing/paypal.ts',
    'server/middleware/requireAdmin.ts',
  ];
  for (const file of backendFiles) {
    check(`Backend: ${file}`, fs.existsSync(path.join(process.cwd(), file)), `Missing: ${file}`);
  }

  // 4. Migrations
  console.log('\n💾 Checking Migrations...');
  const journal = JSON.parse(fs.readFileSync('migrations/meta/_journal.json', 'utf-8'));
  check('Migration journal readable', Array.isArray(journal.entries), 'Invalid _journal.json');
  check('Migration count ≥ 21', journal.entries.length >= 21, `Only ${journal.entries.length} migrations in journal`);
  const lastIdx = Math.max(...journal.entries.map((e: any) => e.idx));
  check('Journal sequential (no gaps)', journal.entries.length === lastIdx + 1, `Journal has gaps — ${journal.entries.length} entries but last idx is ${lastIdx}`);

  // 5. Dependencies
  console.log('\n📦 Checking Dependencies...');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  for (const dep of ['express', 'ws', 'better-sqlite3', 'drizzle-orm', '@anthropic-ai/sdk']) {
    check(`Dep: ${dep}`, !!(pkg.dependencies[dep] || pkg.devDependencies?.[dep]), `Missing: ${dep}`);
  }

  // 6. Build Output
  console.log('\n🏗️  Checking Build Output...');
  const distExists = fs.existsSync(path.join(process.cwd(), 'dist'));
  warn('dist/ folder', distExists ? '✓ dist/ exists' : 'dist/ not built yet — run npm run build');

  // 7. Security Config
  console.log('\n🔐 Checking Security Config...');
  const authTs = fs.readFileSync('server/auth.ts', 'utf-8');
  check('CSRF enabled', authTs.includes('csrf'), 'CSRF protection not found in auth.ts');
  check('Session secret guarded', authTs.includes('SESSION_SECRET'), 'SESSION_SECRET not read in auth.ts');

  const paypalTs = fs.readFileSync('server/billing/paypal.ts', 'utf-8');
  check('PayPal webhook signature', paypalTs.includes('PAYPAL_WEBHOOK_ID') || paypalTs.includes('verifyWebhook'), 'PayPal webhook signature verification missing');

  // Results
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION RESULTS\n');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;

  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`${icon} ${r.name.padEnd(40)} ${r.message}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Passed: ${passed}  ❌ Failed: ${failed}  ⚠️  Warnings: ${warned}  Total: ${results.length}\n`);

  if (failed > 0) {
    console.log('🛑 DEPLOYMENT BLOCKED — fix failures above');
    process.exit(1);
  }
  console.log(`✨ Ready for deployment!${warned > 0 ? ' (address warnings when possible)' : ''}`);
  process.exit(0);
}

runChecks().catch(err => {
  console.error('❌ Verification error:', err);
  process.exit(1);
});
