# ChatGPT 账号接入

日期：2026-10-26。对“所有模型都走 API Key”的接入假设进行修正。

## 认证与调用通道

- ChatGPT 订阅使用独立的 Continue with ChatGPT 入口，执行官方本地应用注册、Authorization Code + PKCE 和 OIDC 流程。
- OpenAI API、DeepSeek 和兼容服务继续使用各自 API Key，不把订阅账号令牌转成用户手填密钥，也不读取其他 Codex 应用的登录文件。
- 首次注册使用官方动态注册入口，保存回调返回的 issued client ID。重连使用此 ID 和同一 host ID；校验已验证的账户 subject，避免替换成另一身份。
- 回调监听仅绑定 127.0.0.1，使用随机端口和固定 /auth/callback。state 一次性消费，5 分钟过期。校验 PKCE、JWT 签名、issuer、audience、expiry、iat 和 nonce。
- 身份登录和订阅使用权限分开判断。未授予 resource.invoke / chatgpt.tokens.use.direct 时，不能调用模型。
- 访问令牌过期时按已注册身份刷新，并原子保存轮换的 refresh token。退出清理本应用保存的令牌；不操作其他应用的账号。
- 凭据文件原子写入，写入秘密前设置 POSIX owner-only 权限或 Windows owner-only ACL。浏览器只接收公开授权 URL、状态和连接 ID。

依据：[官方注册与登录](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)、[模型与推理](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)。可用性与实际授权由官方服务和账号决定。

## 模型与会话

ChatGPT 账号目录按其 models 数组、visibility 和 slug 读取；不使用 API Key 目录的 data/id 假设。用户仍需保存允许列表。该通道不支持手动添加未知账号模型。

当前 Spring AI 2.0.2 的 OpenAiChatModel 使用 Chat Completions。增加窄范围 ChatModel 适配器，复用现有 OpenAI Java SDK 和 Spring AI HTTP transport，通过流式 Responses 请求调用，store=false。系统指导写入 instructions，历史作为 input 数组携带。只有收到 response.completed 才返回成功；中断或失败不作为完成。

会话记忆、代码提案、审阅和授权边界继续由现有服务处理。当前订阅通道仅支持文本及代码提案，本地 Git 工具尚未接入，前后端均禁止该组合。

依据：[官方预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)、[Spring AI 2.1 Responses 支持说明](https://spring.io/blog/2026/09/25/spring-ai-2-1-0-M1-available-now/)。本轮不升级整个 Spring AI/Boot 栈，不新增自研工具循环。

## 联调发现

现有 AiBrowserRequestGuard 要求 AI POST 使用 application/json。登录发起、模型同步和设为默认原先未带请求体，实际被 415 CONTENT_TYPE_REJECTED 拒绝。前端改为发送空 JSON 对象；保留后端校验，并增加真实 Axios 编码回归。

Maven 编译可解析 RuntimeWorkspace，同模块源码和字节码均存在，ModelConnections 构造器已初始化 file。IDEA 中这两个未复现于 Maven 的提示，应核对 backend/pom.xml 的 Maven 导入和源码目录识别，不通过复制类或放宽 final 字段处理。

## 验证边界

测试覆盖本地真实回调、state/nonce/audience/expiry 校验、PKCE、回调重放拒绝、重连的 client ID/host ID、令牌轮换、凭据不进入 DTO、Responses 请求映射及流完成判定。UI 实际发起授权，官方登录页已打开，尚未由用户完成授权和真实推理验证。

新增 spring-security-oauth2-jose 依赖用于维护中的 JWT 校验实现。IDEA 需同步 Maven 依赖；后端继续由用户在 IDEA 中管理。
