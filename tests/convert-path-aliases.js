#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

// Convert a specific test file as a proof of concept
const testFilePath = process.argv[2] || 'tests/integration/proxy-workflow.test.ts';
console.log(`Converting path aliases in ${testFilePath}...`);

try {
  const content = fs.readFileSync(testFilePath, 'utf8');
  const convertedContent = convertPathAliases(content);
  
  // Create a backup of the original file
  const backupPath = `${testFilePath}.bak`;
  fs.writeFileSync(backupPath, content);
  console.log(`Backup created at ${backupPath}`);
  
  // Write the converted content
  fs.writeFileSync(testFilePath, convertedContent);
  console.log(`Converted file written to ${testFilePath}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}