import { field } from './field';

addEventListener('message', (e: MessageEvent<{ alpha: Uint8Array; w: number; h: number; to: MessagePort }>) => {
  const { alpha, w, h, to } = e.data;
  const d = field(alpha, w, h);
  to.postMessage(d, [d.buffer]);
});
