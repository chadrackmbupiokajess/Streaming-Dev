const browserHost =
  typeof window !== 'undefined' && window.location.hostname
    ? window.location.hostname
    : 'localhost';

const browserOrigin =
  typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'http://localhost';

const pageProtocol =
  typeof window !== 'undefined' ? window.location.protocol : 'http:';

const apiProtocol = pageProtocol === 'https:' ? 'https:' : 'http:';
const wsProtocol = pageProtocol === 'https:' ? 'wss:' : 'ws:';

const apiHost = process.env.REACT_APP_API_HOST || browserHost;
const wsHost = process.env.REACT_APP_WS_HOST || apiHost;
const defaultApiPort = pageProtocol === 'https:' ? '' : '8001';
const apiPort = process.env.REACT_APP_API_PORT ?? defaultApiPort;
const wsPort = process.env.REACT_APP_WS_PORT ?? apiPort;

function joinBaseUrl(base, path) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildAbsoluteUrl(base) {
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base;
  }

  if (base.startsWith('/')) {
    return new URL(base, browserOrigin).toString();
  }

  return base;
}

function formatOrigin(protocol, host, port) {
  const suffix = port ? `:${port}` : '';
  return `${protocol}//${host}${suffix}`;
}

export const API_URL =
  process.env.REACT_APP_API_URL ||
  joinBaseUrl(formatOrigin(apiProtocol, apiHost, apiPort), '/api');

export const WS_URL =
  process.env.REACT_APP_WS_URL ||
  joinBaseUrl(formatOrigin(wsProtocol, wsHost, wsPort), '/ws');

export function buildWsUrl(path, token) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(joinBaseUrl(buildAbsoluteUrl(WS_URL), normalizedPath));
  if (token) {
    url.searchParams.set('token', token);
  }
  return url.toString();
}

function parseIntegerEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseIceServers() {
  const rawConfig = process.env.REACT_APP_WEBRTC_ICE_SERVERS;
  if (!rawConfig) {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  try {
    const parsed = JSON.parse(rawConfig);
    return Array.isArray(parsed) ? parsed : [{ urls: rawConfig }];
  } catch {
    return [{ urls: rawConfig }];
  }
}

export const WEBRTC_ICE_SERVERS = parseIceServers();

export const WEBRTC_VIDEO_CONFIG = {
  bitrate: parseIntegerEnv(process.env.REACT_APP_WEBRTC_VIDEO_BITRATE, 3500000),
  frameRate: parseIntegerEnv(process.env.REACT_APP_WEBRTC_VIDEO_FPS, 30),
  height: parseIntegerEnv(process.env.REACT_APP_WEBRTC_VIDEO_HEIGHT, 720),
  width: parseIntegerEnv(process.env.REACT_APP_WEBRTC_VIDEO_WIDTH, 1280),
};
