-- +goose Up
ALTER TABLE users RENAME COLUMN login TO email;
DROP INDEX IF EXISTS users_login_lower_idx;
CREATE INDEX users_email_lower_idx ON users (lower(email));

-- +goose Down
DROP INDEX IF EXISTS users_email_lower_idx;
ALTER TABLE users RENAME COLUMN email TO login;
CREATE INDEX users_login_lower_idx ON users (lower(login));
