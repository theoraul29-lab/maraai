#!/usr/bin/env node

/**
 * MaraAI Pre-Deployment Verification Checklist
 * Runs quick tests on all critical systems before deploying
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
  results.push({
    name,
    status: condition ? 'PASS' : 'FAIL',
    message: condition ? '✓ OK' : failMessage,
  });
}

function warn(name: string, message: string): void {
  results.push({
    name,
    status: 'WARN',
    message,
  });
}

async function runChecks(): Promise<void> {
  console.log('🚀 MaraAI Pre-Deployment Verification\n');

  // 1. Environment Variables
  console.log('📋 Checking Environment Variables...');
  check(
    'GEMINI_API_KEY',
    !!process.env.GEMINI_API_KEY,
    'Missing GEMINI_API_KEY - AI responses will fail',
  );
  check(
    'DATABASE_URL',
    !!process.env.DATABASE_URL,
    'Missing DATABASE_URL - use local SQLite or set cloud DB',
  );
  check('NODE_ENV', !!process.env.NODE_ENV, 'NODE_ENV not set - defaults to development');

  // 2. Frontend Files
  console.log('\n📁 Checking Frontend Files...');
  const frontendFiles = [
    'frontend/src/HomePage.tsx',
    'frontend/src/HomePage.css',
    'frontend/src/ChatBox.tsx',
    'frontend/src/App.tsx',
  ];

  for (const file of frontendFiles) {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    check(`File: ${file}`, exists, `Missing file: ${file}`);
  }

  // 3. Backend Files
  console.log('\n⚙️  Checking Backend Files...');
  const backendFiles = ['server/index.ts', 'server/routes.ts', 'server/ai.ts', 'server/mara-brain.ts'];

  for (const file of backendFiles) {
    const exists = fs.existsSync(path.join(process.cwd(), file));
    check(`File: ${file}`, exists, `Missing file: ${file}`);
  }

  // 4. CSS Module-Specific Files
  console.log('\n🎨 Checking CSS Files...');
  check('modules.css', fs.existsSync('frontend/src/modules.css'), 'Module-specific styles missing');

  // 5. Package Dependencies
  console.log('\n📦 Checking Dependencies...');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

  const requiredDeps = [
    'express',
    '@google/generative-ai',
    'ws',
    'zod',
  ];

  for (const dep of requiredDeps) {
    const hasDep = !!packageJson.dependencies[dep];
    check(`Dependency: ${dep}`, hasDep, `Missing critical dependency: ${dep}`);
  }

  // 6. Mara Brain Integration
  console.log('\n🧠 Checking Mara Brain...');
  check(
    'MaraBrainMemory',
    fs.existsSync('server/mara-brain.ts'),
    'Mara brain system not found',
  );

  // 7. Database Schema
  console.log('\n💾 Checking Database...');
  warn(
    'Database Schema',
    'Ensure tables exist: users, chats, videos, orders, preferences',
  );

  // 8. API Endpoints
  console.log('\n🔌 Checking Critical Endpoints...');
  check(
    'Gemini Integration',
    fs.readFileSync('server/ai.ts', 'utf-8').includes('GoogleGenerativeAI'),
    'Gemini API not configured in ai.ts',
  );
  check(
    'Chat Endpoint',
    fs.readFileSync('server/routes.ts', 'utf-8').includes('chatModule.getChatHistory'),
    'Chat endpoint not registered',
  );
  check(
    'Video Endpoints',
    fs.readFileSync('server/routes.ts', 'utf-8').includes('videoModule.listVideos'),
    'Video endpoints not registered',
  );

  // 9. Cleanup Status
  console.log('\n🧹 Checking Cleanup...');
  const mainPyContent = fs.readFileSync('main.py', 'utf-8');
  check(
    'Vertex AI Removed',
    !mainPyContent.includes('_candidate_vertex_models'),
    'Legacy Vertex code still present',
  );
  check(
    'Old chat_with_mara Removed',
    mainPyContent.includes('// Chat endpoint now handled by server/ai.ts'),
    'Old Flask chat endpoint not removed',
  );

  // Results Summary
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION RESULTS\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warned = results.filter((r) => r.status === 'WARN').length;

  results.forEach((r) => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️ ';
    console.log(`${icon} ${r.name.padEnd(30)} ${r.message}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log(`
Summary:
✅ Passed: ${passed}
❌ Failed: ${failed}
⚠️  Warnings: ${warned}
Total: ${results.length}
`);

  if (failed > 0) {
    console.log('🛑 DEPLOYMENT BLOCKED - Fix failures above');
    process.exit(1);
  }

  console.log(`✨ Ready for deployment! ${warned > 0 ? ' (address warnings)' : ''}`);
  process.exit(0);
}

runChecks().catch((error) => {
  console.error('❌ Verification error:', error);
  process.exit(1);
});
