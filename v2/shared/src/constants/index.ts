// API endpoints
export const API_BASE_URL = '/api';
export const CONTAINERS_ENDPOINT = `${API_BASE_URL}/containers`;
export const PROXY_ENDPOINT = `${API_BASE_URL}/proxy`;
export const CONFIG_ENDPOINT = `${API_BASE_URL}/config`;
export const HEALTH_ENDPOINT = `${API_BASE_URL}/health`;

// WebSocket events
export const WS_EVENTS = {
  CONTAINER_CREATED: 'container:created',
  CONTAINER_UPDATED: 'container:updated',
  CONTAINER_DELETED: 'container:deleted',
  CONTAINER_STATS: 'container:stats',
  PROXY_RULE_CREATED: 'proxy:rule:created',
  PROXY_RULE_UPDATED: 'proxy:rule:updated',
  PROXY_RULE_DELETED: 'proxy:rule:deleted',
  PROXY_TRAFFIC: 'proxy:traffic',
  SYSTEM_HEALTH: 'system:health',
  SYSTEM_RESOURCES: 'system:resources'
};

// Status codes
export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

// Container statuses
export const CONTAINER_STATUS = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  PAUSED: 'paused',
  EXITED: 'exited',
  CREATED: 'created'
};

// Health statuses
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy'
};