# 前端工具包与跨包引用门禁

状态：实施及父任务回归通过；审查发现的静态导入、Vue双script与glob展开阻断均已修复，限定独立复核通过。范围是用户要求的`frontend/scripts/vsh`、跨包私有源码限制及类似未提交规范问题，不包含既有场景业务修复、后端或服务启停。

## 依据与采用决定

参考 [Vben scripts/vsh/package.json](https://github.com/vbenjs/vue-vben-admin/blob/main/scripts/vsh/package.json)、[循环检查实现](https://github.com/vbenjs/vue-vben-admin/tree/main/scripts/vsh/src/check-circular)与其`pnpm-workspace.yaml`：工具是独立工作区包，`scripts/*`纳入workspace，检查由CLI命令承载。

本仓库新增`@eap/vsh`，保留Vue/Vite+/pnpm及原UI/依赖检查，不引入cac、knip、另一套formatter或完整Vben工具链。命令数量有限，使用简单命令分发；图算法复用MIT `circular-dependency-scanner@3.1.0`的`analyzeGraph`（npm元数据及实际API核对），文件边复用本包统一AST/SFC解析，不另造图算法。依赖锁定到`pnpm-lock.yaml`，安装时`--ignore-scripts`，未运行第三方安装脚本。

3.0.1评估中发现发布包的实际ESM入口没有导出、types路径不正确，因此未采用。3.1.0实际导出及类型可用；其文件扫描器Windows绝对模式漏环，独立审查又实证Vue使用`script || scriptSetup`漏掉双script的setup依赖。因此最终不再使用其文件读取器，统一用已有AST/SFC读取（含两script）、TS解析和Vue/CSS候选补齐建立文件边，由其analyzeGraph计算文件及manifest环。没有修改node_modules或把异常当作无环。

## 目录与单一归属

```text
frontend/scripts/
  clean.mjs                     保留显式维护入口，vsh不调用
  vsh/
    package.json                private @eap/vsh，公开exports和bin
    bin/vsh.mjs                 仅转发run
    src/
      index.ts                  命令分发与非零退出
      boundaries.ts             工作区/配置读取与规则编排
      imports.ts                AST/SFC提取及公开入口核对
      circular.ts               上游文件环/manifest图检查
      ui-boundaries.ts          保留原UI约束
      test-layout.ts            保留测试落点约束
    __tests__/                  本工具自己的测试
    tsconfig.json               继承统一配置，显式类型检查
```

旧`frontend/scripts/check-boundaries.ts`、`ui-boundaries.ts`、`test-layout.ts`及散落scripts tsconfig移除，测试从`frontend/__tests__/scripts/`归入vsh包。根脚本只调用同一CLI，不保留两个注册/规则源。根workspace清单与pnpm清单均加入`scripts/*`；根依赖显式声明`@eap/vsh`。

## 跨包合同

“禁止跨包直接引用”不等于禁止使用共享包。合法路径是：**消费包声明依赖 → 按包名引用 → 子路径必须由提供包exports公开**。

- 禁止`../../其他包/src/...`、绝对路径、file URL、未公开子路径；不只匹配`/src/`字面量。
- 结合tsconfig解析/realpath核对，别名和链接不能绕过；看似公开包名若实际解析到非导出文件仍拒绝。
- TypeScript AST检查多行import、export、require、字面量动态import和glob；Vue SFC拆脚本/样式并检查src；CSS检查@import。注释与普通字符串不当作导入。
- 保留UI第三方入口限制、Icon叶子包约束、测试目录/生产反向引用及缺失清单/依赖诊断，不加违规豁免。
- 文件循环按包检查；显式排除构建/依赖/测试/缓存目录，纯type引用不是运行时环。跨包依赖循环额外检查所有workspace manifest声明图（含开发/peer声明上限），不能只靠文件扫描器解析裸包名。
- 当前静态门禁不是动态代码沙箱；不宣称能证明任意运行时拼接路径或外部包内部代码安全。

## 命令

仓库根使用RTK前缀执行`pnpm --dir frontend`：

| script | 作用 |
|---|---|
| `check:boundaries` | vsh check-boundaries |
| `check:circular` | vsh check-circular |
| `check:architecture` | vsh check，边界+循环；问题/异常退出1，非法命令退出2 |
| `check` | vsh check通过后再跑原vp check，不吞失败 |
| `typecheck` | 原Vue/共享包/DTO合同类型图，再检查vsh自身 |
| `lint:tests`、`fmt:tests` | 原Vite+引擎，包含vsh测试，无规则降级 |

Node要求>=22.18，以原生TS执行工具入口；当前真实Node26.13.0验证。CLI根定位来自模块文件，不依赖调用者cwd。

## 同轮规范修正与验证边界

- 新AST/CSS扫描查出Web实际使用tailwindcss却未在自身清单声明，已补，不依赖根包的提升结果冒充声明。
- 测试前轮2错误/2告警已修：移除any回调、明确解构断言、显式核对可选DOM；保留原行为断言。统一格式化测试目录，原91份格式债务关闭。
- 依据[Vite+官方formatter文档](https://viteplus.dev/guide/fmt)，将根`fmt.options`误嵌套改为`fmt`直接字段；所有测试与vsh工具代码按相同配置检查。
- 初次103文件592项通过未覆盖审查反例；审查发现ImportType/import-equals/静态模板字符串/glob数组漏边界及Vue双script漏环，补6项RED→GREEN并统一解析。复核确认这两项关闭，又复现glob通配模式未展开导致漏环：已补有界files集合内逐调用包含/排除展开及正反回归，未支持的glob别名明确拒绝而非漏过；最终限定复核通过。最新全量104文件601项通过，根`check`（378文件格式、294文件lint零警告/错误）、`check:architecture`、`typecheck`、测试lint/fmt和build通过；build仍有既有大chunk告警。
- 审查修复期间工作树生产页面出现格式变更，实际14文件36处多语句事件解析失败；经用户明确选择一并修复后，仅包装为显式箭头函数块保留动作顺序，格式化后重跑模板语法回归仍通过。ModelSettings多行URL条件触发vue-tsc虚拟代码注释问题，等价移入computed后类型通过。专家SDK两个已跟踪JS与TS经独立transpile对比完全一致，确认是旁写产物后移除，并配置声明输出到node_modules/.types及新增重复源码门禁；不再由typecheck向src旁写JS。
- 最终限定独立复核通过：逐glob调用保留完整模式组，在受忽略目录/扩展名/测试与嵌套包过滤后的有界files集合中展开，正包含/负排除不额外遍历外部路径；独立执行circular测试5/5通过。前轮静态语法和双script修复已由上一轮复核确认；这些限定结论不扩张为任意动态路径安全保证。
- 未提交/推送，不读写用户application.yml或AiChatApplicationTest.java，不启停IDEA/前端服务、不调用真实模型。前轮场景未知保存结果缺陷继续保持阻断，不因本轮测试/工程检查通过而关闭。
