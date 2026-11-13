-- Optional local development examples. Execute manually after the fresh V1 baseline.
-- This directory is outside Flyway's db/migration location; startup does not load it.
-- Only task preparation is created. There are no runs, approvals, grants or acceptance results.
-- Repeating this script preserves existing rows, including any user edits to these examples.
BEGIN;

INSERT INTO eap.board_task (
    id, project_id, title, column_id, notes, session_id, revision, events,
    priority, goal, acceptance_criteria
) VALUES
(
    'eab00000-0000-4000-8000-000000000001', 'local-example',
    '示例：准备工作区只读检查', 'planned',
    '可选开发样例：请先选择自己的项目和工作区，再按界面操作执行。', '', 1,
    '["created"]'::jsonb, 'p1',
    '查看工作区当前状态并人工核对改动范围',
    '人工确认选中的工作区正确；检查结果可回看；执行成功本身不表示任务验收通过'
),
(
    'eab00000-0000-4000-8000-000000000002', 'local-example',
    '示例：完善需求与验收条件', 'planned',
    '可选开发样例：此任务保留为空白准备状态，用于验证补全目标和验收条件的流程。', '', 1,
    '["created"]'::jsonb, 'none', '', ''
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
