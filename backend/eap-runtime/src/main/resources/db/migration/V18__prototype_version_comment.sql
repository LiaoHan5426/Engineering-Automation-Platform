-- 只改注释。不创建触发器，也不增加防更新约束。
COMMENT ON TABLE eap.prototype_version IS
    '一次保存插入的原型版本。应用没有更新入口。此注释不是防更新约束，也没有触发器阻止数据库直改。不是浏览器草稿，也不是交接或 Mission。';
COMMENT ON COLUMN eap.prototype_version.title IS '先脱敏再规范化的标题。应用只插入，本列没有防更新约束。';
COMMENT ON COLUMN eap.prototype_version.body IS '先脱敏再规范化的正文。应用只插入，本列没有防更新约束。';
COMMENT ON COLUMN eap.prototype_version.button_presses IS '保存时的按钮次数，作为重开预览的初始值。应用只插入。';
COMMENT ON COLUMN eap.prototype_version.acceptance IS '先脱敏再规范化的验收条件 JSON 数组。本表不执行这些条件。应用只插入。';
COMMENT ON COLUMN eap.prototype_version.content_hash IS '服务端对脱敏并规范化后的内容计算的 SHA-256。应用只插入，不回写已有哈希。';
