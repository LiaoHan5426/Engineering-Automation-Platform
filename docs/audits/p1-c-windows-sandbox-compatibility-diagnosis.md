# P1-C Windows沙箱兼容性只读诊断

2026-10-23。仅调查，未执行sandbox启动/setup/uninstall/reset，未修改任何系统状态或EAP生产代码，未调用模型、提交或推送。正常宿主只读查询使用的是中完整性用户令牌，不是管理员修复。

## 组件版本、路径、归属

CLI自报0.163.0-alpha.11.2，位于用户AppData/Local/OpenAI/Codex/bin/37f54d68e5533a51/codex.exe。服务为CodexSandboxService.OpenAI.Codex，Running/Auto/LocalSystem，实际映像位于WindowsApps/OpenAI.Codex_26.1016.8622.0_x64__2p2nqsd0c76g0/app/resources/codex-windows-sandbox-service.exe。CLI用户缓存与桌面包服务是不同安装位置，不能仅凭此断定不兼容。

| 文件 | SHA256 |
|---|---|
| 用户缓存CLI | C81ED464E5E7CAFD09A5FA26AF390C480BED8E9FAB2A87A54B285FBD56E7122A |
| runner-0.163.0-alpha.10.2.exe | 0DE2B882D1F763ECDF4FCC3873FEC18DDCF20646B6291DAC54D33A9F9116D4C4 |
| runner-0.163.0-alpha.11.exe | E95DB2235CDE22F645C835E79E84B7FBC1E8130D7BFC997D94CDAAB8042ECFE7 |
| .sandbox-bin/codex.exe | 3553CD6E7DF5A093D8CB8301CD8088A57E0971ABA71DDBE0E67F7F44A15CDF68 |
| 服务实际映像 | 0202B7E5518CCE054B4FB587FEE64CCA64338478FE4E9FE0B6654A0CB7D4EDE1 |

以上文件的PE FileVersion/ProductVersion均为空；不能把文件名版本当运行时协议版本。.NET读取嵌入证书主体均为OpenAI OpCo, LLC。Get-AuthenticodeSignature模块加载失败，未修改环境修复；证书提取不等于WinVerifyTrust、时间戳、吊销或信任链验证成功，数字签名有效性仍未确认。

setup marker版本5，既有两个账户/组/防火墙/服务的事实沿用前次调查。公开main的setup版本也是5，但精确alpha源码未取得，不能证明二进制一致。多个历史runner共存和不同哈希属于已观察到差异，不构成“明确版本损坏”的证据。未运行helper的任何入口来读取版本。

## 令牌和执行环境差异

受限工具与正常宿主的用户SID相同（末尾1001），无需将完整SID或账号邮件重复到交付报告。

| 项目 | 此前受限工具 | 正常宿主 |
|---|---|---|
| 完整性 | Low，S-1-16-4096 | Medium，S-1-16-8192 |
| Administrators | deny-only | deny-only |
| 用户主体 | 相同LH | 相同LH |
| 管理员提升 | 无 | 无 |

之前受限环境无法CIM查询/终止部分进程、写Codex arg0目录；正常宿主可以读取服务与文件元数据。这支持“调用上下文权限限制”假设，但不证明helper具体失败API。不得因此自动提权启动。

Get-ExecutionPolicy模块同样加载失败；只读注册表显示HKCU ShellIds ExecutionPolicy=RemoteSigned，HKLM PowerShell政策EnableScripts=1且该处ExecutionPolicy为空。它们不是完整有效策略合并结果，也没有证据将helper失败归因于PowerShell脚本策略。

## Managed policy与requirements

只读查询未发现C:/ProgramData/OpenAI/Codex/requirements.toml或用户.codex/requirements.toml，ProgramData/OpenAI下限定TOML搜索无命中；查询的HKLM Software/Policies/OpenAI/Codex没有选定限制字段输出，当前进程未发现CODEX配置/requirements覆盖变量。全局已保存windows.sandbox=elevated。

这些是限定位置的“未发现”，不能宣称机器没有强制政策。包安装的策略路径、MDM、云下发要求、LSA/GPO、服务端有效sandbox-state均未完整取得。本轮不启动app-server或sandbox来补证据。完整有效policy仍未知，无证据说明存在强制禁止，也无证据保证不存在。

## 错误日志与最可能原因

只读取.sandbox/sandbox.2026-10-23.log的限定尾部，筛选error/fail/denied并排除含命令、payload、环境、token/password/secret等行；没有输出原始命令或秘密。命中的多条setup refresh记录均为errors=[]，不能当成错误证据。最近可见日志尾时间为16:43:54附近，未定位到此前18点后探索失败的对应记录；setup_error.json在查询位置不存在。

所以当前能确认的具体失败仍仅为前次`orchestrator_helper_exit_nonzero`和helper exit Some(1)，没有更细的Win32错误码。此前`sandbox windows --help`并非该版有效windows子命令帮助，不能据其结果认定正确sandbox预检必然失败；其后正确宿主预检被审批阻止、未执行。

按证据排序：

1. 较强假设：低完整性/受限调用上下文阻止helper阶段。依据令牌和同环境访问拒绝；缺少对应日志，未证实具体API。
2. 较弱假设：共享服务、CLI与缓存helper安装归属/版本路径不一致。确有多个安装位置，但没有协议不匹配记录或明确错误。
3. 未证实：工作目录ACL、强制政策或登录权导致失败。现状不足，不应建议先改这些资源。

## 临时目录权限与规范化

没有创建新目录，使用前次Smoke留下的独立临时repo作只读样本：C:/Users/LH/AppData/Local/Temp/eap-codex-smoke-1723425824860012776/repo。owner为当前LH用户，AreAccessRulesProtected=false（DACL继承开启），目标Attributes=Directory，icacls显示当前用户/SYSTEM/Administrators继承FullControl，CodexSandboxUsers继承Modify，另有若干SID条目。

FullPath规范化结果与样本路径一致。没有对全部父目录作最终句柄解析或重新验证每个ACE SID用途，不能宣称完整reparse/TOCTOU安全。样本权限不能替代下一次新临时repo权限。未写入文件或ACL进行探测。

## 是否支持直接运行预检

现有基础设施、正常宿主Medium令牌及样本工作区ACL支持“先尝试复用，不先重装”的方向；不能证明执行不会触发helper materialization、ACL刷新、状态文件写入或管理员setup。当前证据不足以批准零副作用启动，更没有必要直接申请管理员初始化。

最小运行权限候选是正常LH的Medium令牌、可读CLI/helper、可访问已有服务和所需凭据元数据、仅临时repo的必要写权限。不是管理员令牌；若已有环境必须修复，当前授权下应停止。管理员级setup应在发现明确缺失资源/登录权/版本错误并完成影响评审后再申请。

如下一轮单独批准无模型启动，可考虑官方帮助对应形式（仅计划，未执行）：

    codex -c sandbox_mode=workspace-write
      -c sandbox_workspace_write.network_access=false
      sandbox --cd <新临时repo> -- cmd.exe /d /c exit 0

该命令没有exec或模型任务，但仍可能触发legacy初始化/ACL刷新，不能称严格只读。运行前需核对实际生效实现及managed requirements，不静默切换。仅允许一次有界探测，出现UAC/setup、账户/网络/服务变更要求、超范围ACL、权限拒绝、配置错误或超时即停止；不得同意初始化、降级沙箱或自动重试。具体启动及潜在状态更新必须另授权。

## 后续建议与来源

当前建议继续只读补足签名可信度、安装归属和有效policy，而非管理员初始化。若用户愿意接受受限运行期状态刷新，可单独批准正常宿主的无模型预检；其授权不应包含重建账户、防火墙修改、卸载/重装或真实模型请求。

公开资料沿用上轮已核对的[官方Windows沙箱说明](https://learn.chatgpt.com/docs/windows/windows-sandbox)、[setup公开实现](https://github.com/openai/codex/blob/main/codex-rs/windows-sandbox-rs/src/setup.rs)。它们仅提供机制背景，不证明本机alpha全部行为。报告区分已观察事实、原因假设和未确认风险，未执行初始化补证据。


## 已结束实验最终归档（2026-10-23）

本节合并已退役的权限档案、预检和目录配对实验，不代表本轮重跑。CLI 0.163.0-alpha.11.2。
早期 CLI_ARGUMENT_ERROR 在参数解析阶段停止，不是沙箱后端初始化失败；配置结构成立也不代表后端生效。
后续 Medium 用户的官方 sandbox --permission-profile :workspace --include-managed-config --cd <独立目录> 入口完成无模型预检。
PowerShell 写入配对实验：J:/Code/test 退出0，2.5004024秒；系统Temp新仓库退出0，2.4764647秒；hello.txt均精确等于 Hello from EAP sandbox probe（28字节、UTF-8、无换行），仅该文件新增，无remote。
J盘测试目录自动新增两条可继承DACL允许项，Temp测试目录新增一条；所采Temp父目录owner/SDDL/继承状态不变。不能宣称没有ACL副作用。
原生sandbox与exec/apply_patch不是等价权限路径：后续exec仍拒绝补丁写入；不支持“Temp位置本身必然无法写入”的解释，未发现确定的EAP cwd错配。实际只读策略来源仍未知。
此前初始化资源的持久性风险不因删除审计文件消失。本轮没有运行沙箱、模型或setup，没有改变ACL、账户、网络规则或服务。中间目录、重复日志与快照退役，最终结论保留。
