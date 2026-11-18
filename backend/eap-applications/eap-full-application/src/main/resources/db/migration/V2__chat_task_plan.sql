CREATE TABLE eap.chat_plan_execution (
    execution_id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    principal TEXT NOT NULL,
    workspace TEXT NOT NULL,
    writable BOOLEAN NOT NULL DEFAULT TRUE,
    snapshot TEXT
);
CREATE TABLE eap.chat_plan_operation (
    execution_id UUID NOT NULL REFERENCES eap.chat_plan_execution(execution_id),
    operation_id UUID NOT NULL,
    command TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (execution_id, operation_id)
);
