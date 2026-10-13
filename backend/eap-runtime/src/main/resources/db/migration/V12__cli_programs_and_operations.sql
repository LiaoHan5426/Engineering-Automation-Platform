CREATE TABLE eap.cli_program (
    id text PRIMARY KEY,
    name text NOT NULL,
    binary_name text NOT NULL UNIQUE,
    builtin boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE eap.cli_operation (
    capability_id text PRIMARY KEY,
    program_id text NOT NULL REFERENCES eap.cli_program(id),
    title text NOT NULL,
    args jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(args) = 'array'),
    description text NOT NULL DEFAULT '',
    builtin boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cli_operation_program_idx ON eap.cli_operation(program_id);
INSERT INTO eap.cli_program(id,name,binary_name,builtin) VALUES ('git','Git','git',true),('rg','ripgrep','rg',true);
INSERT INTO eap.cli_operation(capability_id,program_id,title,args,description,builtin) VALUES
('git-status','git','读取本地 Git 状态','["status"]','只读查看工作区状态',true),
('git-diff','git','读取本地 Git 差异','["diff","--stat"]','只读查看改动范围',true),
('rg-search','rg','工作空间检索','["--line-number","--hidden"]','在工作空间内进行有界检索',true);
-- Preserve existing installations. Prefer status when Git had conflicting per-operation overrides.
INSERT INTO eap.cli_channel(capability,binary_path,updated_at)
SELECT DISTINCT ON (CASE WHEN capability IN ('git-status','git-diff') THEN 'git' ELSE 'rg' END)
    CASE WHEN capability IN ('git-status','git-diff') THEN 'git' ELSE 'rg' END,binary_path,updated_at
FROM eap.cli_channel WHERE capability IN ('git-status','git-diff','rg-search')
ORDER BY CASE WHEN capability IN ('git-status','git-diff') THEN 'git' ELSE 'rg' END,
    CASE WHEN capability='git-status' THEN 0 ELSE 1 END
ON CONFLICT (capability) DO NOTHING;
DELETE FROM eap.cli_channel WHERE capability IN ('git-status','git-diff','rg-search');
COMMENT ON TABLE eap.cli_program IS '本机 CLI 程序注册表，同一程序统一维护二进制位置';
COMMENT ON TABLE eap.cli_operation IS '受控 CLI 操作，专家通过 capability_id 引用固定参数数组';
COMMENT ON COLUMN eap.cli_program.id IS '程序唯一标识';
COMMENT ON COLUMN eap.cli_program.name IS '程序显示名称';
COMMENT ON COLUMN eap.cli_program.binary_name IS '默认可执行文件名称或绝对路径';
COMMENT ON COLUMN eap.cli_program.builtin IS '是否系统预置程序';
COMMENT ON COLUMN eap.cli_program.updated_at IS '最后更新时间';
COMMENT ON COLUMN eap.cli_operation.capability_id IS '专家引用的操作能力唯一标识';
COMMENT ON COLUMN eap.cli_operation.program_id IS '所属 CLI 程序';
COMMENT ON COLUMN eap.cli_operation.title IS '操作显示名称';
COMMENT ON COLUMN eap.cli_operation.args IS '固定参数字符串数组，不经 shell 拼接';
COMMENT ON COLUMN eap.cli_operation.description IS '操作用途说明';
COMMENT ON COLUMN eap.cli_operation.builtin IS '是否系统预置操作';
COMMENT ON COLUMN eap.cli_operation.updated_at IS '最后更新时间';
