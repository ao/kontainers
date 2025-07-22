#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

// Define path alias mappings
const pathAliases = {
  '@frontend/': '../frontend/src/',
  '@backend/': '../backend/src/',
  '@shared/': '../shared/src/',
  '@/': '../frontend/src/',
  '@tests/': './'
};

// Function to convert path aliases to relative paths
function convertPathAliases(content) {
  let result = content;
  
  // Replace all path aliases with relative paths
  for (const [alias, relativePath] of Object.entries(pathAliases)) {
    const regex = new RegExp(`from ['"]${alias}([^'"]+)['"]`, 'g');
    result = result.replace(regex, `from '${relativePath}$1'`);
    
    const importRegex = new RegExp(`import ['"]${alias}([^'"]+)['"]`, 'g');
    result = result.replace(importRegex, `import '${relativePath}$1'`);
    
    const requireRegex = new RegExp(`require\\(['"]${alias}([^'"]+)['"]\\)`, 'g');
    result = result.replace(requireRegex, `require('${relativePath}$1')`);
    
    const jestMockRegex = new RegExp(`jest\\.mock\\(['"]${alias}([^'"]+)['"]`, 'g');
    result = result.replace(jestMockRegex, `jest.mock('${relativePath}$1'`);
  }
  
  return result;
}

// Function to convert Jest mocking to Bun mocking
function convertJestToBun(content) {
  let result = content;
  
  // Replace jest.mock with Bun's mock
  result = result.replace(/jest\.mock\(['"](.*?)['"], \(\) => \(\{([\s\S]*?)\}\)\)/g, (match, importPath, mockContent) => {
    // Extract the variable name from the import path
    const parts = importPath.split('/');
    const varName = parts[parts.length - 1];
    
    return `// Converted from jest.mock
const original${varName} = { ...${varName} };
const mock${varName} = {${mockContent}};
Object.assign(${varName}, mock${varName});`;
  });
  
  // Replace jest.fn() with Bun's mock()
  result = result.replace(/jest\.fn\(\)/g, 'mock(() => {})');
  result = result.replace(/jest\.fn\(\(\) => (.*?)\)/g, 'mock(() => $1)');
  
  // Replace jest.resetAllMocks() with custom reset function
  result = result.replace(/jest\.resetAllMocks\(\)/g, '// Reset mocks - converted from jest.resetAllMocks()');
  
  // Replace jest.clearAllMocks() with custom clear function
  result = result.replace(/jest\.clearAllMocks\(\)/g, '// Clear mocks - converted from jest.clearAllMocks()');
  
  // Add import for Bun's mock if not already present
  if (result.includes('mock(') && !result.includes('import { mock }')) {
    result = result.replace(/import {([^}]*)}/g, 'import { $1, mock }');
    if (!result.includes('import {')) {
      result = result.replace(/import (.*?) from ['"]bun:test['"];/g, 'import $1, { mock } from "bun:test";');
    }
    if (!result.includes('from "bun:test"')) {
      result = 'import { mock } from "bun:test";\n' + result;
    }
  }
  
  return result;
}

console.log(`Converting ${testFilePath}...`);

try {
  // Read the original file
  const content = fs.readFileSync(testFilePath, 'utf8');
  
  // Create a backup of the original file
  const backupPath = `${testFilePath}.bak`;
  fs.writeFileSync(backupPath, content);
  console.log(`Backup created at ${backupPath}`);
  
  // Convert path aliases to relative imports
  let convertedContent = convertPathAliases(content);
  
  // Convert Jest mocking to Bun mocking
  convertedContent = convertJestToBun(convertedContent);
  
  // Create a temporary file with the converted content
  const tempPath = `${testFilePath}.tmp`;
  fs.writeFileSync(tempPath, convertedContent);
  console.log(`Converted file written to ${tempPath}`);
  
  // Run the test using Bun
  console.log(`Running test: ${tempPath}`);
  try {
    execSync(`bun test ${tempPath}`, { stdio: 'inherit' });
    console.log('Test completed successfully');
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
  }
  
  // Clean up the temporary file
  fs.unlinkSync(tempPath);
  console.log(`Temporary file ${tempPath} removed`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}