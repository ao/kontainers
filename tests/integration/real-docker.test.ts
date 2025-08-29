import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'child_process';

describe('Real Docker Integration', () => {
  let containerId: string;

  beforeAll(async () => {
    // Pull a real test image
    await execCommand('docker pull alpine:latest');
  });

  afterAll(async () => {
    // Clean up any test containers
    if (containerId) {
      await execCommand(`docker rm -f ${containerId}`).catch(() => {});
    }
  });

  it('should create and manage real containers', async () => {
    // Create a real container
    const createResult = await execCommand('docker create --name test-container alpine:latest echo "hello world"');
    containerId = createResult.trim();
    
    expect(containerId).toBeTruthy();
    
    // Start the container
    await execCommand(`docker start ${containerId}`);
    
    // Wait for completion
    await execCommand(`docker wait ${containerId}`);
    
    // Check container status
    const status = await execCommand(`docker inspect ${containerId} --format='{{.State.Status}}'`);
    expect(status.trim()).toBe('exited');
    
    // Get container logs
    const logs = await execCommand(`docker logs ${containerId}`);
    expect(logs.trim()).toBe('hello world');
    
    // Remove container
    await execCommand(`docker rm ${containerId}`);
    containerId = '';
  });

  it('should list real Docker images', async () => {
    const images = await execCommand('docker images --format "{{.Repository}}:{{.Tag}}"');
    expect(images).toContain('alpine:latest');
  });

  it('should inspect real Docker system', async () => {
    const info = await execCommand('docker system df');
    expect(info).toContain('Images');
    expect(info).toContain('Containers');
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
