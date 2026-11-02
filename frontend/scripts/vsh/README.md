# @eap/vsh

本仓库前端规范检查工具。参考 Vben 的 `scripts/vsh` 工作区组织，复用已有 EAP UI/依赖/测试落点规则，不引入第二套格式化器。

## 使用

从仓库根：

- `pnpm --dir frontend check:boundaries`：公开包入口、依赖声明、UI约束及测试目录检查。
- `pnpm --dir frontend check:circular`：逐包文件运行时循环与工作区manifest依赖循环。
- `pnpm --dir frontend check:architecture`：以上两项；发现问题或扫描异常非零退出。
- `pnpm --dir frontend typecheck`：应用/公共包类型、runtime-client类型合同及vsh自身类型。

命令实现只在本包 `src/`；测试只在本包 `__tests__/`；`bin/vsh.mjs` 仅调用公开入口，不根据当前目录推测仓库。需要 Node >=22.18（原生TS执行）与已安装的工作区依赖。`clean.mjs` 是维护操作，不属于只读检查，不会被vsh调用。

## 依赖与边界

- 使用已安装的 TypeScript AST 和 Vue SFC 解析 import/export/require/动态import、CSS @import 与脚本/样式src。读取各包tsconfig核对别名，不执行被检查文件。
- 跨包只允许声明过的包名及其 `package.json.exports`。相对越界、绝对路径、file URL、未公开深层路径、跨包别名与realpath越界均拒绝；同包源码仍可相对引用。
- 复用 MIT `circular-dependency-scanner@3.1.0`的`analyzeGraph`，不另造图算法。上游文件扫描已被真实反例证实会漏Vue双script和Windows绝对路径环，因此文件边统一使用本包已有TypeScript AST/SFC读取与tsconfig解析，两个script都读取；排除node_modules/dist/测试/缓存，类型引用不算运行时环，manifest声明图也调用同一上游图算法。
- 3.0.1曾评估但实际JS入口无导出、类型入口也错位，未采用；未修改node_modules来掩盖问题。
- 保留UI/图标叶子包约束、依赖声明及测试隔离，工具包无UI、数据库、模型或网络调用；依赖安装不属于运行检查。

本工具是静态工程门禁，不是任意运行时动态代码的安全沙箱；无法证明所有动态构造路径或第三方包内部调用的行为。完整决定、验证与剩余范围见 `docs/decisions/frontend-tooling-boundaries.md`。
