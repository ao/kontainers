#!/usr/bin/env bun

// This script will run specific test files and report if they pass or fail

import { execSync } from 'child_process';

// List of test files to run
const testFiles = [
  'tests/basic.test.ts',
  'tests/jest-compatibility.test.ts',
  'tests/path-alias.test.ts',
  'tests/path-alias-fix.test.ts',
  'tests/relative-imports.test.ts',
  'tests/simple.test.ts',
  'tests/simple-only.test.ts',
  'examples/testing-demo/tests/unit/ProxyRuleManager.test.ts'
];

// Run each test file
let passedCount = 0;
let failedCount = 0;

for (const file of testFiles) {
  try {
    console.log(`\nRunning ${file}...`);
    execSync(`bun test ${file}`, { stdio: 'inherit' });
    console.log(`✅ ${file} - PASSED`);
    passedCount++;
  } catch (error) {
    console.log(`❌ ${file} - FAILED`);
    failedCount++;
  }
}

// Print summary
console.log('\n--- SUMMARY ---');
console.log(`Passed: ${passedCount}/${testFiles.length}`);
console.log(`Failed: ${failedCount}/${testFiles.length}`);

// Exit with appropriate code
process.exit(failedCount > 0 ? 1 : 0);