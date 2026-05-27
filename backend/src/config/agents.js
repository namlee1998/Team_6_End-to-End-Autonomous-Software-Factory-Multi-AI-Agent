const { AGENTS_BASE_URL } = require('./environment');

const AGENT_ENDPOINTS = {
  RUN: '/v1/agent/run',
  STREAM_WS: '/v1/agent/stream',
};

const getAgentUrl = (endpoint) => `${AGENTS_BASE_URL}${endpoint}`;

const getWebSocketUrl = (sessionId) => {
  const wsProtocol = AGENTS_BASE_URL.startsWith('https') ? 'wss' : 'ws';
  const host = AGENTS_BASE_URL.replace(/^https?:\/\//, '');
  return `${wsProtocol}://${host}${AGENT_ENDPOINTS.STREAM_WS}/${sessionId}`;
};

module.exports = { AGENT_ENDPOINTS, getAgentUrl, getWebSocketUrl };
