# @eap/request

通用 HTTP 传输包，依赖 Axios；不包含 EAP API、业务错误码、默认授权/刷新地址、Vue、进度条或消息提示。

```ts
import { createRequestClient, createUploadRequest, download, openStream } from '@eap/request'

const client = createRequestClient({
  baseURL: configuration.baseURL,
  timeout: 15_000,
  headersForRequest: () => ({ Authorization: credentials.authorization }),
  onPendingChange: (count) => progress.update(count),
})

const response = await client.get<Resource>(resourcePath, { signal })
client.interceptors.response.use(handleResponse, handleFailure)
const upload = createUploadRequest(client, uploadPath, { fieldName: 'attachment' })
const result = await upload(file, { signal, onProgress })
const fileResponse = await download(client, downloadPath, { signal })
const streamResponse = await openStream(client, streamPath, { method: 'POST', body, signal })
```

普通请求保留 Axios 的响应、拦截器及配置能力。`isRequestError` 识别 JSON 请求和流握手的 HTTP 错误，保留 `response.status/data`，不解释业务信封；`isRequestCancelled` 识别取消。失败不自动重放请求，认证更新与重试由调用方根据操作语义决定。

`openStream` 返回原生 Response；复用客户端 baseURL、common headers、动态 headers 和 withCredentials，额外 headers 由该调用覆盖。timeout 仅约束响应头，成功后清除计时器；流协议解析、帧限额、后续读取和关闭归调用方。它不运行 Axios adapter/interceptors，不声称支持所有 Axios 配置。

`createUploadRequest` 构造 FormData，可传 fieldName/fields、取消和进度回调，不手写 multipart boundary。调用方显式执行上传。`download` 返回响应数据和 headers，由调用方决定是否及如何保存文件，没有 DOM 或文件系统副作用。

在其他仓库使用时携带本包源码和 package.json 依赖即可；业务包只能向它依赖，不反向导入应用。
