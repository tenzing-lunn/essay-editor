-- Idempotent: `npm run db:migrate` applies it as often as needed. Everything a user owns cascades from users.
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Failed sign-ins per username, whether or not the account exists, so a lockout never reveals which usernames are taken.
CREATE TABLE IF NOT EXISTS login_throttle (
  username text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_throttle_updated_idx ON login_throttle (updated_at);

-- New accounts per client IP in a fixed one-hour window (SIGNUP_LIMIT_PER_HOUR).
CREATE TABLE IF NOT EXISTS signup_throttle (
  ip text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_throttle_window_idx ON signup_throttle (window_start);

-- Only sha256(token) is stored, so a database leak can't be replayed as a cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS essays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  html text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  brief text NOT NULL DEFAULT '',
  settings jsonb NOT NULL,
  words integer NOT NULL DEFAULT 0,
  preview text NOT NULL DEFAULT '',
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  trashed_at timestamptz
);
CREATE INDEX IF NOT EXISTS essays_user_updated_idx ON essays (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS essays_trashed_idx ON essays (user_id, trashed_at) WHERE trashed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS essay_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  essay_id uuid NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  html text NOT NULL,
  text text NOT NULL,
  brief text NOT NULL,
  settings jsonb NOT NULL,
  words integer NOT NULL
);
CREATE INDEX IF NOT EXISTS essay_versions_essay_idx ON essay_versions (essay_id, saved_at DESC);

-- A book is uploaded in batches; only complete books are listed, and abandoned uploads are purged after a day.
CREATE TABLE IF NOT EXISTS books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_name text NOT NULL,
  kind text NOT NULL,
  sections integer NOT NULL DEFAULT 0,
  chars integer NOT NULL DEFAULT 0,
  complete boolean NOT NULL DEFAULT false,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS books_user_idx ON books (user_id, added_at);

CREATE TABLE IF NOT EXISTS book_sections (
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  position integer NOT NULL,
  location text NOT NULL,
  text text NOT NULL,
  chars integer NOT NULL,
  PRIMARY KEY (book_id, position)
);

-- Free-tier checks used per account per calendar month (AI_FREE_CHECKS_PER_ACCOUNT); a check is reserved here before the provider is called.
-- A check is one click: requests within two minutes of its first, up to forty, join it (window_started_at, window_requests).
CREATE TABLE IF NOT EXISTS ai_quota (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
ALTER TABLE ai_quota ADD COLUMN IF NOT EXISTS window_started_at timestamptz;
ALTER TABLE ai_quota ADD COLUMN IF NOT EXISTS window_requests integer NOT NULL DEFAULT 0;

-- What free checks have cost this month across every account, in millionths of a dollar. At AI_FREE_BUDGET_USD the free door closes until the 1st.
CREATE TABLE IF NOT EXISTS ai_free_spend (
  month date PRIMARY KEY,
  micro_usd bigint NOT NULL DEFAULT 0
);
