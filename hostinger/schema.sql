CREATE TABLE IF NOT EXISTS oj_records (
  kind VARCHAR(32) NOT NULL,
  id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  parent_id VARCHAR(64) NULL,
  created_at VARCHAR(32) NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  data JSON NOT NULL,
  PRIMARY KEY (kind,id),
  INDEX ix_owner (kind,user_id,created_at),
  INDEX ix_parent (kind,parent_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS oj_credentials (
  user_id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  confirmed TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS oj_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_hash CHAR(64) NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL,
  refresh_expires_at BIGINT NOT NULL,
  INDEX ix_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS oj_codes (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  purpose VARCHAR(24) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  payload JSON NULL,
  INDEX ix_code (email,purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS oj_rate_limits (
  bucket CHAR(64) PRIMARY KEY,
  hits INT NOT NULL DEFAULT 0,
  resets_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS oj_mutex (id INT PRIMARY KEY) ENGINE=InnoDB;
INSERT IGNORE INTO oj_mutex VALUES (1);
