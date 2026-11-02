# 前端测试目录与构建边界

状态：有效。根据用户明确要求，参考 [Vben preferences 测试目录](https://github.com/vbenjs/vue-vben-admin/tree/main/packages/%40core/preferences/__tests__)；借鉴包根 `__tests__` 组织方式，不迁移其技术栈或测试依赖。

## 唯一落点

每个应用/包将测试放在自身根目录 `__tests__/`，与 `src/` 同级，不在生产源码内分散放置测试：

```text
frontend/
  scripts/vsh/
    src/                            工作区工具检查定义
    __tests__/                      工具自身测试
  apps/web/
    src/                            生产应用
    mock/                           开发服务使用的模拟后端，不是测试专用夹具
    __tests__/
      features/<area>/              对应领域的单元/组件测试
      lib/                          工具测试
      integration/                  跨页面与公共组件合同
      mock/                         模拟后端的合同测试
      browser/                      浏览器验收专用配置
  packages/<name>/
    src/
    __tests__/                      该包的测试、类型合同、夹具及快照
```

- 运行测试命名 `*.test.ts`，已有 `*.spec.*` 同样允许；目录可按源码领域镜像，不必把所有测试拍平。
- 测试专用 `*.fixture.*`、`fixtures/`、`__snapshots__/` 也必须留在所属 `__tests__/`；现无快照文件，不创建空目录。
- 编译期合同使用 `*.typecheck.ts`，不伪装成运行测试。runtime-client 的三份合同由独立 `tsconfig.type-tests.json` 引用生产项目，并被根 `typecheck` 引用；输出在 `node_modules/.type-tests`，不进入生产声明目录。
- 生产代码不能反向导入 `__tests__`；测试导入本包源码时用相对路径，跨包仍用公开入口，不能绕过依赖边界。
- `mock/` 中供 `dev:mock` 使用的实现及 `src/lib/skillFixture.ts` 中实际页面使用的示例不是测试专用文件，不为名称相似而搬走。测试其行为的文件仍迁入 `__tests__/mock/`。
- 浏览器隔离夹具配置现为 `apps/web/__tests__/browser/preview.config.ts`，从 frontend 目录以 `vp dev apps/web --config apps/web/__tests__/browser/preview.config.ts` 使用；不因此自动启动另一服务。

## 统一工具入口

从仓库根执行：

| 命令 | 作用 |
|---|---|
| `rtk proxy pnpm --dir frontend test run --maxWorkers=4` | 完整运行测试；根 `vite.config.ts` 只发现 `**/__tests__/**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}` |
| `rtk proxy pnpm --dir frontend lint:tests` | lint 当前所有测试根，沿用根Vite+规则；新增拥有测试的包时同步该入口的目录列表 |
| `rtk proxy pnpm --dir frontend fmt:tests` | 只读检查统一 `**/__tests__/**/*.ts`；需要写回时显式使用 `vp fmt`，不在目录搬迁时顺带重排所有旧断言 |
| `rtk proxy pnpm --dir frontend typecheck` | 原生产类型图 + 独立编译期DTO合同 |
| `rtk proxy pnpm --dir frontend check:boundaries` | 原依赖/UI规则 + 测试落点/生产反向导入门禁 |
| `rtk proxy pnpm --dir frontend build` | 真实生产应用构建，不是“排除配置存在即已验证” |

lint/fmt 继续使用根 `vite.config.ts`，不为每个测试目录另起配置。不默认放宽 no-explicit-any、未使用变量等规则。Windows package script 使用双引号；Oxlint入口使用真实目录而非不受支持的glob，Oxfmt可使用带双引号glob。

## 类型与打包

目录隔离不能单独保证“不入包”。生产tsconfig只包括src，测试类型合同独立检查；边界门禁禁止生产源码导入测试。六个源码包的 `package.json.files=["src"]` 是npm打包白名单，README/LICENSE等npm标准文件仍按其规则保留；没有开放发布权限，包仍private。`npm pack --dry-run --json --ignore-scripts` 用于核对真实待打包文件，不发布、不执行生命周期脚本。

Vite生产构建按入口依赖图打包，不增加虚假的`build.exclude`。本次迁移前后构建日志列出的hash资源文件名相同，仍保留已有大chunk警告；未将其夸大为所有发行场景已验证。未来新增导入或构建方式仍须单独核对。

## 本轮验证与剩余项

迁移104份文件：99份运行测试、3份编译期合同、1份共享测试夹具、1份浏览器配置。保留原断言/模拟边界，修正相对导入、vi.mock、SkillManager动态glob、源码扫描根及mock仓库根计算。新增3项目录门禁测试，运行结果为100文件/581项通过，typecheck、boundaries、build通过；六个包npm dry-run均未包含测试或类型合同。

目录迁移时lint入口发现2处错误与2处可选链告警，fmt发现91份格式债务；这是保留的阶段事实。后续用户要求vsh及未提交规范整理后，已修这些测试告警并统一格式，测试lint/fmt通过，无关闭规则；当前工具落点与验证见[工具边界决策](frontend-tooling-boundaries.md)。目录迁移第一次回归发现SkillManager动态glob还指向旧位置，修正路径后25项恢复；没有删断言/跳过测试。

独立只读审查通过：104个目标均存在、旧路径均已移除，已跟踪测试无漏迁，相对导入可解析；审查者独立运行100文件581项与边界检查通过，3个类型合同只读诊断通过。与HEAD比较101个文件仅路径变化或正文不变；ScenarioWorkspace保留原断言但含前轮增补，2个原未跟踪场景测试无HEAD基线，不能独立证明迁前正文一致。一次性迁移脚本及临时清单在复核后移除，不保留为日常工具。该目录治理不代表场景配置、真实模型、UI交互或用户产品验收完成。
