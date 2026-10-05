# 专家工作流与手动重启检查

## 使用路径

1. 在数据库资料中登记脱敏表结构、字段类型和索引前导列，不保存密码、Token 或 JDBC 地址，不连接业务数据库。
2. 创建知识库，录入脱敏业务规则和已验证案例。
3. 复制内置专家，选择能力节点并建立依赖连线。节点名称和数组位置不决定执行顺序。
4. 选择知识库和数据库资料，校验并保存草稿。
5. 显式启用并授权。草稿引用不等于读取授权；保存新修改会停用专家并撤销旧授权。
6. 在 SQL 工作台选择已启用专家，提供问题、SQL，以及可选的资料和 EXPLAIN JSON 快照。
7. 检查建议、知识引用和逐节点结果。必需节点失败会阻止依赖节点；缺少可选上下文返回部分分析，不伪装完成。

当前知识检索使用 PostgreSQL 全文检索和本地关键词（含中文二元切分），不是向量检索或通用语言理解。SQL 分析基于 AST，并将实际关联列与显式授权的结构、索引快照比较。快照不是实时数据库或平台实测的查询性能。

默认不调用模型，也不执行输入或模型生成的 SQL。模型增强需逐次选择；远端模型还需设置 EAP_LLM_ALLOW_REMOTE=true，并使用 HTTPS。模型文本始终是待验证观察，不能把部分流程变成已接受的完成状态。

## 接口

- GET /api/experts：定义、启用状态与版本。
- GET /api/experts/catalog：运行时实际支持的编排能力与规则。
- POST /api/experts/validate：服务端独立检查图结构、引用和规则。
- POST /api/experts：保存停用的草稿。
- PUT /api/experts/{id}/activation：显式启用、授权或停用、撤销授权。
- POST /api/experts/{id}/execute：执行 DAG 并持久化观察。
- POST /api/sql/analyze：使用相同执行器，自定义 expertId 必须已启用。
- GET /api/tasks/{id}：读取完整任务证据。
- GET/POST /api/databases、GET/PUT /api/databases/{id}：维护脱敏资料。

服务只监听 loopback；目前假设可信本地操作者，不是带账户和角色的多用户部署。加上认证授权层之前，不要公开这些接口。

## 手动重启

先刷新 Maven 项目。Spring Boot 4 需要 Flyway Starter 和 PostgreSQL Flyway 模块，而不只是 flyway-core，参见[官方初始化说明](https://docs.spring.io/spring-boot/how-to/data-initialization.html)。

当前手工建立的 eap schema 没有 Flyway 历史。首次接管启动时，在 IDE 运行配置增加环境变量：

    EAP_ADOPT_EXISTING_SCHEMA=true

启动策略先检查预期旧表、字段和 embedding 可空状态，再登记 V5 基线并执行 V6。不会 clean、repair、删除旧表数据或改写旧校验和。未显式允许接管时，已有表但缺少历史的库会停止启动并返回说明。

若结构检查不通过，先核对数据库，不要强行接管或 repair。首次迁移成功后移除该环境变量。空库按普通 V1–V6 迁移启动，不需要接管变量。

## 验证范围

后端单元测试覆盖图排序、断开与循环、必需隐私规则、未知能力、SQL 关联 AST、脱敏、无授权不读取知识、具体索引推断、必需节点阻塞、进程超时和并发限量输出。

前端回归测试覆盖图校验、错误反馈以及专家、知识库、数据库资料页面初始化。常用命令：

    cd backend
    mvn -pl eap-runtime -am test
    cd ../frontend
    vp build
    vp test run
    vp lint apps/web/src packages/ui/src

DatabaseSchemaProbeTest 默认跳过，显式设置 EAP_CHECK_SCHEMA=true 才使用只读连接检查旧库。它不启动后端、不运行迁移。新授权与执行接口的端到端验收须在用户手动重启后完成。
