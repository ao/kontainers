#!/usr/bin/env bun

// This script will run just one test file

import { execSync } from 'child_process';

// Run the basic test file
try {
  console.log('Running tests/basic.test.ts...');
  const output = execSync('bun test tests/basic.test.ts', { encoding: 'utf8' });
  console.log(output);
  console.log('✅ tests/basic.test.ts - PASSED');
} catch (error) {
  console.log('❌ tests/basic.test.ts - FAILED');
  if (error.stdout) {
    console.log(error.stdout);
  }
}