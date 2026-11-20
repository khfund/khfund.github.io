// Outgoing mail. Phase 2 writes every message to a folder (the "outbox") so nothing is lost and nothing
// is sent by accident. Connect a real mail service by passing another object with the same send()
// method to createForms(); the forms code does not change.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export function fileOutbox(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return {
    kind: 'outbox',
    async send(msg) {
      const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
      const file = join(dir, `${id}.json`);
      writeFileSync(file, `${JSON.stringify({ id, queuedAt: new Date().toISOString(), ...msg }, null, 2)}\n`, { mode: 0o600 });
      return { id, file };
    },
  };
}
