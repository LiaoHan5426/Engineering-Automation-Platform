-- 人工审批候选；仅保存供审查，不执行。
-- 目标：返回没有 paid 订单的客户，保持输出列 c.id 与 ORDER BY c.id。
-- 根据用户提供的约束：customers.id 为非 NULL 主键，orders.customer_id 可为 NULL，且样本中存在 NULL。
-- 原 NOT IN 的语义风险：若 status = 'paid' 的子查询结果含 NULL，
-- 则有匹配 paid 订单的客户其 NOT IN 为 FALSE；其余客户其 NOT IN 为 UNKNOWN，
-- 两者均无法通过 WHERE，导致原查询不返回任何客户。
-- 注意：orders.customer_id 存在 NULL，并不证明 paid 子集也含 NULL；目前未验证该分布。
-- 下方使用相关 NOT EXISTS：仅排除存在 customer_id = c.id 的 paid 订单的客户；
-- customer_id 为 NULL 的订单不会满足该相关等式，因此不会排除客户。
-- 此候选按业务目标修正 NULL 风险，不宣称与原 SQL 在所有数据上语义等价。
-- 未执行 SQL，未验证结果或执行计划，不宣称性能提升。等待人工审批。
SELECT c.id
FROM customers c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.customer_id = c.id
      AND o.status = 'paid'
)
ORDER BY c.id;
