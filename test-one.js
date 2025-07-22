#!/usr/bin/env bun

// This script will run a single test file and report if it passes or fails

import { execSync } from 'child_process';

// Get the test file from the command line arguments
const testFile = process.argv[2];

if (!testFile) {
  console.error('Please provide a test file to run');
  process.exit(1);
}

try {
  console.log(`Running ${testFile}...`);
  execSync(`bun test ${testFile}`, { stdio: 'inherit' });
  console.log(`✅ ${testFile} - PASSED`);
  process.exit(0);
} catch (error) {
  console.log(`❌ ${testFile} - FAILED`);
  process.exit(1);
}