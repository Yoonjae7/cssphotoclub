// Simulates the Redis commands used by the API; no network or credentials in unit tests.
export function memoryRedis(now = Date.now) {
  const data = new Map();
  function read(key) {
    const entry = data.get(key);
    if (entry && entry.expiresAt <= now()) { data.delete(key); return null; }
    return entry?.value ?? null;
  }
  const command = async ([name, ...args]) => {
    if (name === 'PING') return 'PONG';
    if (name === 'GET') return read(args[0]);
    if (name === 'SET') {
      const [key, value, , expiresAt, onlyNew] = args;
      if (onlyNew === 'NX' && read(key) !== null) return null;
      data.set(key, { value, expiresAt: Number(expiresAt) }); return 'OK';
    }
    if (name === 'EVAL') {
      const [script, keyCount, ...rest] = args;
      const keys = rest.slice(0, keyCount), values = rest.slice(keyCount);
      if (script.startsWith('local n=')) {
        const value = Number(read(keys[0]) || 0) + 1;
        data.set(keys[0], { value, expiresAt: data.get(keys[0])?.expiresAt || now() + 60_000 }); return value;
      }
      if (read(keys[0]) !== values[0]) return 0;
      if (script.includes('PEXPIREAT')) {
        if (keys.slice(1).some(key => read(key) === null)) return 0;
        for (const key of keys.slice(1)) data.get(key).expiresAt = Number(values[2]);
        data.set(keys[0], { value: values[1], expiresAt: Number(values[2]) }); return 1;
      }
      data.set(keys[1], { value: values[1], expiresAt: Number(values[2]) }); return 1;
    }
    throw new Error(`Unsupported test command: ${name}`);
  };
  return { command, snapshot() { for (const key of data.keys()) read(key); return data; } };
}
