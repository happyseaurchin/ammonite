// Memory storage adapter — in-memory, ephemeral.
// The simplest possible adapter: one object in RAM.
// Shell dies when the process dies.

export function createMemoryStorage(initialShell = null) {
  let shell = initialShell ? structuredClone(initialShell) : { tree: { _: 'Empty shell.' } };

  return {
    load() {
      return structuredClone(shell);
    },
    save(s) {
      shell = structuredClone(s);
    },
  };
}
