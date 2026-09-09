import * as net from 'node:net';

export interface Endpoint {
  host: string;
  port: number;
}

export const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function label({ host, port }: Endpoint): string {
  return `${host}:${port}`;
}

export function candidates(configured: Endpoint, published: number): Endpoint[] {
  if (!LOCAL_HOSTS.has(configured.host)) return [configured];
  if (!Number.isInteger(published) || published === configured.port) {
    return [configured];
  }

  return [{ host: configured.host, port: published }, configured];
}

export function isReachable(
  endpoint: Endpoint,
  timeoutMs = 300,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: endpoint.host, port: endpoint.port });

    const settle = (reachable: boolean): void => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}
