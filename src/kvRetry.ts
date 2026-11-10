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
  // Workers KV permits one write per key per second. Start retries after that
  // window and exponentially back off so shared rollup keys can recover from
  // concurrent writers without surfacing a transient 429 as a failed job.
  const delays = [1_000, 2_000, 4_000, 8_000];
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
