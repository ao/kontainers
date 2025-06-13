/**
 * Configuration-related models for Kontainers application
 */

/**
 * Data class representing a configuration backup.
 */
export interface ConfigurationBackup {
  timestamp: number;
  version: string;
  description?: string;
  createdBy?: string;
  
  // Additional fields needed by JS components
  id: string;
  name: string;
  size: number;
  components: string[];
}