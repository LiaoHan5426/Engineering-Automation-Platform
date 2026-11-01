# 路线图

## 当前基线与事实源

已交付基线 `main / 82aa504`。这是现行路线摘要，不是逐轮工作日志：

- 产品与交互合同：[v1.6 当前方案](EAP-frontend-architecture-adjustment-v1.6-Spring-AI.md)。五个一级入口固定，旧“双入口/Builder第六入口”已被覆盖。
- 完整工作项及下一验收关口：[规划状态与验收台账](planning-status.md)。未完成项不能由测试、Mock或记录保存替代。
- 架构与运行边界：[architecture](architecture.md)、[module-layout](module-layout.md)、[running-context](running-context.md)。
- 实施、验证与失败证据：[主题记录总览](records/README.md)。历史路线全文见[路线图历史](records/roadmap-history.md)。

## 已交付范围与后续阶段

| 主线 | 已交付的限定范围 | 下一关口 |
|---|---|---|
| 工作台/UI | 五入口、会话与场景分面、真实文件浏览、公共UI/主题、图标首片及Comments 1–10纠偏 | 全页面尺寸/焦点/错误矩阵、真实缩放和用户接受；其余图标逐项迁移 |
| 后端结构 | api/engine/ai/web/runtime五模块，runtime只启动装配；既有迁移与业务合同保留 | IDEA重新导入Maven和真实启动；不把结构调整当业务新增 |
| 原型与源码 | GrapesJS语义预览/版本、单目标生成前基线、持久候选和受控应用、目录互锁 | 更多必要映射、多文件约束、授权后的真实供应商自身改页验收 |
| 交付证据 | Run独立检查、源码交付、持久接受/拒绝、POST_HOC/PREBOUND关联 | 在EAP内完成实际改页与用户验收；Git Run不是源码作者 |
| 资源 | 单专家授权知识与旧记忆隔离；Skill文本版本、启停及按需引用 | MCP真实initialize/list/call、规划/Agent/Work执行；Skill目录/仓库导入 |
| 桌面发行 | Electron安全preload壳、bootstrap引导脚手架 | Windows sidecar、一体启停/迁移、安装包验证；签名另需发行决定与凭据 |

## 推进顺序与门禁

1. 先完成当前阶段的测试/文档整理，保留有效回归与完整历史证据，不借整理改业务。
2. 资源能力按最小合同推进，不建设第二套注册中心或模型工具循环；MCP登记和探测不等于真实调用。
3. 自身改页只在明确范围和供应商授权下验收；未知执行/写入保持阻塞，不自动扩大权限。
4. 桌面产品化独立验证真实平台环境；不把preload脚手架当完整安装器。
5. 每个阶段同步台账、相关总览与产品合同，执行检查和独立审查后提交推送；`application.yml`持续排除。

既有CLI、SQL、专家DAG、规则和知识管理继续保留。用户交互接受、真实模型效果和完整产品验收始终独立于单元测试及构建结果。
