// A small JSON file used as the database until Phase 3 brings PostgreSQL. It only holds people who
// confirmed the newsletter. The file is private to the server user (mode 0600).
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function jsonStore(file, initial) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const data = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : structuredClone(initial);
  return {
    data,
    save() {
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, file);
    },
  };
}
