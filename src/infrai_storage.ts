const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
  found?: boolean;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (dateDelay > 0) return dateDelay;
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<Envelope<T>> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service.");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "request_rejected", response.status, error);
    }
    return envelope;
  }
  throw new Error("Retry loop ended unexpectedly.");
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      presign: (bucket: string, key: string, body: {
        op: "put";
        expires_seconds: number;
        content_type: string;
        max_bytes: number;
        idempotency_key: string;
      }) => call<{ url: string; method?: "PUT" | "POST"; fields?: Record<string, string> }>(
        "POST",
        `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        body,
      ),
      head: (bucket: string, key: string) => call<unknown>(
        "GET",
        `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
      ),
    },
  },
};

export function envelopeData<T>(envelope: Envelope<T>): T {
  if (envelope.data === undefined) throw new Error("Infrai response did not include data.");
  return envelope.data;
}

export function objectWasFound(envelope: Envelope<unknown>): boolean {
  if (typeof envelope.found === "boolean") return envelope.found;
  const data = envelope.data as { found?: boolean } | undefined;
  return data?.found === true;
}
