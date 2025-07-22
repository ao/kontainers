#!/usr/bin/env bun

// This script will run each test file individually and report which ones are passing

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
  'examples/testing-demo/tests/unit/ProxyRuleManager.test.ts',
  'examples/testing-demo/tests/integration/ProxyRuleWorkflow.test.ts',
  'tests/performance/api-performance.test.ts'
];

// Run each test file
const results = [];
for (const file of testFiles) {
  try {
    console.log(`Running ${file}...`);
    execSync(`bun test ${file}`, { stdio: 'ignore' });
    console.log(`✅ ${file} - PASSED`);
    results.push({ file, passed: true });
  } catch (error) {
    console.log(`❌ ${file} - FAILED`);
    results.push({ file, passed: false });
  }
}

// Print summary
console.log('\n--- SUMMARY ---');
const passedTests = results.filter(r => r.passed);
const failedTests = results.filter(r => !r.passed);

console.log(`Passed: ${passedTests.length}/${results.length}`);
console.log(`Failed: ${failedTests.length}/${results.length}`);

if (failedTests.length > 0) {
  console.log('\nFailing tests:');
  failedTests.forEach(({ file }) => console.log(`- ${file}`));
}