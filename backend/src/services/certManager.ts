import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
// We'll need to install acme-client package
// import * as acme from 'acme-client';
import { SslCertificate, ProxyRule, LetsEncryptStatus } from '../../../shared/src/models';
import { nginxConfigService } from './nginxConfig';

const execAsync = promisify(exec);

// Temporary mock for acme-client until we install the package
const acme = {
  Client: class {
    constructor(options: any) {}
    async getAccountUrl() { return ''; }
    async createOrder(options: any) { return {}; }
    async getAuthorizations(order: any) { return []; }
    async getChallengeKeyAuthorization(challenge: any) { return ''; }
    async verifyChallenge(auth: any, challenge: any) {}
    async completeChallenge(challenge: any) {}
    async waitForValidStatus(challenge: any) {}
    async finalizeOrder(order: any, csr: any) { return {}; }
    async getCertificate(finalized: any) { return ''; }
  },
  forge: {
    createPrivateKey: async () => Buffer.from('mock-private-key'),
    createCsr: async (options: any) => ['mock-key', 'mock-csr'],
    readCertificateInfo: async (cert: string) => ({
      subject: { commonName: 'example.com' },
      notAfter: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    })
  },
  directory: {
    letsencrypt: {
      production: 'https://acme-v02.api.letsencrypt.org/directory',
      staging: 'https://acme-staging-v02.api.letsencrypt.org/directory'
    }
  }
};

/**
 * Service for managing Let's Encrypt certificates
 */
export class CertManagerService {
  private certsDir: string;
  private accountsDir: string;
  private acmeChallengePath: string;
  private renewalCheckIntervalMs: number = 24 * 60 * 60 * 1000; // 24 hours
  private renewalThresholdDays: number = 30; // Renew when less than 30 days remain
  private renewalTimer: NodeJS.Timeout | null = null;

  constructor(options: {
    certsDir?: string;
    accountsDir?: string;
    acmeChallengePath?: string;
  } = {}) {
    this.certsDir = options.certsDir || '/etc/nginx/ssl/letsencrypt';
    this.accountsDir = options.accountsDir || '/etc/nginx/ssl/letsencrypt/accounts';
    this.acmeChallengePath = options.acmeChallengePath || '/var/www/acme-challenge';
  }

  /**
   * Initialize the certificate manager service
   */
  async initialize(): Promise<void> {
    try {
      // Ensure required directories exist
      await fs.mkdir(this.certsDir, { recursive: true });
      await fs.mkdir(this.accountsDir, { recursive: true });
      await fs.mkdir(this.acmeChallengePath, { recursive: true });
      
      console.log(`CertManagerService initialized with:
        - Certificates directory: ${this.certsDir}
        - Accounts directory: ${this.accountsDir}
        - ACME challenge path: ${this.acmeChallengePath}`);
      
      // Start renewal check timer
      this.startRenewalTimer();
    } catch (error: any) {
      console.error('Error initializing CertManagerService:', error);
      throw new Error(`Failed to initialize CertManagerService: ${error.message}`);
    }
  }

  /**
   * Start the certificate renewal timer
   */
  private startRenewalTimer(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
    }
    
    this.renewalTimer = setInterval(async () => {
      try {
        await this.checkAndRenewCertificates();
      } catch (error) {
        console.error('Error in certificate renewal check:', error);
      }
    }, this.renewalCheckIntervalMs);
  }

  /**
   * Check for certificates that need renewal and renew them
   */
  private async checkAndRenewCertificates(): Promise<void> {
    try {
      const certs = await this.listCertificates();
      const now = new Date();
      
      for (const cert of certs) {
        try {
          const expiryDate = new Date(cert.expiryDate);
          const daysRemaining = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysRemaining <= this.renewalThresholdDays) {
            console.log(`Certificate for ${cert.domain} expires in ${daysRemaining} days. Renewing...`);
            await this.renewCertificate(cert.domain, cert.id);
          }
        } catch (error) {
          console.error(`Error checking/renewing certificate for ${cert.domain}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in checkAndRenewCertificates:', error);
    }
  }

  /**
   * Get ACME client instance
   */
  private async getAcmeClient(email: string, production: boolean = true): Promise<any> {
    // Create a directory key if it doesn't exist
    const accountKeyPath = path.join(this.accountsDir, `account_${email.replace(/[^a-zA-Z0-9]/g, '_')}.pem`);
    let accountKey: Buffer;
    
    try {
      accountKey = await fs.readFile(accountKeyPath);
    } catch (error) {
      // Generate and save a new account key
      const newAccountKey = await acme.forge.createPrivateKey();
      await fs.writeFile(accountKeyPath, newAccountKey);
      accountKey = newAccountKey;
    }
    
    // Create ACME client
    return new acme.Client({
      directoryUrl: production
        ? acme.directory.letsencrypt.production
        : acme.directory.letsencrypt.staging,
      accountKey: accountKey
    });
  }

  /**
   * Create a new Let's Encrypt certificate
   */
  async createCertificate(domain: string, email: string, production: boolean = true): Promise<SslCertificate> {
    try {
      console.log(`Requesting Let's Encrypt certificate for ${domain}`);
      
      // Create ACME client
      const client = await this.getAcmeClient(email, production);
      
      // Create a certificate key
      const certKey = await acme.forge.createPrivateKey();
      
      // Create CSR
      const [key, csr] = await acme.forge.createCsr({
        commonName: domain,
        altNames: [domain]
      });
      
      // Get account information or create a new account
      await client.getAccountUrl();
      
      // Create a new order
      const order = await client.createOrder({
        identifiers: [
          { type: 'dns', value: domain }
        ]
      });
      
      // Get authorizations
      const authorizations = await client.getAuthorizations(order);
      
      // Handle challenges
      for (const auth of authorizations) {
        const challenge = auth.challenges.find((c: any) => c.type === 'http-01');
        if (!challenge) {
          throw new Error('HTTP-01 challenge not available');
        }
        
        // Get the key authorization for this challenge
        const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
        
        // Write the challenge file
        const challengePath = path.join(this.acmeChallengePath, challenge.token);
        await fs.mkdir(path.dirname(challengePath), { recursive: true });
        await fs.writeFile(challengePath, keyAuthorization);
        
        // Verify the challenge can be accessed
        try {
          await client.verifyChallenge(auth, challenge);
        } catch (error) {
          console.error(`Challenge verification failed for ${domain}:`, error);
          const errorMsg = error instanceof Error ? error.message : String(error);
          throw new Error(`Challenge verification failed: ${errorMsg}`);
        }
        
        // Let the CA know we're ready to verify
        await client.completeChallenge(challenge);
        
        // Wait for the CA to verify
        await client.waitForValidStatus(challenge);
      }
      
      // Finalize the order
      const finalized = await client.finalizeOrder(order, csr);
      
      // Get the certificate
      const certificate = await client.getCertificate(finalized);
      
      // Parse certificate to get expiry date
      const certInfo = await acme.forge.readCertificateInfo(certificate);
      const expiryDate = certInfo.notAfter.toISOString();
      
      // Generate a unique ID for the certificate
      const certId = `le-${domain.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
      
      // Save the certificate and key
      const certDir = path.join(this.certsDir, certId);
      await fs.mkdir(certDir, { recursive: true });
      
      const certPath = path.join(certDir, 'fullchain.pem');
      const keyPath = path.join(certDir, 'privkey.pem');
      
      await fs.writeFile(certPath, certificate);
      await fs.writeFile(keyPath, key);
      
      // Create certificate object
      const sslCertificate: SslCertificate = {
        id: certId,
        name: `Let's Encrypt - ${domain}`,
        domain,
        certificate,
        privateKey: key,
        expiryDate,
        created: Date.now(),
        isLetsEncrypt: true,
        letsEncryptEmail: email
      };
      
      console.log(`Successfully obtained Let's Encrypt certificate for ${domain}`);
      return sslCertificate;
    } catch (error: any) {
      console.error(`Error obtaining Let's Encrypt certificate for ${domain}:`, error);
      throw new Error(`Failed to obtain Let's Encrypt certificate: ${error.message}`);
    }
  }

  /**
   * Renew a Let's Encrypt certificate
   */
  async renewCertificate(domain: string, certId: string): Promise<SslCertificate> {
    try {
      console.log(`Renewing Let's Encrypt certificate for ${domain}`);
      
      // Get the existing certificate info
      const certDir = path.join(this.certsDir, certId);
      const certPath = path.join(certDir, 'fullchain.pem');
      const keyPath = path.join(certDir, 'privkey.pem');
      
      // Read certificate to get email
      const certContent = await fs.readFile(certPath, 'utf8');
      const certInfo = await acme.forge.readCertificateInfo(certContent);
      
      // Find the email from the account key filename
      const accountKeyFiles = await fs.readdir(this.accountsDir);
      const accountKeyFile = accountKeyFiles.find(file => file.startsWith('account_'));
      
      if (!accountKeyFile) {
        throw new Error('Could not find account key file');
      }
      
      const email = accountKeyFile.replace('account_', '').replace('.pem', '').replace(/_/g, '@');
      
      // Create a new certificate
      const newCert = await this.createCertificate(domain, email);
      
      // Update the existing certificate files
      await fs.writeFile(certPath, newCert.certificate);
      await fs.writeFile(keyPath, newCert.privateKey);
      
      // Return the updated certificate
      return {
        ...newCert,
        id: certId // Keep the same ID
      };
    } catch (error: any) {
      console.error(`Error renewing Let's Encrypt certificate for ${domain}:`, error);
      throw new Error(`Failed to renew Let's Encrypt certificate: ${error.message}`);
    }
  }

  /**
   * List all certificates
   */
  async listCertificates(): Promise<SslCertificate[]> {
    try {
      const certDirs = await fs.readdir(this.certsDir);
      const certificates: SslCertificate[] = [];
      
      for (const dir of certDirs) {
        try {
          const certDir = path.join(this.certsDir, dir);
          const stat = await fs.stat(certDir);
          
          if (!stat.isDirectory()) {
            continue;
          }
          
          const certPath = path.join(certDir, 'fullchain.pem');
          const keyPath = path.join(certDir, 'privkey.pem');
          
          // Check if certificate files exist
          try {
            await fs.access(certPath);
            await fs.access(keyPath);
          } catch (error) {
            continue; // Skip if files don't exist
          }
          
          // Read certificate and key
          const certificate = await fs.readFile(certPath, 'utf8');
          const privateKey = await fs.readFile(keyPath, 'utf8');
          
          // Parse certificate to get domain and expiry date
          const certInfo = await acme.forge.readCertificateInfo(certificate);
          const domain = certInfo.subject.commonName;
          const expiryDate = certInfo.notAfter.toISOString();
          
          certificates.push({
            id: dir,
            name: `Let's Encrypt - ${domain}`,
            domain,
            certificate,
            privateKey,
            expiryDate,
            created: 0, // We don't have this information
            isLetsEncrypt: true,
            letsEncryptEmail: '' // We don't have this information
          });
        } catch (error) {
          console.error(`Error processing certificate directory ${dir}:`, error);
        }
      }
      
      return certificates;
    } catch (error: any) {
      console.error('Error listing certificates:', error);
      throw new Error(`Failed to list certificates: ${error.message}`);
    }
  }

  /**
   * Get certificate paths for a domain
   */
  async getCertificatePaths(certId: string): Promise<{ certPath: string; keyPath: string }> {
    const certDir = path.join(this.certsDir, certId);
    const certPath = path.join(certDir, 'fullchain.pem');
    const keyPath = path.join(certDir, 'privkey.pem');
    
    try {
      await fs.access(certPath);
      await fs.access(keyPath);
    } catch (error) {
      throw new Error(`Certificate files not found for ID ${certId}`);
    }
    
    return { certPath, keyPath };
  }

  /**
   * Configure Nginx for ACME challenges
   */
  async configureNginxForAcmeChallenges(): Promise<void> {
    try {
      // Create a special Nginx configuration for ACME challenges
      const acmeConfig = `
# ACME challenge configuration for Let's Encrypt
server {
    listen 80;
    server_name _;
    
    # ACME challenge location
    location /.well-known/acme-challenge/ {
        root ${this.acmeChallengePath};
        try_files $uri =404;
    }
}`;
      
      // Write the configuration to a file
      // Get the domain configs directory from nginxConfigService
      const configPath = path.join('/etc/nginx/conf.d', 'acme-challenges.conf');
      await fs.writeFile(configPath, acmeConfig);
      
      // Reload Nginx
      await nginxConfigService.reloadNginx();
      
      console.log('Nginx configured for ACME challenges');
    } catch (error: any) {
      console.error('Error configuring Nginx for ACME challenges:', error);
      throw new Error(`Failed to configure Nginx for ACME challenges: ${error.message}`);
    }
  }

  /**
   * Apply Let's Encrypt certificate to a proxy rule
   */
  async applyCertificateToRule(rule: ProxyRule, email: string): Promise<ProxyRule> {
    try {
      if (!rule.domain) {
        throw new Error('Proxy rule must have a domain to apply Let\'s Encrypt certificate');
      }
      
      // Create or renew certificate
      const certificate = await this.createCertificate(rule.domain, email);
      
      // Get certificate paths
      const { certPath, keyPath } = await this.getCertificatePaths(certificate.id);
      
      // Update rule with certificate information
      const updatedRule: ProxyRule = {
        ...rule,
        sslEnabled: true,
        sslCertPath: certPath,
        sslKeyPath: keyPath,
        sslCertificate: certificate,
        letsEncryptEnabled: true,
        letsEncryptEmail: email
      };
      
      return updatedRule;
    } catch (error: any) {
      console.error(`Error applying Let's Encrypt certificate to rule ${rule.id}:`, error);
      throw new Error(`Failed to apply Let's Encrypt certificate: ${error.message}`);
    }
  }
}

// Export a singleton instance
export const certManagerService = new CertManagerService();