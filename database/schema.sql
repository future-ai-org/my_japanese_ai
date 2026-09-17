-- Production Postgres is hosted on Neon (https://console.neon.tech)
-- and connected to the Vercel deployment via DATABASE_URL.

SET client_min_messages TO WARNING;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS account_tokens;

CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'register')),
  succeeded BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DELETE FROM auth_attempts WHERE action = 'forgot_password';
ALTER TABLE auth_attempts DROP CONSTRAINT IF EXISTS auth_attempts_action_check;
ALTER TABLE auth_attempts ADD CONSTRAINT auth_attempts_action_check
  CHECK (action IN ('login', 'register'));

CREATE TABLE IF NOT EXISTS review_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL
    CHECK (language IN ('casual', 'polite', 'formal')),
  code TEXT NOT NULL,
  result JSONB NOT NULL,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE review_history ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;
-- Drop legacy programming-language history before tightening the register check.
DELETE FROM review_history
  WHERE language NOT IN ('casual', 'polite', 'formal');
ALTER TABLE review_history DROP CONSTRAINT IF EXISTS review_history_language_check;
ALTER TABLE review_history ADD CONSTRAINT review_history_language_check
  CHECK (language IN ('casual', 'polite', 'formal'));

-- Legacy cloud rate-limit rows are unused (browser WebLLM only).
DROP TABLE IF EXISTS inference_requests;

CREATE INDEX IF NOT EXISTS review_history_user_created_idx
  ON review_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS review_history_user_starred_created_idx
  ON review_history (user_id, starred DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS review_history_created_idx
  ON review_history (created_at);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx
  ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS auth_attempts_email_created_idx
  ON auth_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_attempts_ip_created_idx
  ON auth_attempts (ip_address, created_at DESC);
