#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

interface TestSuite {
  name: string;
  command: string;
  description: string;
  timeout?: number;
}

const testSuites: TestSuite[] = [
  {
    name: 'lint',
    command: 'bun run lint',
    description: 'Run ESLint checks',
    timeout: 30000
  },
  {
    name: 'unit',
    command: 'bun test tests/unit',
    description: 'Run unit tests',
    timeout: 60000
  },
  {
    name: 'integration',
    command: 'bun test tests/integration',
    description: 'Run real integration tests (Docker, API, Database)',
    timeout: 300000
  },
  {
    name: 'smoke',
    command: 'bun test tests/smoke',
    description: 'Run smoke tests',
    timeout: 60000
  },
  {
    name: 'performance',
    command: 'bun test tests/performance --timeout 60000',
    description: 'Run performance tests',
    timeout: 120000
  },
  {
    name: 'e2e',
    command: 'bunx playwright test',
    description: 'Run real UI tests with Playwright',
    timeout: 300000
  },
  {
    name: 'e2e-headed',
    command: 'bunx playwright test --headed',
    description: 'Run UI tests with visible browser',
    timeout: 300000
  },
  {
    name: 'real-docker',
    command: 'bun test tests/integration/real-docker.test.ts',
    description: 'Test real Docker container operations',
    timeout: 180000
  },
  {
    name: 'real-api',
    command: 'bun test tests/integration/real-api.test.ts',
    description: 'Test real API with running server',
    timeout: 180000
  },
  {
    name: 'real-database',
    command: 'bun test tests/integration/real-database.test.ts',
    description: 'Test real database operations',
    timeout: 180000
  }
];

class TestRunner {
  private results: Map<string, { success: boolean; duration: number; output: string }> = new Map();

  async runSuite(suite: TestSuite): Promise<boolean> {
    console.log(`\n🧪 Running ${suite.name}: ${suite.description}`);
    
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', suite.command], {
        stdio: ['inherit', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        console.log(`❌ ${suite.name} timed out after ${suite.timeout}ms`);
        this.results.set(suite.name, {
          success: false,
          duration: Date.now() - startTime,
          output: output + errorOutput + '\nTest timed out'
        });
        resolve(false);
      }, suite.timeout || 60000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        const success = code === 0;
        
        this.results.set(suite.name, {
          success,
          duration,
          output: output + errorOutput
        });

        if (success) {
          console.log(`✅ ${suite.name} passed in ${duration}ms`);
        } else {
          console.log(`❌ ${suite.name} failed in ${duration}ms (exit code: ${code})`);
        }
        
        resolve(success);
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        console.log(`❌ ${suite.name} error: ${error.message}`);
        this.results.set(suite.name, {
          success: false,
          duration: Date.now() - startTime,
          output: error.message
        });
        resolve(false);
      });
    });
  }

  async runAll(suites: string[] = []): Promise<void> {
    const suitesToRun = suites.length > 0 
      ? testSuites.filter(suite => suites.includes(suite.name))
      : testSuites;

    console.log('🚀 Starting comprehensive test suite...\n');
    console.log(`Running ${suitesToRun.length} test suites: ${suitesToRun.map(s => s.name).join(', ')}`);

    const startTime = Date.now();
    let allPassed = true;

    for (const suite of suitesToRun) {
      const passed = await this.runSuite(suite);
      if (!passed) {
        allPassed = false;
      }
    }

    const totalDuration = Date.now() - startTime;
    this.printSummary(totalDuration, allPassed);
  }

  async runWithCoverage(): Promise<void> {
    console.log('🧪 Running tests with coverage...\n');
    
    const coverageCommand = 'bun test --coverage';
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', coverageCommand], {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      child.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          console.log(`✅ Coverage tests completed in ${duration}ms`);
        } else {
          console.log(`❌ Coverage tests failed in ${duration}ms`);
        }
        resolve();
      });
    });
  }

  private printSummary(totalDuration: number, allPassed: boolean): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const results = Array.from(this.results.entries());
    const passed = results.filter(([_, result]) => result.success);
    const failed = results.filter(([_, result]) => !result.success);
    
    console.log(`Total suites: ${results.length}`);
    console.log(`✅ Passed: ${passed.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`⏱️  Total time: ${totalDuration}ms`);
    
    if (failed.length > 0) {
      console.log('\n❌ Failed suites:');
      failed.forEach(([name, result]) => {
        console.log(`  - ${name} (${result.duration}ms)`);
      });
    }
    
    if (passed.length > 0) {
      console.log('\n✅ Passed suites:');
      passed.forEach(([name, result]) => {
        console.log(`  - ${name} (${result.duration}ms)`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (allPassed) {
      console.log('🎉 All tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some tests failed!');
      process.exit(1);
    }
  }

  listSuites(): void {
    console.log('Available test suites:\n');
    testSuites.forEach(suite => {
      console.log(`  ${suite.name.padEnd(12)} - ${suite.description}`);
    });
    console.log('\nUsage:');
    console.log('  bun run scripts/test-runner.ts [suite1] [suite2] ...');
    console.log('  bun run scripts/test-runner.ts --all');
    console.log('  bun run scripts/test-runner.ts --coverage');
    console.log('  bun run scripts/test-runner.ts --list');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  if (args.includes('--help') || args.includes('-h')) {
    runner.listSuites();
    return;
  }

  if (args.includes('--list')) {
    runner.listSuites();
    return;
  }

  if (args.includes('--coverage')) {
    await runner.runWithCoverage();
    return;
  }

  if (args.includes('--all') || args.length === 0) {
    await runner.runAll();
    return;
  }

  // Run specific suites
  const validSuites = args.filter(arg => testSuites.some(suite => suite.name === arg));
  const invalidSuites = args.filter(arg => !testSuites.some(suite => suite.name === arg));

  if (invalidSuites.length > 0) {
    console.log(`❌ Invalid test suites: ${invalidSuites.join(', ')}`);
    console.log('Use --list to see available suites');
    process.exit(1);
  }

  await runner.runAll(validSuites);
}

main().catch(console.error);
