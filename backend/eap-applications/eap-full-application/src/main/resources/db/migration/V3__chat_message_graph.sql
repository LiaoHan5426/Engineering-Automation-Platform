CREATE TABLE eap.chat_graph (
    conversation_id UUID PRIMARY KEY,
    principal VARCHAR(255) NOT NULL,
    workspace TEXT NOT NULL,
    snapshot TEXT NOT NULL
);
