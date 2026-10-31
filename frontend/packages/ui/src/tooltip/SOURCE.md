# Tooltip 来源

- 上游：unovue/shadcn-vue，MIT（本目录 LICENSE）。
- 固定提交：`4d6963aa8a482be7609cb05d3f8b7fe42082b634`。
- 原文件：[TooltipContent.vue](https://github.com/unovue/shadcn-vue/blob/4d6963aa8a482be7609cb05d3f8b7fe42082b634/apps/v4/registry/new-york-v4/ui/tooltip/TooltipContent.vue)。
- 本地改动：保留 Portal/Content/Arrow 与 props/emits 转发组合；移除 cn、reactiveOmit 和 Tailwind 动画 utility，改为 computed、EAP BEM/CSS Token；增加 teleportTo；公共 Tooltip 包装 provider/trigger/root，页面只传说明和触发控件。
- 运行依赖：Vue 3.5、`reka-ui` 2.11.0、`@eap/style`；未引入 Sass。无 CLI init / 全量组件库覆盖。
- 复制 Tooltip 目录时必须带 TooltipContent、CSS、LICENSE/SOURCE 和依赖，目标宿主需验证焦点、Escape、hover、延迟与局部主题 portal。
