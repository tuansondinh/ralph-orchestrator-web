# EC2 Setup

This deploy layout runs the built frontend bundle and backend API from one Node.js process on a single EC2 instance, with `systemd` supervising the app and `nginx` optionally terminating HTTP or HTTPS in front of it.

## 1. Launch the instance

- Use Ubuntu 22.04 LTS or Amazon Linux 2023.
- Recommended starting size: `t3.xlarge`, 100GB gp3 EBS.
- Open inbound port `22` for SSH and either `80` or `443` for the reverse proxy. If you are skipping nginx for a smoke test, temporarily open `3003`.

## 2. Install runtime dependencies

Install Node.js 20+, npm, git, `rsync`, `expect`, and nginx if you want the reverse proxy:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git rsync expect nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
expect -v
```

## 3. Create the app user and directories

```bash
sudo useradd --create-home --shell /bin/bash app
sudo install -d -o app -g app /opt/ralph-orchestrator-web
sudo install -d -o app -g app /home/app/workspaces
```

## 4. Upload the repo and create the environment file

From your workstation, run:

```bash
./deploy/deploy.sh <ec2-hostname> ~/.ssh/your-key.pem
```

Before the service can start successfully, copy `deploy/.env.example` to `/opt/ralph-orchestrator-web/.env` on the instance and fill in the real values:

```bash
ssh -i ~/.ssh/your-key.pem app@<ec2-hostname>
cd /opt/ralph-orchestrator-web
cp deploy/.env.example .env
chmod 600 .env
```

Required values:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_DB_URL` must all be present to activate cloud mode.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` must match your GitHub OAuth App.
- `RALPH_UI_WORKSPACE_DIR` should point at the workspace directory created for the `app` user.
- Add at least one model provider key such as `ANTHROPIC_API_KEY` so loop runs can execute on the instance.

## 5. Install and start the systemd service

The deploy script copies `deploy/ralph-orchestrator.service` into `/etc/systemd/system/ralph-orchestrator.service`. After the `.env` file is populated, enable the service:

```bash
sudo systemctl enable --now ralph-orchestrator
sudo systemctl status ralph-orchestrator --no-pager
```

Useful log command:

```bash
sudo journalctl -u ralph-orchestrator -f
```

## 6. Configure nginx

Install the site config and validate it before reload:

```bash
sudo cp /opt/ralph-orchestrator-web/deploy/nginx-ralph.conf /etc/nginx/conf.d/ralph-orchestrator.conf
sudo nginx -t
sudo systemctl reload nginx
```

The provided config proxies both normal HTTP traffic and `/ws` upgrades to the backend on `127.0.0.1:3003`.

## 7. Configure Supabase and GitHub

- In Supabase, create the project, enable email/password auth, and create at least one user who can sign in to the app.
- If email confirmation is enabled in Supabase Auth, confirm that user from the Supabase dashboard before attempting the first sign-in.
- In GitHub, create an OAuth App with the callback URL set to `https://your-domain.example/auth/github/callback` if nginx terminates traffic, or `http://<ec2-hostname>:3003/auth/github/callback` for direct backend access.

## 8. Verify the deployment

Checks after each deploy:

```bash
curl -I http://127.0.0.1:3003/health
sudo systemctl status ralph-orchestrator --no-pager
sudo journalctl -u ralph-orchestrator -n 100 --no-pager
```

Smoke test in the browser:

1. Open the site through nginx or directly on port `3003`.
2. Sign in with a Supabase user.
3. Open Settings and connect GitHub.
4. Create a project from a GitHub repo.
5. Start a loop and confirm updates stream over the `/ws` connection.
