const RETRYABLE_KV_STATUS_PATTERN = /\b(?:429|500|502|503|504)\b/;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isRetryableKvError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE_KV_STATUS_PATTERN.test(message) || /too many requests|temporar/i.test(message);
};

export const putKvWithRetry = async (
  kv: KVNamespace,
  key: string,
  value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
  options?: KVNamespacePutOptions
) => {
  const delays = [50, 150, 450];
  for (let attempt = 0; ; attempt += 1) {
    try {
      await kv.put(key, value, options);
      return;
    } catch (error) {
      if (attempt >= delays.length || !isRetryableKvError(error)) throw error;
      await sleep(delays[attempt]);
    }
  }
};
