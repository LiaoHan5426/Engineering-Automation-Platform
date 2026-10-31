# Frontend mock API

Mock 只替换 HTTP 响应，不另做一套页面。界面始终调用 runtime client 的 `/api` 契约。

| 命令 | 行为 |
|---|---|
| `vp run dev` | 开发服务把 `/api` 代理到 `http://127.0.0.1:8080`（IDEA 中的 Java） |
| `vp run dev:mock` | 在 `frontend` 目录启动 `apps/web`，同一条 `/api` 由 Vite 内存 mock 应答 |
| `VITE_USE_MOCK=true` 后执行 `vp run dev` | 与 `dev:mock` 相同。PowerShell：`$env:VITE_USE_MOCK='true'; vp run dev` |

生产构建不注册 mock，也不读取该开关。`vp run preview` 仍是构建产物预览，不是界面 mock。

聊天、设置和模型目录使用同一客户端与同一路径。模拟会话历史仍写在 `mock.eap.chat.history.v1`，避免和真实会话 ID 混用。界面上的模拟标注只在上述 mock 启动方式下出现，用来说明结果没有调用模型、没有写仓库。

当前覆盖 `/ai/status`、连接创建/编辑/启停/默认设置、模型发现与允许目录保存、模拟账号授权/断开、会话创建/读取/删除、模型切换、消息和候选确认。
响应复用 runtime-client DTO。候选确认只修改内存标记，`mock_only_not_executed` 不代表文件写入或测试通过。
未实现端点返回 404，不转发到 Java，也不调用模型。

知识库 `/knowledge` 提供库/文档的增删改、计数和带可选 `baseId` 的检索；数据库资料 `/databases` 提供元数据快照 CRUD。两者使用与 Java 相同的页面和客户端，拒绝凭据输入，删除后内存检索结果同步消失。知识 mock 仅用关键字包含匹配，不模拟 PostgreSQL 排名，也尚未覆盖启用专家引用导致的删除拒绝；这些边界不能作为真实授权或检索质量证据。原型场景不再按服务来源选择不同组件，统一设计/版本/准备流程；mock 缺少授权根或基线时同样阻止交付。

Mock 状态只保存在开发进程内存里，重启后浏览器里的旧模拟会话会过期。看板已提供 `/board/tasks` 的任务草稿、备注、revision 与状态变更响应，与真实数据库接口共用 UI；不启动 Run，不允许无证据进入 running/done。原型版本复用 `/prototype-versions`，工程与语义 Schema 存在版本正文中；目录接口 `/ai/workspace/files` 的 mock 只提供夹具，不读取仓库。

看板合同集中在 `boardBackend.ts`：planned 可暂存，ready 需要非空 goal/acceptanceCriteria，创建时禁止执行态；创建要求 UUID requestId，同项目同请求去重、内容不一致返回 409；更新要求 projectId + revision，服务端返回 preparationIssues/allowedColumns。优先级支持 none/p0/p1/p2，和备注一样受 revision 校验，保存后进入事件记录。优先级筛选使用接口返回字段。浏览器中的未提交编辑按任务及真实/mock来源隔离缓存，只在明确保存时调用服务；mock重启后不存在的任务不因本机缓存复活。

参考 [Vben backend-mock](https://github.com/vbenjs/vue-vben-admin/tree/main/apps/backend-mock) 的分层：用接口服务支撑同一套前端。这里复用 Vite 中间件，不引入 Nitro，也不另起第二个 UI 进程。

看板真实持久化、并发与页面验证范围见 [任务准备切片](../../../../docs/decisions/board-task-preparation-2026-10-31.md)。

看板 `/board/tasks/{id}/runs` 的 mock 只返回空记录及 `MOCK_RUN_NOT_AVAILABLE`，启动明确拒绝，不模拟执行成功；真实受控执行范围见 [后续切片](../../../../docs/decisions/board-controlled-run-2026-10-31.md)。

Run 的 `/board/tasks/{id}/runs/{executionId}/review` 在 mock 中按项目核对任务后返回 `BOARD_RUN_NOT_FOUND`；mock 没有真实 Run，因此不会生成模拟 Diff 或检查成功。真实采集与重放合同见 [仓库审阅切片](../../../../docs/decisions/board-run-review-2026-10-31.md)。

看板 `/board/tasks/{id}/prototype` 关联接口只接受 projectId、revision 和 versionId（null 解除），校验版本确实存在、项目和并发版本，拒绝伪造正文/哈希；关联会增加任务 revision 并记录事件，重复相同选择不增加。版本正文继续从统一原型 API 读取，mock 同样不因关联而模拟执行或验收。真实数据库与 Run 快照边界见 [原型关联切片](../../../../docs/decisions/board-prototype-link-2026-10-31.md)。
