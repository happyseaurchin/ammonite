// Filesystem storage adapter — read/write a single JSON file.
// Works on any machine with a filesystem: local dev, thumb drive, server.

import { readFileSync, writeFileSync } from 'fs';

export function createFilesystemStorage(filePath) {
  return {
    load() {
      try {
        const raw = readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    save(shell) {
      writeFileSync(filePath, JSON.stringify(shell, null, 2), 'utf8');
    },
  };
}
