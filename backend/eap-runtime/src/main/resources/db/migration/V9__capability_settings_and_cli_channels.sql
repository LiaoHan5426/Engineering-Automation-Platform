-- Capabilities are code, so there is deliberately no eap.capability table: a row could not create one.
-- What an installation can own about a capability is its state and its local dependencies, and only
-- those are persisted.
--
-- 1) One on/off switch per capability, whatever its kind. Absent means enabled: a capability nobody
--    configured must be runnable, so settings are an opt-out. Writes are refused while an enabled expert
--    runs the capability, exactly like rule pack and knowledge base deletion.
CREATE TABLE IF NOT EXISTS eap.capability_setting (
    capability varchar(200) PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT true,
    notes text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE eap.capability_setting IS
    '每个能力一个开关，与能力种类无关。没有这一行 = 已启用：没人配置过的能力必须可用，所以设置是「退出」而不是「加入」。';
COMMENT ON COLUMN eap.capability_setting.capability IS '能力 id，与 /api/capabilities 声明的同一个标识';
COMMENT ON COLUMN eap.capability_setting.enabled IS
    'false 表示操作者主动停用。已启用的专家正在运行该能力时后端会拒绝写入，并点名这些专家。';
COMMENT ON COLUMN eap.capability_setting.notes IS '停用原因或备注，只给人看，不参与判定';
COMMENT ON COLUMN eap.capability_setting.updated_at IS '最后一次改动的时刻；页面上「最近刷新」与此无关，那是另一条时间线';

-- 2) Where a local CLI capability's binary lives on this machine. A CLI capability is code — command,
--    arguments and published facts are all in the handler — but the location of the executable is a
--    property of the installation, and this table is that value. No row means "use the binary the handler
--    ships with". Absent rows are the normal state, so a broken configuration cannot turn a working
--    installation into a non-working one.
--
--    The column is `binary_path`, not `binary`: `binary` is a PostgreSQL keyword of category T
--    ("reserved, can be function or type name"), and `CREATE TABLE t (binary text)` is a syntax error.
--    The JSON field the console reads is still `binary` — that is a wire name, not an identifier.
CREATE TABLE IF NOT EXISTS eap.cli_channel (
    capability varchar(200) PRIMARY KEY,
    binary_path text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE eap.cli_channel IS
    '本地 CLI 能力的可执行文件位置。命令、参数与它发布的事实都在代码里，只有「装在哪台机器上」属于安装，所以只有这一个值被持久化。没有这一行 = 用随能力声明的默认程序名。';
COMMENT ON COLUMN eap.cli_channel.capability IS 'CLI 能力 id，主键';
COMMENT ON COLUMN eap.cli_channel.binary_path IS
    '可执行文件名或绝对路径。不能为空串（空串等于「删掉这一行、恢复默认」），不能以 - 开头，不能含控制字符，不能含凭据——写入前由后端校验。';
COMMENT ON COLUMN eap.cli_channel.updated_at IS '覆盖值最后一次变更的时刻。覆盖是即时生效的，不需要重启后端。';
