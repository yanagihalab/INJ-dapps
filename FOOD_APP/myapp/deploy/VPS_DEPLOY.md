# VPS Deployment

This service can run on the same Sakura VPS as Tozan Todoke.

## Port Plan

- host nginx: `80` / `443`
- Tozan Todoke frontend: `127.0.0.1:8080`
- Tozan Todoke backend: `127.0.0.1:8788`
- INJ Reviews frontend container: `127.0.0.1:8081`
- INJ Reviews backend container: `127.0.0.1:8787`

Only host nginx should be public. Do not expose backend ports to the internet.

## Deploy

```bash
cd ~/INJ-dapps/FOOD_APP/myapp
cp .env.vps.example .env
vi .env
```

Confirm these values:

```env
HTTP_PORT=127.0.0.1:8081
BACKEND_BIND=127.0.0.1
BACKEND_PORT=8787
KEYLESS_MODE=true
INJ_HOME_HOST_PATH=
KEYNAME=
WASM_HOST_PATH=
CODE_ID=39691
CONTRACT=inj1554j03gaqt3uza956hhwlzq3dfry8n7ul7jnmv
```

Start with a project name so container names and volumes do not collide with other Compose projects:

```bash
docker compose --project-name inj-reviews up -d --build
docker compose --project-name inj-reviews ps
curl -f http://127.0.0.1:8081/api/health
```

## Host nginx

Copy the example and edit the domain:

```bash
sudo cp deploy/nginx-inj-reviews.conf.example /etc/nginx/sites-available/inj-reviews
sudo vi /etc/nginx/sites-available/inj-reviews
sudo ln -sf /etc/nginx/sites-available/inj-reviews /etc/nginx/sites-enabled/inj-reviews
sudo nginx -t
sudo systemctl reload nginx
```

Add HTTPS with Certbot after DNS points to the VPS:

```bash
sudo certbot --nginx -d reviews.example.com
```

## Update

```bash
cd ~/INJ-dapps
git pull
cd FOOD_APP/myapp
docker compose --project-name inj-reviews up -d --build
curl -f http://127.0.0.1:8081/api/health
```

## Security Checklist

- `KEYLESS_MODE=true`
- `INJ_HOME_HOST_PATH=`
- `KEYNAME=`
- `WASM_HOST_PATH=`
- no mnemonic/private key on VPS
- firewall exposes only `22`, `80`, `443`
- app backend is bound to `127.0.0.1`
