import axios from 'axios';
import { Container, ContainerStats, DetailedContainerStats } from '../../../shared/src/models';

const API_BASE_URL = '/api/containers';

/**
 * Fetches all containers
 */
export const fetchContainers = async (): Promise<Container[]> => {
  const response = await axios.get<Container[]>(API_BASE_URL);
  return response.data;
};

/**
 * Fetches a specific container by ID
 */
export const fetchContainerById = async (id: string): Promise<Container> => {
  const response = await axios.get<Container>(`${API_BASE_URL}/${id}`);
  return response.data;
};

/**
 * Fetches container stats
 */
export const fetchContainerStats = async (id: string): Promise<ContainerStats> => {
  const response = await axios.get<ContainerStats>(`${API_BASE_URL}/${id}/stats`);
  return response.data;
};

/**
 * Fetches detailed container stats
 */
export const fetchDetailedContainerStats = async (id: string): Promise<DetailedContainerStats> => {
  const response = await axios.get<DetailedContainerStats>(`${API_BASE_URL}/${id}/stats/detailed`);
  return response.data;
};

/**
 * Fetches container logs
 */
export const fetchContainerLogs = async (id: string, tail?: number): Promise<string> => {
  const params = tail ? { tail } : {};
  const response = await axios.get<string>(`${API_BASE_URL}/${id}/logs`, { params });
  return response.data;
};

/**
 * Creates a new container
 */
export const createContainer = async (containerData: Omit<Container, 'id' | 'created'>): Promise<Container> => {
  const response = await axios.post<Container>(API_BASE_URL, containerData);
  return response.data;
};

/**
 * Updates a container
 */
export const updateContainer = async (id: string, containerData: Partial<Container>): Promise<Container> => {
  const response = await axios.put<Container>(`${API_BASE_URL}/${id}`, containerData);
  return response.data;
};

/**
 * Deletes a container
 */
export const deleteContainer = async (id: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/${id}`);
};

/**
 * Starts a container
 */
export const startContainer = async (id: string): Promise<Container> => {
  const response = await axios.post<Container>(`${API_BASE_URL}/${id}/start`);
  return response.data;
};

/**
 * Stops a container
 */
export const stopContainer = async (id: string): Promise<Container> => {
  const response = await axios.post<Container>(`${API_BASE_URL}/${id}/stop`);
  return response.data;
};

/**
 * Restarts a container
 */
export const restartContainer = async (id: string): Promise<Container> => {
  const response = await axios.post<Container>(`${API_BASE_URL}/${id}/restart`);
  return response.data;
};

/**
 * Pauses a container
 */
export const pauseContainer = async (id: string): Promise<Container> => {
  const response = await axios.post<Container>(`${API_BASE_URL}/${id}/pause`);
  return response.data;
};

/**
 * Unpauses a container
 */
export const unpauseContainer = async (id: string): Promise<Container> => {
  const response = await axios.post<Container>(`${API_BASE_URL}/${id}/unpause`);
  return response.data;
};