import axios, {
  AxiosHeaders,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

export type RequestClient = AxiosInstance
export type RequestOptions = AxiosRequestConfig
export type RequestResponse<T = unknown> = AxiosResponse<T>
export type RequestHeaders = Record<string, string | undefined>
export type RequestClientOptions = AxiosRequestConfig & {
  headersForRequest?: () => RequestHeaders
  onPendingChange?: (pending: number) => void
}
const requestOptions = new WeakMap<RequestClient, RequestClientOptions>()

/** Transport only: endpoints, credentials, envelope interpretation and UI feedback belong to callers. */
export function createRequestClient(options: RequestClientOptions = {}): RequestClient {
  const { headersForRequest, onPendingChange, ...config } = options
  const client = axios.create({ timeout: 10_000, ...config })
  requestOptions.set(client, options)
  let pending = 0
  client.interceptors.request.use((request) => {
    const headers = headersForRequest?.()
    if (headers)
      for (const [key, value] of Object.entries(headers)) {
        if (value !== undefined) request.headers.set(key, value)
      }
    onPendingChange?.(++pending)
    return request
  })
  const finish = () => {
    pending = Math.max(0, pending - 1)
    onPendingChange?.(pending)
  }
  client.interceptors.response.use(
    (response) => {
      finish()
      return response
    },
    (error: unknown) => {
      finish()
      return Promise.reject(error)
    },
  )
  return client
}

export class RequestError<T = unknown> extends Error {
  readonly isRequestError = true
  constructor(
    message: string,
    readonly response?: { status: number; data: T; headers?: Headers },
    readonly code?: string,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/** Recognizes both Axios transport failures and fetch/stream handshake failures. */
export function isRequestError<T = Record<string, unknown>>(
  error: unknown,
): error is {
  message: string
  code?: string
  response?: { status: number; data: T }
  isAxiosError?: boolean
} {
  return axios.isAxiosError(error) || error instanceof RequestError
}
export function isRequestCancelled(error: unknown) {
  return axios.isCancel(error) || (error instanceof Error && error.name === 'AbortError')
}

export type StreamRequestOptions = {
  method?: string
  body?: unknown
  headers?: RequestHeaders
  signal?: AbortSignal
  /** Applies to response headers; the caller owns stream lifetime and frame limits. */
  timeout?: number
}

/** Opens a stream using the same URL, default headers, credentials and cancellation contract as JSON requests. */
export async function openStream(
  client: RequestClient,
  path: string,
  options: StreamRequestOptions = {},
): Promise<Response> {
  const headers = new AxiosHeaders()
  for (const [name, value] of Object.entries(client.defaults.headers.common))
    if (value != null) headers.set(name, String(value))
  for (const [name, value] of Object.entries(
    requestOptions.get(client)?.headersForRequest?.() ?? {},
  ))
    if (value !== undefined) headers.set(name, value)
  for (const [name, value] of Object.entries(options.headers ?? {}))
    if (value !== undefined) headers.set(name, value)
  if (options.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')
  const timeout = options.timeout ?? client.defaults.timeout
  const deadline = new AbortController()
  const timer =
    timeout && timeout > 0
      ? setTimeout(
          () => deadline.abort(new DOMException('Request timed out', 'TimeoutError')),
          timeout,
        )
      : undefined
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal
  let response: Response
  try {
    response = await fetch(client.getUri({ url: path }), {
      method: options.method ?? 'GET',
      headers: headers.toJSON() as Record<string, string>,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
      credentials: client.defaults.withCredentials ? 'include' : 'same-origin',
    })
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
  if (!response.ok) {
    let data: unknown = null
    try {
      data = await response.json()
    } catch {
      /* Non-JSON HTTP failures have no business envelope. */
    }
    throw new RequestError(`HTTP ${response.status}`, {
      status: response.status,
      data,
      headers: response.headers,
    })
  }
  return response
}

export type UploadProgress = { loaded: number; total?: number; percent?: number }
export type UploadRequest = (
  file: File,
  options: { signal: AbortSignal; onProgress: (progress: UploadProgress) => void },
) => Promise<unknown>

/** Caller supplies route, multipart field and extra fields. Never sets a multipart boundary by hand. */
export function createUploadRequest<T = unknown>(
  client: RequestClient,
  path: string,
  options: RequestOptions & { fieldName?: string; fields?: Record<string, string> } = {},
): UploadRequest {
  const { fieldName = 'file', fields, ...config } = options
  return async (file, { signal, onProgress }) => {
    const body = new FormData()
    for (const [name, value] of Object.entries(fields ?? {})) body.append(name, value)
    body.append(fieldName, file)
    const response = await client.post<T>(path, body, {
      ...config,
      signal,
      onUploadProgress: (event) => {
        const total = event.total
        onProgress({
          loaded: event.loaded,
          total,
          percent: total ? Math.round((event.loaded / total) * 100) : undefined,
        })
      },
    })
    return response.data
  }
}

/** Returns the response body and headers; the caller decides whether and where to save it. */
export function download<T = Blob>(
  client: RequestClient,
  path: string,
  options: RequestOptions = {},
) {
  return client.get<T>(path, { ...options, responseType: options.responseType ?? 'blob' })
}
