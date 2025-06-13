import axios from 'axios';
import { ConfigurationBackup } from '../../../shared/src/models';

const API_BASE_URL = '/api/config';

/**
 * Fetches application configuration
 */
export const fetchConfiguration = async (): Promise<Record<string, any>> => {
  const response = await axios.get<Record<string, any>>(API_BASE_URL);
  return response.data;
};

/**
 * Updates application configuration
 */
export const updateConfiguration = async (config: Record<string, any>): Promise<Record<string, any>> => {
  const response = await axios.put<Record<string, any>>(API_BASE_URL, config);
  return response.data;
};

/**
 * Fetches all configuration backups
 */
export const fetchBackups = async (): Promise<ConfigurationBackup[]> => {
  const response = await axios.get<ConfigurationBackup[]>(`${API_BASE_URL}/backups`);
  return response.data;
};

/**
 * Creates a new configuration backup
 */
export const createBackup = async (description?: string): Promise<ConfigurationBackup> => {
  const response = await axios.post<ConfigurationBackup>(`${API_BASE_URL}/backups`, { description });
  return response.data;
};

/**
 * Fetches a specific backup by ID
 */
export const fetchBackupById = async (id: string): Promise<ConfigurationBackup> => {
  const response = await axios.get<ConfigurationBackup>(`${API_BASE_URL}/backups/${id}`);
  return response.data;
};

/**
 * Restores configuration from a backup
 */
export const restoreBackup = async (id: string): Promise<Record<string, any>> => {
  const response = await axios.post<Record<string, any>>(`${API_BASE_URL}/backups/${id}/restore`);
  return response.data;
};

/**
 * Deletes a backup
 */
export const deleteBackup = async (id: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/backups/${id}`);
};

/**
 * Exports configuration as a file
 */
export const exportConfiguration = async (): Promise<Blob> => {
  const response = await axios.get(`${API_BASE_URL}/export`, {
    responseType: 'blob'
  });
  return response.data;
};

/**
 * Imports configuration from a file
 */
export const importConfiguration = async (file: File): Promise<Record<string, any>> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await axios.post<Record<string, any>>(`${API_BASE_URL}/import`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  
  return response.data;
};

/**
 * Resets configuration to defaults
 */
export const resetConfiguration = async (): Promise<Record<string, any>> => {
  const response = await axios.post<Record<string, any>>(`${API_BASE_URL}/reset`);
  return response.data;
};

/**
 * Validates configuration
 */
export const validateConfiguration = async (config: Record<string, any>): Promise<{
  valid: boolean;
  errors?: Record<string, string>;
}> => {
  const response = await axios.post<{
    valid: boolean;
    errors?: Record<string, string>;
  }>(`${API_BASE_URL}/validate`, config);
  
  return response.data;
};