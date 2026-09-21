import { parentPort, workerData } from 'node:worker_threads';

type Result = { ok: true; text: string } | { ok: false; error: string };

async function extract(): Promise<Result> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const bytes = workerData as Uint8Array;
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const out = Array.isArray(text)
      ? text.join('\n\n').trim()
      : String(text ?? '').trim();
    return { ok: true, text: out };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

void extract().then((result) => {
  parentPort?.postMessage(result);
});
