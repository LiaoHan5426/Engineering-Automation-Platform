CREATE TABLE eap.prototype_version (
    id uuid PRIMARY KEY,
    source_ref varchar(32) NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    button_presses integer NOT NULL,
    interaction text NOT NULL,
    acceptance text NOT NULL,
    content_hash varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prototype_version_source CHECK (source_ref IN ('builder-alpha', 'builder-beta')),
    CONSTRAINT prototype_version_presses CHECK (button_presses >= 0),
    CONSTRAINT prototype_version_interaction CHECK (interaction = '预览按钮使计数加一')
);

CREATE TABLE eap.prototype_delivery (
    id uuid PRIMARY KEY,
    version_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT prototype_delivery_version_fk FOREIGN KEY (version_id) REFERENCES eap.prototype_version (id),
    CONSTRAINT prototype_delivery_one_version UNIQUE (version_id)
);

COMMENT ON TABLE eap.prototype_version IS
    '一次保存产生的不可变原型版本。不是浏览器草稿，也不是交接或 Mission。';
COMMENT ON COLUMN eap.prototype_version.id IS '服务端生成的版本号，全表唯一，不按实例递增。';
COMMENT ON COLUMN eap.prototype_version.source_ref IS '来源 Builder 实例，只取 builder-alpha 或 builder-beta。';
COMMENT ON COLUMN eap.prototype_version.title IS '规范化后的标题。保存后不更新。';
COMMENT ON COLUMN eap.prototype_version.body IS '规范化后的正文。保存后不更新。';
COMMENT ON COLUMN eap.prototype_version.button_presses IS '保存时的按钮次数，作为重开预览的初始值。';
COMMENT ON COLUMN eap.prototype_version.interaction IS '服务端固定的交互说明。';
COMMENT ON COLUMN eap.prototype_version.acceptance IS '规范化后的验收条件 JSON 数组。本表不执行这些条件。';
COMMENT ON COLUMN eap.prototype_version.content_hash IS '服务端对规范化内容计算的 SHA-256。';
COMMENT ON COLUMN eap.prototype_version.created_at IS '版本插入时间。同一实例的先后只看这一列。';

COMMENT ON TABLE eap.prototype_delivery IS
    '引用一个原型版本的可审阅交付单。不绑定仓库，不调用 Agent，也不是交接。';
COMMENT ON COLUMN eap.prototype_delivery.id IS '服务端生成的交付单号。';
COMMENT ON COLUMN eap.prototype_delivery.version_id IS '所引用的原型版本。全表唯一，并发冲突时返回已有行。';
COMMENT ON COLUMN eap.prototype_delivery.created_at IS '交付单插入时间。';
