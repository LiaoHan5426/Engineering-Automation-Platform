# Frontend scripts

Workspace maintenance scripts belong here. Scripts must use TypeScript by default, inherit `internal/tsconfig/base.json`, and be runnable through Vite+ tasks rather than introducing a second formatter or linter.

所有规范检查集中在工作区包[`@eap/vsh`](vsh/README.md)：`src/`定义、`__tests__/`测试、`bin/`提供CLI；根package scripts只转发，不再平行维护check-boundaries/ui-boundaries/test-layout散文件。跨包仅通过已声明依赖和公开exports引用，禁止相对/绝对路径直接读取其他包源码。`clean.mjs`保留为显式维护操作，vsh检查不调用清理或启停服务。
