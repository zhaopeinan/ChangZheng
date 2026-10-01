# Deployment · 部署说明

Static hosting guide for **重走险关 · ChangZheng**.  
「重走险关」静态站部署说明。

> **Security.** This document intentionally omits real hostnames, IPs, SSH
> credentials, and cloud account details. Keep those in a private password
> manager or a local `DEPLOY.local.md` that is gitignored.

> **安全提示。** 本文刻意不记录真实主机名、公网 IP、SSH 凭证与云账号信息。
> 请自行保存在密码管理器，或写入已被 `.gitignore` 忽略的本地 `DEPLOY.local.md`。

---

## What this project is · 项目性质

| Item · 项 | Value · 说明 |
| --- | --- |
| Type · 类型 | Pure static site · 纯静态站点（HTML / CSS / JS + local Three.js） |
| Runtime · 运行时 | No Node / no backend / no database · 无 Node / 无后端 / 无数据库 |
| Local preview · 本地预览 | Open `index.html`, or `python3 -m http.server 8000` |
| Public deploy · 公网部署 | Upload the whole directory to any static host |

---

## Recommended stack · 推荐栈

Any of the following works:

- Object storage + CDN (OSS / S3 / R2 / Cloudflare Pages)
- Nginx / Caddy on a VPS
- GitHub Pages / Netlify / Vercel (static)

Example **Caddy** site block (placeholders only):

```caddy
your.domain.example {
	root * /var/www/changzheng
	encode gzip
	file_server
	try_files {path} /index.html
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}
```

After editing:

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Ensure the web user can read files (`chmod -R a+rX` on the web root).
过严的目录权限（如 `700`）会导致静态站 404。

---

## Sync from local · 本机同步

From the project root (the folder that contains `index.html`):

```bash
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude 'generated' \
  --exclude 'aliyun.env' \
  --exclude '*.env' \
  --exclude 'DEPLOY.local.md' \
  ./ USER@HOST:/var/www/changzheng/
```

Replace `USER@HOST` with your own server. Prefer SSH keys; never commit passwords.

---

## First-time checklist · 首次上线清单

1. Point DNS `A` / `CNAME` to your host
2. Create the web root directory
3. `rsync` (or CI upload) the site files
4. Configure TLS (Caddy / certbot / CDN)
5. Open ports `80/tcp` and `443/tcp` if self-hosting
6. Verify: `curl -I https://your.domain.example`

---

## Ops quick reference · 运维速查

| Task · 操作 | Hint · 提示 |
| --- | --- |
| Stale content · 页面旧内容 | Hard-refresh / purge CDN; confirm `rsync --delete` succeeded |
| 404 on whole site · 全站 404 | Web-root permissions; web server user readable |
| Missing assets · 资源 404 | Ensure `assets/` uploaded completely |
| Certificate fail · 证书失败 | DNS points to the right host; 80/443 open |

---

## What not to publish · 切勿入库

- Cloud / SSH passwords and API keys
- Private server IPs and internal hostnames you do not want public
- Personal analytics tokens
- Any local `*.env` / `aliyun.env` / `DEPLOY.local.md`
