export function canArchiveLocally({ protocol, hostname }) {
  return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}
