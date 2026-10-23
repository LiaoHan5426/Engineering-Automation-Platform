# P0 运行验证基线报告

## P0 收尾更新（2026-10-23 17:04，Asia/Shanghai）

本轮已获明确授权，仅修改App.vue三个模板条件：重跑操作与任务时间线增加 `&& task`，报告容器增加 `&& sqlResult`；重跑按钮从 `rerunTask(task!)` 改为守卫内 `rerunTask(task)`。无any、ts-ignore或严格检查配置变更，未重构组件/业务逻辑；原有empty、sqlBusy、sqlError/taskError等提示保留。直接对象守卫使vue-tsc在子树内正确收窄nullable ref。

| 重跑命令（经verify-p0.ps1，正常宿主环境） | 耗时 | 结果 |
|---|---|---|
| pnpm --dir frontend typecheck | 3.40s | exit 0，26处TS18047已消除 |
| pnpm --dir frontend test run | 3.16s | exit 0，9文件47项通过 |
| pnpm --dir frontend build | 2.11s | exit 0，136模块 |
| pnpm --dir frontend check:boundaries | 0.62s | exit 0 |

日志为spring-ai-consolidation-report.md下20261023-170344/typecheck、170354/test、170414/build、170420/boundaries对应时间戳文件。未新增镜像实现的测试，使用已有前端回归和严格类型检查。没有浏览器视觉/E2E验收；数据库集成、真实知识检索、MCP、Codex执行仍未验证，pnpm版本偏差仍保留。后文“类型检查失败”是修复前历史记录，不代表当前状态。

开始时保留scripts/verify-p0.ps1修改和既有未跟踪日志/报告/设计。本轮业务源码只改App.vue，更新此报告与P1设计，并产生验证日志；未提交/推送。P1只完善执行ID、取消、事件、Artifact、跨平台边界及切片验收，没有生产实现。

日期：2026-10-23。范围：运行环境、测试停滞定位和验证脚本；没有实施 P1–P5，没有修改业务代码、POM、测试断言或依赖锁文件。

## 基线与文件保护

开始时 HEAD 为 1b9a556，工作区包含前次已列出的用户修改与指导文档。本轮期间用户手动提交为 a9b14bc，用户已确认该来源。未执行清理、重置、提交或推送。验证结果针对本机当时工作区；未将结果追溯宣称为旧 HEAD 的纯净构建。

## 环境

| 工具 | 实际版本/情况 |
|---|---|
| JDK | Oracle Java 25.0.4，H:/developerTools/jdk/jdk-25.0.4；符合 release 25 |
| Maven | 3.9.16；Surefire 3.5.6（运行日志） |
| Node | 24.22.1，VitePlus 工具目录 |
| pnpm | 12.15.0；packageManager 声明12.9.0，存在偏差，本轮未擅自降级或重装 |
| Vite+ | 全局/本地1.1.0；vite alias 实际为 @voidzero-dev/vite-plus-core 1.1.0 |
| TypeScript / vue-tsc | 6.0.3 / 3.3.11 |
| 测试工具 | vp test 输出 Vitest 5.0.3 |

从仓库根运行 vp --version 报本地工具未找到是上下文差异，frontend/node_modules 中依赖实际存在，真实测试与构建可执行。PowerShell 执行 .ps1 默认被 AuthorizationManager 阻止；运行命令使用仅对该进程生效的 ExecutionPolicy Bypass，没有更改系统执行策略。

## 停滞诊断

受限沙箱：最小 CapabilityCatalogTest 停在 Mockito self-attach，45秒超时；前端 typecheck 45秒无输出超时。沙箱内 CIM 查询不可用，taskkill 返回用户名/密码错误，说明连观察/清理子进程也受限。

正常宿主环境：相同单测7.68秒完成，6项通过，Mockito/ByteBuddy 动态加载成功；完整后端9.89秒完成。前端测试/构建数秒结束，typecheck18.76秒返回真实错误。这组对照将当前停滞定位为执行环境权限边界相关阻塞，而不是已证实的业务死锁、依赖下载或测试断言失败。前端具体阻塞的系统调用尚未采集，不推断是 pnpm 缓存锁。未取得资源耗尽证据；也未做容量压测排除所有资源问题。

Mockito 的动态加载警告不是本次测试失败；未来可单独评估显式 -javaagent，但本轮不为隐藏警告改构建配置。沙箱超时残留的父进程13128，经单独核实创建时间16:50:55及命令确属本轮单测后，在宿主环境清理了该进程树。初次组合清理被自动审批拒绝，后续提供独立归属证据后获准。没有批量终止 java/node 或用户 IDE。

## 实际验证

耗时为脚本记录的墙钟时间；命令从仓库根运行，均在正常宿主环境取得下列结果。

| 命令 | 超时 | 耗时 | 结果 |
|---|---|---|---|
| mvn -B -ntp -f backend/pom.xml -pl eap-runtime -am -Dtest=CapabilityCatalogTest -Dsurefire.failIfNoSpecifiedTests=false test | 60s | 7.68s | exit 0，6通过 |
| mvn -B -ntp -f backend/pom.xml test | 120s | 9.89s | exit 0，110项，108通过、2跳过，失败/错误0 |
| pnpm --dir frontend test run | 90s | 3.49s | exit 0，9文件47项通过 |
| pnpm --dir frontend build | 90s | 2.32s | exit 0，136模块构建 |
| pnpm --dir frontend typecheck | 60s | 18.76s | exit 2，26处TS18047 |
| pnpm --dir frontend check:boundaries | 30s | 0.61s | exit 0 |

两项跳过沿用测试已有条件：CliProgramIntegrationTest 需要 EAP_RUN_CLI_INTEGRATION=true；DatabaseSchemaProbeTest 需要 EAP_CHECK_SCHEMA=true。没有临时新增跳过。前者创建/删除专用数据库，本轮未启用；数据库集成、真实 MCP、知识检索、真实模型和 Codex 委派仍未验收。DefaultProcessExecutorTest 两项真实子进程输出上限/超时测试在完整测试中通过。

typecheck 的26处错误均位于 frontend/apps/web/src/App.vue：1033、1037、1042、1058涉及task，1072至1298其余涉及sqlResult（详细输出见日志）。模板以 streamMode 选择分支，不能据此缩窄另一个 nullable ref。建议在相应模板直接添加对象存在性守卫，并保留 loading/empty 分支；不要用非空断言批量压制。该文件属于已有业务修改，本轮仅给建议，未实施。构建和单测通过不能替代类型检查。

## 重复执行

`rtk proxy powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-p0.ps1 -Name backend -TimeoutSeconds 120`

Name 支持 single、process、typecheck、test、build、boundaries、versions、node、pnpm。脚本用 cmd /d 禁用 AutoRun 干扰、隐藏进程窗口，记录 stdout/stderr、命令、退出码、超时和耗时；只对自己启动的进程树做超时清理，清理失败明确报错。应在正常宿主终端运行；Codex 沙箱中需要审批提升执行权限。输出位于 spring-ai-consolidation-report.md，修订后采用时间戳避免覆盖，JSON为UTF-8无BOM并向调用者传播真实退出码。

早期探索脚本使用固定日志名，沙箱和宿主先后运行造成 single/typecheck 的结果JSON覆盖，最终宿主结果以上表和保存的 stdout/stderr为准；不把这些早期JSON作为唯一证据。versions首轮exitCode为null，是PowerShell进程句柄未保留导致，脚本已修正；不将null视作0。修订后的 boundaries 重跑通过，验证了日志与成功退出码路径。

## 结论与建议

P0诊断交付完成：命令能够有界执行并给出真实结果；基线不是全绿，typecheck仍失败，数据库集成仍未验证。无需改POM或降低断言。建议先批准最小模板空值守卫修复，再按同一脚本重跑typecheck及相关前端测试；pnpm版本对齐作为独立环境变更记录，不在本轮自动重装。P1设计另见 docs/decisions/p1-cli-codex-design.md，尚未实施。

> 2026-10-23专项清理：上述历史中间产物路径已转向保留的最终报告；历史结论不变，原始输出不再长期保存。
