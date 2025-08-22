import { describe, expect, it } from 'bun:test';
import { 
  API_BASE_URL, 
  CONTAINERS_ENDPOINT, 
  PROXY_ENDPOINT, 
  WS_EVENTS, 
  STATUS_CODES, 
  CONTAINER_STATUS, 
  HEALTH_STATUS 
} from '../shared/src/constants';

describe('Shared Constants', () => {
  describe('API endpoints', () => {
    it('should have correct base URL', () => {
      expect(API_BASE_URL).toBe('/api');
    });

    it('should have correct endpoint paths', () => {
      expect(CONTAINERS_ENDPOINT).toBe('/api/containers');
      expect(PROXY_ENDPOINT).toBe('/api/proxy');
    });
  });

  describe('WebSocket events', () => {
    it('should have container events', () => {
      expect(WS_EVENTS.CONTAINER_CREATED).toBe('container:created');
      expect(WS_EVENTS.CONTAINER_UPDATED).toBe('container:updated');
    });

    it('should have proxy events', () => {
      expect(WS_EVENTS.PROXY_RULE_CREATED).toBe('proxy:rule:created');
      expect(WS_EVENTS.PROXY_TRAFFIC).toBe('proxy:traffic');
    });
  });

  describe('Status codes', () => {
    it('should have HTTP status codes', () => {
      expect(STATUS_CODES.OK).toBe(200);
      expect(STATUS_CODES.NOT_FOUND).toBe(404);
      expect(STATUS_CODES.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('Container statuses', () => {
    it('should have container status values', () => {
      expect(CONTAINER_STATUS.RUNNING).toBe('running');
      expect(CONTAINER_STATUS.STOPPED).toBe('stopped');
    });
  });

  describe('Health statuses', () => {
    it('should have health status values', () => {
      expect(HEALTH_STATUS.HEALTHY).toBe('healthy');
      expect(HEALTH_STATUS.UNHEALTHY).toBe('unhealthy');
    });
  });
});
