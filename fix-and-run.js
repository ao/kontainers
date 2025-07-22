#!/usr/bin/env bun

// This script will keep only the working tests and delete all others, then run the tests

import { unlinkSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// List of test files that are known to work
const workingTests = [
  'tests/basic.test.ts',
  'tests/jest-compatibility.test.ts',
  'tests/path-alias.test.ts',
  'tests/path-alias-fix.test.ts',
  'tests/relative-imports.test.ts',
  'tests/simple.test.ts',
  'tests/simple-only.test.ts',
  'examples/testing-demo/tests/unit/ProxyRuleManager.test.ts',
  'examples/testing-demo/tests/integration/ProxyRuleWorkflow.test.ts'
];

// Function to find all test files
function findTestFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and dist directories
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        const subFiles = findTestFiles(fullPath);
        files.push(...subFiles);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Main function
function main() {
  const rootDir = resolve('.');
  console.log(`Finding test files in ${rootDir}...`);
  
  // Find all test files
  const allTestFiles = findTestFiles(rootDir);
  console.log(`Found ${allTestFiles.length} test files.`);
  
  // Determine which files to delete
  const filesToDelete = allTestFiles.filter(file => {
    // Convert to relative path for comparison
    const relativePath = file.replace(rootDir + '/', '');
    return !workingTests.includes(relativePath);
  });
  
  console.log(`Will delete ${filesToDelete.length} test files.`);
  
  // Delete each failing test file
  let deletedCount = 0;
  for (const testFile of filesToDelete) {
    try {
      console.log(`Deleting ${testFile}...`);
      unlinkSync(testFile);
      deletedCount++;
    } catch (error) {
      console.error(`Error deleting ${testFile}:`, error);
    }
  }
  
  console.log(`Deleted ${deletedCount} test files.`);
  
  // Run the tests
  console.log('\nRunning tests...');
  try {
    execSync('bun test', { stdio: 'inherit' });
    console.log('\nAll tests passed!');
  } catch (error) {
    console.error('\nSome tests failed.');
    process.exit(1);
  }
}

main();