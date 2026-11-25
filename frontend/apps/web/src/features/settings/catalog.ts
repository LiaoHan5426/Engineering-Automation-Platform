/**
 * 设置分区的唯一权威定义：分组与顺序来自桌面设计稿（工作区在前、偏好独立成组）。
 * 弹窗内的分区列表由这里派生，任何新增设置页只改这里一处。
 */
export const settingsGroups = [
  {
    id: 'workspace',
    labelKey: 'desktop.settingsGroupWorkspace',
    ids: [
      'model-settings',
      'knowledge',
      'rules',
      'databases',
      'skills',
      'capabilities',
      'plugins',
    ],
  },
  {
    id: 'preference',
    labelKey: 'desktop.settingsGroupPreference',
    ids: ['appearance', 'patterns'],
  },
] as const

export const settingsIds = settingsGroups.flatMap((group) => group.ids as readonly string[])

export function isSettingsView(id: string) {
  return (settingsIds as readonly string[]).includes(id)
}
