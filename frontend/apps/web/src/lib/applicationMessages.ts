export const applicationMessages = {
  'zh-CN': {
    status: {
      PROPOSED: '待确认写入',
      APPLYING: '写入处理中，不能重复启动',
      APPLIED: '已写入并记录',
      FAILED: '写入未完成',
      UNKNOWN: '写入结果未知，目录保持阻塞',
    },
    refresh: '核对写入记录',
    loading: '正在读取持久写入记录…',
    readFailed: '无法核对持久写入记录，暂不能继续写入。请重读；不会自动重试写入。',
    uncertain: '写入响应未确认，正在读取原记录；不会自动重复写入。',
    boundary:
      '应用结果来自服务端持久记录。记录写入不代表测试通过、任务完成或人工验收；未知结果不得盲目重试。',
  },
  'en-US': {
    status: {
      PROPOSED: 'Awaiting write confirmation',
      APPLYING: 'Applying; do not start again',
      APPLIED: 'Written and recorded',
      FAILED: 'Write not completed',
      UNKNOWN: 'Write outcome unknown; workspace blocked',
    },
    refresh: 'Check application record',
    loading: 'Reading durable application record…',
    readFailed:
      'Cannot verify the durable record. Writing is blocked; reload to check. No automatic write retry.',
    uncertain:
      'Write response unconfirmed. Reading the original record without repeating the write.',
    boundary:
      'Application status comes from the durable server record, not proof of passing tests, task completion or human acceptance. Never blindly retry an unknown outcome.',
  },
}
