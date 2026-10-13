-- Which route a run took through the judgement stage, recorded on the task itself.
--
-- The execution response already reports `modelEnhancement`, but it was never persisted, so the
-- console could not compute how often the platform actually spends a model call. It had to show a
-- demo sample instead, and a reader could not tell which figure would survive contact with a real
-- backend. Storing the outcome here makes every overview figure a function of the task table.
--
-- The vocabulary matches the response field exactly, because two names for one concept is how they
-- drift apart:
--   unverified-observation : a model was called and its text is an unverified observation
--   skipped                : deterministic evidence was decisive, no model call was needed
--   unavailable            : the stage was reached but no model served the request
--   NULL                   : the run never reached the judgement stage (planner tasks)
ALTER TABLE eap.task ADD COLUMN IF NOT EXISTS model_enhancement varchar(32);

COMMENT ON COLUMN eap.task.model_enhancement IS
    '本次运行走的模型路线：NULL = 未到达判定阶段（规划任务）/ unverified-observation（调用了模型，输出只是待验证观察）/ skipped（有模型，但确定性证据已足够）/ unavailable（到了判定阶段但没有模型可用）。NULL 与 skipped 必须分开：规划任务根本没有模型可跳过，把它算成「确定性解决」会抬高概览上的确定性占比。';
