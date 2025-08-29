import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';

describe('Real Database Integration', () => {
  let dbContainer: string;

  beforeAll(async () => {
    // Start a real PostgreSQL container for testing
    const result = await execCommand(`
      docker run -d \
        --name test-postgres \
        -e POSTGRES_PASSWORD=testpass \
        -e POSTGRES_DB=kontainers_test \
        -p 5433:5432 \
        postgres:13-alpine
    `);
    
    dbContainer = result.trim();
    
    // Wait for database to be ready
    await waitForDatabase();
  });

  afterAll(async () => {
    if (dbContainer) {
      await execCommand(`docker rm -f ${dbContainer}`).catch(() => {});
    }
  });

  it('should connect to real database', async () => {
    // Test real database connection
    const result = await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "SELECT version();"
    `);
    
    expect(result).toContain('PostgreSQL');
  });

  it('should create and query real tables', async () => {
    // Create a real table
    await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "
        CREATE TABLE IF NOT EXISTS test_containers (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          image VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      "
    `);

    // Insert real data
    await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "
        INSERT INTO test_containers (name, image, status) 
        VALUES ('nginx-test', 'nginx:alpine', 'running');
      "
    `);

    // Query real data
    const result = await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "
        SELECT name, image, status FROM test_containers WHERE name = 'nginx-test';
      "
    `);

    expect(result).toContain('nginx-test');
    expect(result).toContain('nginx:alpine');
    expect(result).toContain('running');
  });

  it('should handle real database transactions', async () => {
    // Test real transaction
    await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "
        BEGIN;
        INSERT INTO test_containers (name, image, status) VALUES ('temp-container', 'alpine', 'created');
        ROLLBACK;
      "
    `);

    // Verify rollback worked
    const result = await execCommand(`
      docker exec ${dbContainer} psql -U postgres -d kontainers_test -c "
        SELECT COUNT(*) FROM test_containers WHERE name = 'temp-container';
      "
    `);

    expect(result).toContain('0');
  });
});

async function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command]);
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed: ${command}\n${error}`));
      }
    });
  });
}

async function waitForDatabase(): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      await execCommand(`
        docker exec test-postgres pg_isready -U postgres
      `);
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Database did not become ready');
}
