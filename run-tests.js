#!/usr/bin/env bun

import { readdir, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// Function to find all test files
async function findTestFiles(dir) {
  const files = [];
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and dist directories
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        const subFiles = await findTestFiles(fullPath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Function to run a test file
function runTest(file) {
  try {
    console.log(`Running ${file}...`);
    execSync(`bun test ${file}`, { stdio: 'inherit' });
    console.log(`✅ ${file} - PASSED`);
    return true;
  } catch (error) {
    console.log(`❌ ${file} - FAILED`);
    return false;
  }
}

// Main function
async function main() {
  const rootDir = resolve('.');
  console.log(`Finding test files in ${rootDir}...`);
  
  // Find all test files
  const testFiles = await findTestFiles(rootDir);
  console.log(`Found ${testFiles.length} test files.`);
  
  // Run each test file
  const results = [];
  for (const file of testFiles) {
    const passed = runTest(file);
    results.push({ file, passed });
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
}

main().catch(console.error);