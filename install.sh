# Server Management Panel 一键极速安装脚本
# 适用于 Linux (Ubuntu / Debian / CentOS / Rocky / Fedora 等)
# 使用方式:
#   curl -sSL https://raw.githubusercontent.com/xiaoxinkeji/ServerManagementPanel/main/install.sh | bash

set -e

echo "===================================================="
echo "    欢迎使用 Server Management Panel 安装向导       "
echo "===================================================="

# 1. 检查 Docker 与 Docker Compose
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ 错误: 未检测到 Docker，请先安装 Docker (https://docs.docker.com/engine/install/)"
    exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
    echo "❌ 错误: 未检测到 Docker Compose v2 (docker compose)"
    exit 1
fi

INSTALL_DIR="${PANEL_INSTALL_DIR:-/opt/server-panel}"
echo "📁 安装目录: ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cd "${INSTALL_DIR}"

# 2. 生成密钥与环境配置
echo "🔑 生成加密密钥与配置参数..."
MASTER_KEY=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' < /dev/urandom | head -c64)
DOCKER_GID=$(getent group docker | cut -d: -f3 || echo "999")

# 3. 写入 docker-compose.yml（免编译、直接拉取发布镜像）
cat << 'EOF' > docker-compose.yml
services:
  panel:
    image: ghcr.io/xiaoxinkeji/servermanagementpanel:latest
    restart: unless-stopped
    group_add:
      - "${DOCKER_GID}"
    environment:
      MOCK_MODE: ${MOCK_MODE:-0}
      APP_VERSION: ${APP_VERSION:-2.0.0}
      TZ: ${TZ:-Asia/Shanghai}
      MASTER_KEY: ${MASTER_KEY}
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      HELPER_SECRET: ${HELPER_SECRET:-}
      PANEL_HTTPS_PORT: ${PANEL_HTTPS_PORT:-8443}
      PANEL_HTTP_PORT: ${PANEL_HTTP_PORT:-8080}
    volumes:
      - panel-data:/app/data
      - proxy-config:/app/proxy
      - /var/run/docker.sock:/var/run/docker.sock
      - /run/panel-helper:/run/panel-helper
      # - /var/run/tailscale/tailscaled.sock:/run/tailscale/tailscaled.sock:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/host/root:ro,rslave
      - ${PANEL_REPORTS_DIR:-./reports}:/app/reports:ro
      - /etc/os-release:/host/etc/os-release:ro
      - /etc/hostname:/host/etc/hostname:ro
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      - panel
    ports:
      - "${PANEL_HTTP_PORT:-8080}:80"
      - "${PANEL_HTTPS_PORT:-8443}:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - proxy-config:/etc/caddy/proxy:ro
      - caddy-data:/data
      - caddy-config:/config
    environment:
      TZ: ${TZ:-Asia/Shanghai}
      PANEL_SITE_ADDRESSES: ${PANEL_SITE_ADDRESSES:-:80}

volumes:
  panel-data:
  caddy-data:
  caddy-config:
  proxy-config:

networks:
  default:
    ipam:
      config:
        - subnet: ${PANEL_SUBNET:-172.28.0.0/16}
EOF

# 4. 下载匹配的 Caddyfile
if [ ! -f "Caddyfile" ]; then
    echo "📥 下载 Caddy 配置文件..."
    curl -fsSL https://raw.githubusercontent.com/xiaoxinkeji/ServerManagementPanel/main/Caddyfile -o Caddyfile
fi

# 5. 写入 .env（若不存在）
if [ ! -f ".env" ]; then
    cat << EOF > .env
MASTER_KEY=${MASTER_KEY}
DOCKER_GID=${DOCKER_GID}
PANEL_HTTP_PORT=8080
PANEL_HTTPS_PORT=8443
TZ=Asia/Shanghai
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
PANEL_SUBNET=172.28.0.0/16
EOF
fi

# 6. 启动服务
echo "🚀 启动容器服务..."
docker compose up -d

echo ""
echo "===================================================="
echo "🎉 安装完成！"
echo "🌐 访问地址: http://<你的服务器IP>:8080"
echo "👤 默认用户名: admin"
echo "🔑 初始管理员密码请查看容器日志:"
echo "   cd ${INSTALL_DIR} && docker compose logs panel"
echo "===================================================="
