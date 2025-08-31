-- Creates central sites table for multi-site support
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
