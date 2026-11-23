# Run OJASSS in GitHub Codespaces

1. On the repo page click **Code → Codespaces → Create codespace on main**.
2. Wait for setup (installs web dependencies automatically).
3. In the terminal:
   ```
   cd web
   npm run dev -- --host
   ```
4. Open the forwarded port **5173** preview.

The web app talks to the live API at https://ojasss.com/api by default (see `web/public/config.js`).
Secrets (signing keystore, server `config.php`, Firebase service account) are NOT in this repo — keep them on your PC.
