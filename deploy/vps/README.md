# VPS Deployment

This folder is a deployment kit for a Linux VPS where other applications already
run on the same host.

## Architecture

- `nginx` serves the React build on `stream.bisofood.com`
- `nginx` proxies `/api/` and `/ws/` to a local Daphne process
- React static assets stay on `/static/`
- Django collected static assets are exposed on `/backend-static/`
- Daphne listens only on `127.0.0.1:18001`
- the backend runs as a `systemd` service
- the frontend is built to static files under `/var/www/streaming-dev`

This avoids port conflicts with other apps on the VPS and keeps the backend
private behind nginx.

## Files

- `backend.env.example`: backend production environment variables
- `frontend.env.example`: frontend production build variables
- `bootstrap.sh`: first install helper, from clone/pull to running app
- `install_services.sh`: installs the `systemd` service and nginx site
- `deploy.sh`: update script for later deployments

## Recommended first install

Assumption: Ubuntu or Debian VPS, `nginx`, `python3`, `venv`, `npm`, and
`git` already exist.

1. Clone the repo:

```bash
git clone git@github.com:OWNER/REPO.git /srv/streaming-dev
cd /srv/streaming-dev
chmod +x deploy/vps/bootstrap.sh deploy/vps/install_services.sh deploy/vps/deploy.sh
```

2. Run the first-install script:

```bash
APP_DIR=/srv/streaming-dev \
APP_NAME=streaming-dev \
REPO_URL=git@github.com:OWNER/REPO.git \
BRANCH=main \
DOMAIN=stream.bisofood.com \
BACKEND_PORT=18001 \
DEPLOY_USER=$USER \
deploy/vps/bootstrap.sh
```

On the very first run, it will:
- clone or pull
- install the `systemd` service
- install the nginx site
- create `backend.env` and `frontend.env` if missing
- stop before the final deploy if the backend secret is still the placeholder

3. Edit:

```bash
nano /srv/streaming-dev/deploy/vps/backend.env
nano /srv/streaming-dev/deploy/vps/frontend.env
```

4. Run the same bootstrap command again:

```bash
APP_DIR=/srv/streaming-dev \
APP_NAME=streaming-dev \
REPO_URL=git@github.com:OWNER/REPO.git \
BRANCH=main \
DOMAIN=stream.bisofood.com \
BACKEND_PORT=18001 \
DEPLOY_USER=$USER \
deploy/vps/bootstrap.sh
```

5. Add HTTPS:

```bash
sudo certbot --nginx -d stream.bisofood.com
```

HTTPS is important here because browser camera access and WebRTC behavior are
much better in a secure origin.

## GitHub access on a partner repo

If your partner added your GitHub account to the repository, your own account
can still authenticate from the VPS.

Best options:

1. SSH key on the VPS added to **your GitHub account**
   Use this if your collaborator access is already active. The VPS authenticates
   as you, and GitHub checks your access to the partner repo.

2. Deploy key added directly to the repository by your partner
   This is often the cleanest VPS option. It limits the server to that single repo.

3. Fine-grained personal access token
   Works, but is less elegant than SSH for a long-lived VPS.

Recommended commands for option 1:

```bash
ssh-keygen -t ed25519 -C "stream-vps" -f ~/.ssh/stream_vps_github
cat ~/.ssh/stream_vps_github.pub
```

Then add the public key to your GitHub account:
- GitHub
- Settings
- SSH and GPG keys
- New SSH key

After that:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/stream_vps_github
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com
```

Then clone with:

```bash
git clone git@github.com:OWNER/REPO.git /srv/streaming-dev
```

If your partner prefers a deploy key instead, they must add the VPS public key
inside the repository settings on GitHub.

## Environment notes

- `CHANNEL_REDIS_URL` is recommended on a VPS so realtime events stay reliable
  if you later move beyond a single in-memory process.
- `REACT_APP_API_URL=/api` and `REACT_APP_WS_URL=/ws` are used so the frontend
  stays on the same domain and nginx handles routing.
- `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and
  `DJANGO_CSRF_TRUSTED_ORIGINS` must include the production domain.

## Future updates

Once the VPS is installed, updates are just:

```bash
cd /srv/streaming-dev
APP_DIR=/srv/streaming-dev \
APP_NAME=streaming-dev \
BRANCH=main \
deploy/vps/deploy.sh
```
