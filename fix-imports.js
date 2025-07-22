#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

// Define the patterns to replace
const patterns = [
  { from: /@backend\/src\//g, to: '@backend/' },
  { from: /@frontend\/src\//g, to: '@frontend/' },
  { from: /@shared\/src\//g, to: '@shared/' }
];

// Function to process a file
async function processFile(filePath) {
  try {
    // Read the file content
    const content = await readFile(filePath, 'utf8');
    
    // Check if any pattern matches
    let newContent = content;
    let hasChanges = false;
    
    for (const pattern of patterns) {
      if (pattern.from.test(newContent)) {
        newContent = newContent.replace(pattern.from, pattern.to);
        hasChanges = true;
      }
    }
    
    // If there are changes, write the file
    if (hasChanges) {
      console.log(`Fixing imports in ${filePath}`);
      await writeFile(filePath, newContent, 'utf8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
}

// Function to recursively process files in a directory
async function processDirectory(dirPath) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    let fixedFiles = 0;
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and dist directories
        if (entry.name !== 'node_modules' && entry.name !== 'dist') {
          fixedFiles += await processDirectory(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        // Process TypeScript files
        if (await processFile(fullPath)) {
          fixedFiles++;
        }
      }
    }
    
    return fixedFiles;
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
    return 0;
  }
}

// Main function
async function main() {
  const rootDir = resolve('.');
  console.log(`Fixing imports in ${rootDir}...`);
  
  const fixedFiles = await processDirectory(rootDir);
  console.log(`Fixed imports in ${fixedFiles} files.`);
}

main().catch(console.error);