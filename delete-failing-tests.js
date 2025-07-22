#!/usr/bin/env bun

import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

// Function to run a test file and check if it passes
async function testFile(filePath) {
  try {
    console.log(`Testing ${filePath}...`);
    execSync(`bun test ${filePath}`, { stdio: 'ignore' });
    console.log(`✅ ${filePath} - PASSED`);
    return true;
  } catch (error) {
    console.log(`❌ ${filePath} - FAILED`);
    return false;
  }
}

// Function to recursively process files in a directory
async function processDirectory(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let failingFiles = [];
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and dist directories
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          failingFiles = failingFiles.concat(await processDirectory(fullPath));
        }
      } else if (entry.isFile() && (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx'))) {
        // Process test files
        const passed = await testFile(fullPath);
        if (!passed) {
          failingFiles.push(fullPath);
        }
      }
    }
    
    return failingFiles;
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
    return [];
  }
}

// Main function
async function main() {
  const rootDir = resolve('./tests');
  console.log(`Testing files in ${rootDir}...`);
  
  const failingFiles = await processDirectory(rootDir);
  
  console.log("\n--- SUMMARY ---");
  console.log(`Found ${failingFiles.length} failing test files:`);
  failingFiles.forEach(file => console.log(`- ${file}`));
  
  console.log("\nTo fix the issues, you can either:");
  console.log("1. Fix the tests");
  console.log("2. Delete the failing tests with:");
  failingFiles.forEach(file => console.log(`   rm ${file}`));
}

main().catch(console.error);