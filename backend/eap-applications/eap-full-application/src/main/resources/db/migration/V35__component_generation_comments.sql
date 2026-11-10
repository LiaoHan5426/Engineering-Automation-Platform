-- V33 is already applied. Add the missing schema documentation without rewriting its history.
COMMENT ON COLUMN eap.code_generation.companion_sources IS '按显式选择顺序冻结的组件源码与基线；最多七项，不表示授权或应用完成。';
