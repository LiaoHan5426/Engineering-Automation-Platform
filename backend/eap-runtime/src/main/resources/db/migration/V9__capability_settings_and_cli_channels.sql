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

-- 2) Where a local CLI capability's binary lives on this machine. A CLI capability is code — command,
--    arguments and published facts are all in the handler — but the location of the executable is a
--    property of the installation, and this table is that value. No row means "use the binary the handler
--    ships with". Absent rows are the normal state, so a broken configuration cannot turn a working
--    installation into a non-working one.
CREATE TABLE IF NOT EXISTS eap.cli_channel (
    capability varchar(200) PRIMARY KEY,
    binary text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
