# @eap/dsh-boot-verify

独立 Vite 页面用于验证 DSH 启动接线。

## 注入夹具

从仓库根运行：

```powershell
rtk proxy vp -C frontend dev apps/dsh-boot-verify
```

默认端口 5199。页面展示使用假清单注入的版本及批次数，适合独立检查 HTML 注入。

## 参考 Host

启动隔离的 dsh-personal `web` profile，并使用已构建的浏览器产物。将参考 Host 的环回地址配置给验证入口：

```powershell
$env:EAP_DSH_REFERENCE_ORIGIN = 'http://127.0.0.1:<reference-port>'
rtk proxy vp -C frontend dev apps/dsh-boot-verify --mode reference
```

从 127.0.0.1 打开验证入口。启动文档和 RPC 均保留浏览器的 Host 及端口，参考 Host 以此签发和校验认证 Cookie。

在验证入口使用参考 Host 的一次性启动参数完成原有认证。验证页保留 Host 生成的启动清单、模块加载器和批次资源，通过同源代理加载相同构建的浏览器入口和 RPC。浏览器入口由其自身调用真实 `AppWebEntry`。开发页的 `data-eap-reference-boot="entry-loaded"` 只标记脚本加载完成。验收还需检查 Vue 壳渲染及 RPC 结果。

本模式仅用于参考侧。EAP 生产入口未接入此模式，真实 py-backend 合同和插件验收独立进行。

## Better Sidebar 0.31.1 兼容实验

使用同一隔离参考 Host，通过 `--mode reference-react` 启动验证入口。该模式为真实启动模块表补充 React 依赖，并仅为 Better Sidebar 使用 React 版原语和组件桥。导览图标、文件标签及目录预览已在 Chromium 复验。

可另设 `EAP_DSH_VERIFY_SIDEBAR_ORIGIN` 为运行在环回地址的 py-backend。此时只有 `/sidebar` 请求发往 py-backend。初始化、Vue 壳和会话 RPC 仍由参考 Host 提供。先在两个隔离 Host 安装同一版本插件，并将参考会话目录与 py-backend 授权的临时工作区对齐。浏览器侧参考 Host Cookie 不会转发给 py-backend。
