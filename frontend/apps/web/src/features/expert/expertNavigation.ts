export type ExpertPage =
  | 'list'
  | 'overview'
  | 'config'
  | 'new'
  | 'tasks'
  | 'start'
  | 'task'
  | 'review'
export type ExpertRoute = {
  page: ExpertPage
  expertId?: string
  runId?: string
  from?: 'all'
  mode?: 'workflow' | 'agent'
}
export function readExpertRoute(hash: string): ExpertRoute {
  const params = new URLSearchParams(hash.replace(/^#/, '').split('?')[1] ?? '')
  const page = params.get('view') as ExpertPage
  const expertId = params.get('expert') || undefined
  const runId = params.get('run') || undefined
  if (!['overview', 'config', 'new', 'tasks', 'start', 'task', 'review'].includes(page))
    return { page: 'list' }
  if (['overview', 'config', 'start', 'task', 'review'].includes(page) && !expertId)
    return { page: 'list' }
  if (['task', 'review'].includes(page) && !runId) return { page: 'tasks', expertId }
  return {
    page,
    expertId,
    runId,
    from: params.get('from') === 'all' ? 'all' : undefined,
    mode: params.get('mode') === 'agent' ? 'agent' : 'workflow',
  }
}
export function expertHash(route: ExpertRoute) {
  const params = new URLSearchParams()
  if (route.page !== 'list') params.set('view', route.page)
  if (route.expertId) params.set('expert', route.expertId)
  if (route.runId) params.set('run', route.runId)
  if (route.from) params.set('from', route.from)
  if (route.page === 'new' && route.mode) params.set('mode', route.mode)
  return 'experts' + (params.size ? '?' + params.toString() : '')
}

/** A scoped expert task stays under My experts; global task descendants retain All tasks. */
export function expertSidebarSection(hash: string): 'experts' | 'tasks' {
  const route = readExpertRoute(hash)
  return (route.page === 'tasks' && !route.expertId) ||
    (['task', 'review'].includes(route.page) && route.from === 'all')
    ? 'tasks'
    : 'experts'
}
