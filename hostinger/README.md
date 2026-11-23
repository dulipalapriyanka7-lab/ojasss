# Hostinger MySQL deployment

The React web app and Android WebView use the PHP API under `/api`. The API implements the app's existing auth, RPC, media and table endpoints over PDO MySQL. Supabase is no longer required for this deployment. No service key is stored in browser configuration.

1. Build `web` with `npm run build`.
2. Run `node tools/package-hostinger.mjs` from the project root.
3. Archive the **contents** of `work/hostinger-stage`, including both `.htaccess` files, and extract into this site's `public_html`.
4. Open `/api/setup.php?token=<contents of work/setup-token>`. The owner enters the existing MySQL credentials and creates the admin account. Setup initializes SQL tables, stores configuration in `ojasss-private` **outside** `public_html`, and permanently disables setup once configured.
5. Sign in at `/login?next=/admin`. Public signups verify email using a six-digit code. Hostinger PHP mail delivery must be checked with a real inbox before enabling public registration at scale.

`oj_records` stores typed JSON documents with indexed owner and parent keys. Credentials, sessions, verification codes and rate limits have separate SQL tables. All API writes use prepared statements. Sensitive RPC mutations run inside an InnoDB transaction and serialize on `oj_mutex` so wallet reservations and moderation state changes remain consistent. This is suitable for an initial deployment; high-volume feeds and reporting should be moved to dedicated indexed relational queries after load testing.

The PHP API checks the current database role on every request. Tokens are revocable server-side and refresh tokens rotate. Message history is restricted to participants; staff membership does not grant message access. Uploaded files stay outside the document root, have server-sniffed MIME types and are streamed only when referenced by visible content. Money remains integer paise, and withdrawal approval records no external payment by itself.

Firebase dispatch is configured separately after website setup. Do not upload Firebase service-account keys to `public_html` or commit them.

Local integration validation: run MariaDB on localhost port 3308, then run `hostinger/test.php` with PHP 8.2+ and PDO MySQL, mbstring, fileinfo enabled. It uses only the dedicated `ojasss_test` database. Never point this test runner at production.
