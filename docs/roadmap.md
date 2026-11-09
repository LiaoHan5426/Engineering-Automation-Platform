# 路线图

## 当前基线与事实源

当前已提交实现基线为 `8abbd21`（2026-11-09，已推送）；本轮真实diff HTTP验证及工具UNKNOWN人工处置按用户授权随本次提交交付。本文只维护推进顺序；最近验证结果统一见[验收台账](planning-status.md#validation-baseline)，历史执行证据归主题记录。

普通API显式Responses选择与函数工具已实现；原连接真实两轮SQL取证/候选/页面审批/写入读回及重启终态已验；见[模型协议决定](decisions/model-catalog-and-chat-selection.md#普通api连接的协议选择2026-11-05实现与离线回归通过实网待验)。其余切片逐项按台账记录，不以早期“待实施”覆盖后续限定交付。

CT-01追加[显式重连与重试](decisions/chat-engineering-task-slice.md#会话失效与显式重试2026-11-05实现与离线回归通过)：服务端会话丢失不再只读锁死，确认后保留本地会话并重建空模型上下文、仅发送当前草稿；瞬时故障可重新检查。离线回归通过，真实浏览器/供应商与完整持久记忆仍未验收。

- 产品与交互合同：[v1.6 当前方案](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)。五个一级入口固定，旧“双入口/Builder第六入口”已被覆盖。
- 完整工作项及下一验收关口：[规划状态与验收台账](planning-status.md)。未完成项不能由测试、Mock或记录保存替代。
- 架构与运行边界：[architecture](architecture.md)、[module-layout](module-layout.md)、[running-context](running-context.md)。
- 本次技术补强合同：[Agent能力、本地环境与插件演进](decisions/agent-runtime-evolution.md)；继续Spring AI，LangChain4j与向量检索仅在证据触发后比较，不预设替换。
- 实施、验证与失败证据：[主题记录总览](records/README.md)。历史路线全文见[路线图历史](records/roadmap-history.md)。

## 已交付范围与后续阶段

| 主线 | 已交付的限定范围 | 下一关口 |
|---|---|---|
| 工作台/UI | 五入口、会话与场景分面、真实文件浏览、公共UI/主题与图标首片；专家父子导航、任务按需详情和独立三栏编辑工作台 | 新工作台原生125%/150%、全页面焦点/错误矩阵与用户接受；其余图标逐项迁移 |
| 后端结构 | applications/full已接替runtime；engine/ai/web分域，spring条件装配；最小本地/Chat/HTTP与完整Bean图有回归，IDEA原配置启动已验；当前验证结果见台账 | 按[BM剩余关口](decisions/backend-module-composition.md#implementation)收敛Expert/目录/CLI和产品Chat依赖；跨环境启动、schema裁剪与完整产品验收仍独立 |
| SQL Agent | 专业行为版本绑定、有限动态取证、持久检查点/租约/预算、后台调度、单SQL文件审批UI；普通Responses真实两轮整链及重启终态已验；复杂SQL三类限定样例与本地知识授权/删除一致性已验 | 生产SQL/完整作用域与性能质量、UNKNOWN人工处置、通用写工具、其他原生缩放及用户接受 |
| 原型与源码 | GrapesJS三栏编辑、语义预览/版本、草稿保护与本地重开、单目标生成前基线、持久候选和受控应用、目录互锁 | 更多必要映射、多文件约束、授权后的真实供应商自身改页验收 |
| 交付证据 | Run独立检查、源码交付、持久接受/拒绝、POST_HOC/PREBOUND关联 | 在EAP内完成实际改页与用户验收；Git Run不是源码作者 |
| 资源 | 单专家授权知识与旧记忆隔离；Skill文本版本、启停及按需引用 | MCP官方memory包经Expert入口的本机实网验收（固定read_graph协议子进程夹具已验）；通用规划/Agent/Work执行；Skill目录/仓库导入 |
| 上下文/记忆/检索 | **CE-01/KR-01/MCP-01（矩阵 callVerified/listOnly）/MEM-01**；CE 备注 Badge + 压缩未启用备注与 MEM sticky 诚实提示 mock 已验 | 实库跑 FTS 排序对照；CE-01 真实 token/压缩策略仍缺；KR-02 证据触发 |
| 工具/目录 | 程序与固定操作登记、路径发现、工作区/文件树；**FS-01 盘点+刷新+kind/byteSize+inventory+candidateCounts+byKind（mock/真机已验）**；不是安装器 | 批准后的物理迁移/读回/失败恢复；TM-01一个受管工具；前端预览与本机执行分界 |
| 工具发现/使用 | TD-01统一Git程序/操作与共享版本；TC-01补status/diff持久执行/取消证据与按操作隔离、离页与重启状态恢复、UNKNOWN互锁；真实diff HTTP/JDBC整链及工具UNKNOWN核对关闭阻塞接通；TC-02实例读取保留 | 真实孤儿进程核对、其他工具与用户接受；不按PID跨重启接管。见[Git调用合同](decisions/agent-runtime-evolution.md#git-operation-executions) |
| 插件/场景 | PL-01看板启停/回滚/sticky；本轮显式只读Task列表依赖检查已真机/mock验证，来源/时间与未检查分开；设计器业务已存在 | Run/整体健康与用户接受仍待；PL-02/SC-03后续；核心生命周期不依赖插件存活 |
| 桌面发行 | Electron安全preload壳、bootstrap引导脚手架 | Windows sidecar、一体启停/迁移、安装包验证；签名另需发行决定与凭据 |

## 推进顺序与门禁

后端BM-01～07主体已按顺序实施，继续按模块组合决定的剩余列处理产品耦合、schema和跨环境组合；不重复安排已完成的宿主迁移或专业行为绑定。每片维持完整应用可构建，不把全部模块拆分设为业务迭代前置。详见[模块组合决定](decisions/backend-module-composition.md)。

1. SC-01 零 revision 删除核对已落地；保存中途断连完整未知态与用户接受仍独立；既有未关闭交付关口不借路线回顾关闭。
2. 先明确CE-01/KR-01上下文失效/预算与检索质量基线，以及FS-01数据根/临时资源/迁移合同。MCP-01只读协议与PL-01看板贡献可在边界明确后分别推进，不建设第二套能力注册或模型循环。
3. MEM-01依赖CE-01；TM-01依赖FS-01；PL-02/SC-03依赖PL-01。锁定一个工具/服务器及验收范围，避免全量底座重写；外部插件安装、A2A、MCP Server、万能包管理器延期。
   工具线已完成Git程序/操作统一及status/diff持久人工执行；diff限定已跟踪文件的未暂存差异。本轮补真实HTTP/JDBC验证及工具UNKNOWN人工核对关闭阻塞，原结果仍未知；后续按台账验证真实孤儿进程及其他工具；TC-02后续Host及反向Agent另评审。不等待TM-01或完整插件SDK，不自动执行未知工具或覆盖停用/授权决定。
4. 自身改页在明确范围和供应商授权下继续验收，不以全部技术补强为前置；未知执行/写入不自动扩大权限。桌面sidecar/安装包独立验收，不把preload或工具登记当安装器。
5. KR-02仅在检索基线不足后比较向量/混合/重排；FW-01仅在明确Agent协作需求或框架阻碍后同条件比较LangChain4j，迁移另批。
6. 每个实施阶段同步台账、主方案验收行和相关decision，历史结果进入主题记录。按该阶段用户授权提交/推送并核对远端SHA，保留失败/跳过/未验收项；本机配置和凭据不纳入。已完成阶段的授权不扩展为任意后续操作。

既有CLI、SQL、专家DAG、规则和知识管理继续保留。用户交互接受、真实模型效果和完整产品验收始终独立于单元测试及构建结果。
