-- One publication identity per immutable version. Existing semantic versions receive only a new
-- identity here; their design, hash and creation time are not rewritten or republished.
ALTER TABLE eap.prototype_version ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE eap.prototype_version ALTER COLUMN request_id DROP DEFAULT;
ALTER TABLE eap.prototype_version ADD CONSTRAINT prototype_publication_request_unique UNIQUE(request_id);
COMMENT ON COLUMN eap.prototype_version.request_id IS '调用方生成的发布请求身份；同一身份同内容返回原版本，异内容拒绝；响应丢失后可只读核对，不自动重发';
