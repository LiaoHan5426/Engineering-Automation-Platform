import type { PrototypeTaskListItem } from '@eap/runtime-client/contracts'

/** Approved design sample records; editable data, never a runtime fallback. */
export const prototypeTaskListSample: PrototypeTaskListItem[] = [
  {
    id: 'TASK-001',
    name: '任务列表筛选与详情',
    status: 'running',
    priority: 'p1',
    summary: '支持按名称和状态筛选，快速定位任务。',
    goal: '为项目任务提供清晰的列表视图。可以通过任务名称关键词和状态组合筛选，实时查看匹配数量；从每一行进入详情，了解任务状态、优先级和完整描述。关闭详情后保留当前筛选条件。',
    acceptanceCriteria: '名称关键词与状态可组合筛选；匹配数量准确；详情关闭后保留筛选条件。',
  },
  {
    id: 'TASK-002',
    name: 'API 接口文档整理',
    status: 'ready',
    priority: 'p2',
    summary: '汇总核心接口说明，补齐请求与响应示例。',
    goal: '整理项目核心 API 的用途、请求参数和响应字段，补齐典型请求与响应示例。检查术语与字段说明的一致性，让协作成员能够快速找到需要的信息。',
    acceptanceCriteria: '核心接口均有参数说明和请求、响应示例；字段说明与现有合同一致。',
  },
  {
    id: 'TASK-003',
    name: 'API 错误反馈优化',
    status: 'running',
    priority: 'p1',
    summary: '统一接口异常提示，让问题定位更直接。',
    goal: '核对 API 请求异常时页面显示的反馈，整理用户可理解的提示与后续处理说明。覆盖常见错误场景，确保提示出现在对应操作附近。',
    acceptanceCriteria: '常见接口异常有明确反馈；提示与对应操作关联，后续动作清晰。',
  },
  {
    id: 'TASK-004',
    name: '工作区导航梳理',
    status: 'done',
    priority: 'p2',
    summary: '优化页面入口与返回路径，减少重复跳转。',
    goal: '梳理项目工作区的常用入口、页面名称与返回路径，确保导航层次清晰。核对桌面与窄屏下的信息顺序，保持任务上下文连续。',
    acceptanceCriteria: '页面入口和返回路径可达；窄屏下导航层次与任务上下文保持连续。',
  },
  {
    id: 'TASK-005',
    name: '验收记录核对',
    status: 'ready',
    priority: 'p1',
    summary: '检查任务验收记录，补齐验证结论。',
    goal: '逐项核对任务目标与验收记录，确认每项记录都具有清楚的验证范围和结论。整理尚待确认的事项，供后续验收时参考。',
    acceptanceCriteria: '每项验收记录注明验证范围和结论；待确认事项单独列明。',
  },
  {
    id: 'TASK-006',
    name: '页面可访问性检查',
    status: 'done',
    priority: 'p2',
    summary: '检查键盘操作、焦点反馈及窄屏阅读。',
    goal: '检查主要页面的键盘操作顺序、控件名称与焦点可见性，核对窄屏阅读与滚动体验。记录问题与对应的验证结果，确保操作路径清楚可达。',
    acceptanceCriteria: '主要操作可用键盘完成；焦点清晰可见；窄屏内容可正常阅读。',
  },
]
