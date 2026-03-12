import * as Comlink from 'comlink';
import type { AIWorker } from './ai.worker';

export const aiWorker = Comlink.wrap<AIWorker>(
  new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
);
