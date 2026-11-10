# 独立开发 Mock 服务

这是显式模拟环境，数据仅保存在此 Node 进程中。它不会代理 Java、调用模型、执行 Git 或写入真实工作区。未实现的 API 返回错误。

从仓库根在两个终端启动：

```powershell
rtk proxy pnpm --dir frontend dev:mock-server
rtk proxy pnpm --dir frontend dev:mock
```

服务默认绑定 `127.0.0.1:53200`，可通过 `EAP_MOCK_PORT` 调整。web 的 `--mode mock` 仅把 `/api` 开发代理指向该服务；普通开发默认指向 Java `:8080`，可用 `EAP_API_PROXY` 显式指定代理目标。正式 web 源码和生产构建不导入此包。

服务复用 `@eap/runtime-client/contracts` 的领域合同，响应带 `X-EAP-Simulation: true`。JSON/SSE 使用正常状态值和统一 ProblemDetail；模拟结果不作为真实执行、数据库持久化或供应商验证证据。模拟覆盖聊天、模型设置、版本、看板、场景、知识、资料、技能及能力/Git 操作的有界合同；技能解析仅接受 `src/skillFixture.ts` 中的安全文本，不提供通用解析器。

故障通过本服务 `POST /__mock/faults` 配置下一次匹配请求。示例：

```json
{"method":"POST","path":"/api/cli-programs/git/operations/git-diff/executions","outcome":"unknown"}
```

随后用正常 UI 发起操作；没有前端故障按钮或公共客户端 `mockOutcome` 参数。场景保存结果丢失可为 `PUT /api/scenarios/<id>` 配 `save-lost`。故障配置只允许服务列明的本地路径，不支持代理 URL。

本包测试在 `__tests__/`；正式业务代码不得导入。其他包的测试如需内存协议后端，可声明 devDependency 并使用公开 `@eap/backend-mock/backend` export。启动需要支持 TypeScript strip 的现代 Node（本轮 Node 26 已实际启动），不使用 TS parameter properties 等需转译语法。
