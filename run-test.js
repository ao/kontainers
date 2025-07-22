#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get the test file path from command line arguments
const testFilePath = process.argv[2];

if (!testFilePath) {
  console.error('Please provide a test file path');
  process.exit(1);
}

// Check if the file exists
if (!fs.existsSync(testFilePath)) {
  console.error(`File not found: ${testFilePath}`);
  process.exit(1);
}

console.log(`Running test: ${testFilePath}`);

try {
  // Run the test using Bun
  const output = execSync(`bun test ${testFilePath}`, { stdio: 'inherit' });
} catch (error) {
  console.error(`Test failed with error: ${error.message}`);
  process.exit(1);
}