export const pluginCheckMessages = {
  'zh-CN': {
    check: {
      action: '检查运行时依赖',
      project: '查询项目 ID',
      projectHint: '填写看板使用的项目 ID（最多 120 字符）。这只是查询范围，不是目录授权。',
      unchecked: '未检查',
      stale: '输入项目已变化；下方为上次观测，请重新检查。',
      checking: '检查中',
      available: 'Task 列表可用',
      failed: '检查失败（可用性未知）',
      scope:
        '只读查询指定项目的 Task 列表；空列表也可通过。不验证 Run 执行、全服务健康或插件激活；不创建任务、扫描目录、授予权限或调用模型。观测仅代表记录时刻，不改变现有入口。',
      source: '来源：{source}',
      time: '观测时间：{time}',
      reason: '失败原因：{reason}',
      simulated: '模拟环境：请求由 mock 响应，不是真实后端检查。',
    },
  },
  'en-US': {
    check: {
      action: 'Check runtime dependency',
      project: 'Query project ID',
      projectHint:
        'Enter the board project ID (up to 120 characters). This scopes the query; it is not directory authorization.',
      unchecked: 'Not checked',
      stale:
        'The project input changed; the observation below is from the previous check. Check again.',
      checking: 'Checking',
      available: 'Task list available',
      failed: 'Check failed (availability unknown)',
      scope:
        'Read-only Task list query for the specified project; an empty list can pass. Does not verify Run execution, overall service health or plugin activation; does not create tasks, scan directories, grant access or call models. Observation is point-in-time and does not change existing entry behavior.',
      source: 'Source: {source}',
      time: 'Observed at: {time}',
      reason: 'Failure reason: {reason}',
      simulated: 'Simulated environment: mock responses, not a real backend check.',
    },
  },
}
