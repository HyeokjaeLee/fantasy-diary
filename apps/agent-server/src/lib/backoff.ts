type BackoffOptions = {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

type RetryContext = {
  attempt: number;
  retries: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(value: number, jitterRatio: number): number {
  if (jitterRatio <= 0) return value;
  const jitter = value * jitterRatio;

  return value + (Math.random() * 2 - 1) * jitter;
}

export async function withExponentialBackoff<T>(
  fn: (context: RetryContext) => Promise<T>,
  options: BackoffOptions,
  shouldRetry: (error: unknown, context: RetryContext) => boolean
): Promise<T> {
  const retries = Math.max(0, options.retries);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const context = { attempt, retries };

    try {
      return await fn(context);
    } catch (error) {
      const canRetry = shouldRetry(error, context);
      if (!canRetry || attempt >= retries) {
        throw error;
      }

      const exponential = options.baseDelayMs * 2 ** attempt;
      const capped = Math.min(exponential, options.maxDelayMs);
      const delay = Math.max(0, Math.round(withJitter(capped, options.jitterRatio)));
      await sleep(delay);
    }
  }

  throw new Error("Exponential backoff failed unexpectedly.");
}
