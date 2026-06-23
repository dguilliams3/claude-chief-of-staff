/**
 * thread-stream's published d.ts still references worker_threads.TransferListItem,
 * but the current Node typings expose that surface as Transferable.
 *
 * Keep this shim local to server/local so the public repo stays type-clean
 * without weakening global typecheck settings.
 */
declare module 'worker_threads' {
  export type TransferListItem = Transferable;
}

declare module 'node:worker_threads' {
  export type TransferListItem = Transferable;
}
