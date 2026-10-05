CREATE TABLE eap.expert_definition (
 id varchar(100) PRIMARY KEY,
 name varchar(200) NOT NULL,
 manifest jsonb NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
