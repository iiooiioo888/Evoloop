-- encoding UTF8, timezone UTC
-- AI Hub 一期 DDL（對齊 docs/AI_HUB_DETAILED_DESIGN.md §3.2）

CREATE TABLE users (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                        VARCHAR(64)  NOT NULL,
    api_key_hash                CHAR(64)     NOT NULL,
    monthly_budget_limit_usd    NUMERIC(12,6) NOT NULL DEFAULT 100.000000
                                CHECK (monthly_budget_limit_usd >= 0),
    daily_budget_limit_usd      NUMERIC(12,6) NOT NULL DEFAULT 10.000000
                                CHECK (daily_budget_limit_usd >= 0),
    preferred_models            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    home_region                 CHAR(2)      NOT NULL DEFAULT 'ZZ',
    data_egress_ack             BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_api_key_hash UNIQUE (api_key_hash),
    CONSTRAINT ck_users_name_len CHECK (char_length(name) BETWEEN 1 AND 64),
    CONSTRAINT ck_preferred_models_is_array CHECK (jsonb_typeof(preferred_models) = 'array')
);

CREATE TABLE call_logs (
    id                  VARCHAR(32)  PRIMARY KEY,
    user_id             UUID         NOT NULL REFERENCES users(id),
    session_id          VARCHAR(64)  NOT NULL DEFAULT '',
    task_id             VARCHAR(32),
    provider            VARCHAR(16)  NOT NULL,
    model_name          VARCHAR(64)  NOT NULL,
    prompt_tokens       INTEGER      NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens   INTEGER      NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    cost_usd            NUMERIC(12,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
    status              VARCHAR(16)  NOT NULL,
    latency_ms          INTEGER      NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
    error_code          VARCHAR(64)  NOT NULL DEFAULT '',
    trace_id            VARCHAR(32)  NOT NULL DEFAULT '',
    create_time         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_call_logs_status CHECK (
        status IN ('success','timeout','rate_limited','filtered','failed','budget_denied')
    )
);

CREATE INDEX idx_call_logs_user_ctime
    ON call_logs (user_id, create_time DESC);

CREATE INDEX idx_call_logs_status_ctime
    ON call_logs (status, create_time DESC)
    WHERE status <> 'success';

CREATE INDEX idx_call_logs_task
    ON call_logs (task_id)
    WHERE task_id IS NOT NULL;

CREATE TABLE agent_tasks (
    task_id      VARCHAR(32) PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES users(id),
    status       VARCHAR(16) NOT NULL,
    input        TEXT        NOT NULL,
    tools        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    cost_usd     NUMERIC(12,6) NOT NULL DEFAULT 0,
    result       JSONB,
    error_code   VARCHAR(64) NOT NULL DEFAULT '',
    trace_id     VARCHAR(32) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    CONSTRAINT ck_agent_status CHECK (
        status IN ('queued','running','succeeded','failed','cancelled')
    )
);

CREATE INDEX idx_agent_tasks_user_created
    ON agent_tasks (user_id, created_at DESC);
