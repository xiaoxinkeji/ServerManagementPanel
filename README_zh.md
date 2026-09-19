# 服务器管理面板 (Server Management Panel)

[English](README.md) · [Türkçe](README_tr.md) · [简体中文](README_zh.md)

专为单台 Linux + Docker 服务器设计的自建管理面板。集系统监控、告警、Docker 与 Compose 管理、服务导航卡片、备份、防火墙、文件管理及数据库管理于一体。

专为家庭服务器 (Homelab) 规模打造：单容器部署，内置嵌入式 SQLite，无须外部数据库或消息队列。支持简体中文、英文、土耳其语、德语、法语、意大利语等多语言。

> **版本：** 2.0.0 · **技术栈：** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node 24 (`node:sqlite`)

---

## 目录

- [功能特性](#功能特性)
- [界面截图](#界面截图)
- [系统架构](#系统架构)
- [安全模型](#安全模型)
- [运行环境要求](#运行环境要求)
- [安装部署](#安装部署)
- [可选组件](#可选组件)
- [环境变量](#环境变量)
- [升级与回滚](#升级与回滚)
- [Docker 标签支持](#docker-标签支持)
- [外部 API、Prometheus 与 MQTT](#外部-api、prometheus-与-mqtt)
- [多语言支持](#多语言支持)
- [本地开发](#本地开发)
- [项目结构](#项目结构)
- [已知限制](#已知限制)
- [相关文档](#相关文档)

---

## 功能特性

### 概览与导航

- **总览仪表盘：** 实时展示 CPU、内存、磁盘与网络使用情况、容器数量、未解决告警、系统与镜像更新状态、最近备份时间及置顶卡片。
- **应用导航：** 便捷卡片看板，一键直达服务器上运行的各项服务。支持分类、拖拽排序、自定义图标上传及实时运行状态指示灯。支持通过 Docker 标签自动发现服务，针对 Pi-hole 等服务可直接在卡片上展示快捷小组件。
- **主页与展亭模式 (Kiosk)：** 集成卡片与书签聚合搜索、时钟、天气预报（基于 Open-Meteo，无须 API 密钥）及网络连通性状态指示。支持免登录、只读、基于 Token 的展亭地址（`/kiosk/<token>`），适用于家庭平板挂墙展示。
- **快捷指令面板：** 使用 `Ctrl+K` / `Cmd+K` 快速呼出全局搜索，快速直达任意功能与页面。

### 监控与告警

- **多维度性能监控：** CPU、内存、磁盘、网络与硬件温度历史数据。分层存储指标：原始数据保留 24 小时，1 分钟粒度保留 7 天，1 小时粒度保留 90 天，1 天粒度保留 24 个月。保留周期均可在设置中自定义。提供磁盘、内存、CPU 的容量趋势预测（如“磁盘预计将在 12 天内写满”）。
- **硬件健康检测：** 传感器温度、mdraid 阵列、S.M.A.R.T 硬盘健康状态与 ZFS 存储池状态。在虚拟机环境中不会报错留白，而是明确提示原因。
- **服务状态探针：** 支持 HTTP、TCP、Ping、DNS 及容器探活。包含 60 天在线率展示条及维护窗口设置。
- **事件与告警通知：** 支持 Telegram、Home Assistant、ntfy、Discord 与邮件通知渠道，每个渠道可独立配置告警级别过滤。内置防抖动、重复抑制、静音时段及未恢复告警周期提醒，防止告警风暴。**时间线 (Timeline)** 将审计日志、运行事件与指标异常波动合并展示（如“22:00 修改了配置，22:05 容器异常崩溃”）。
- **集中式日志：** 聚合容器日志与宿主机 journald，基于 SQLite FTS5 全文索引实现毫秒级快速搜索。支持根据日志正则规则触发告警。

### 服务管理

- **Docker 全生命周期管理：** 容器、堆栈 (Compose)、镜像、数据卷、网络与清理维护。
  - 启动、停止、重启、删除容器，支持批量操作。
  - 实时 ANSI 彩色日志、容器内 Web 终端 (xterm.js)、容器文件浏览器与编辑器、单容器资源监控图表。
  - **添加容器：** 支持通过表单直接创建容器，或从现有 Compose / 已拉取镜像预填充。
  - **Compose 编辑器：** 通过可视化表单轻松编辑端口、网络、环境变量与重启策略。保存前展示逐行差异比对 (diff)，自动备份并在启动失败时自动回滚。
  - **一键生成 Compose：** 可直接将现有裸容器转换为标准 `docker-compose.yml` 堆栈文件。
  - **一键镜像更新：** 新容器启动异常时自动回滚至旧容器。自动检测远程 Registry 新版本标签，支持更新前可选 CVE 漏洞检测。
  - 重启循环与 OOM 崩溃检测、镜像层级分析、数据卷克隆与导出、可视化容器网络拓扑图。
- **堆栈管理：** 部署与管理自定义 `docker-compose.yml` 堆栈（`compose up`、`pull`、`restart`、`down`）。部署前自动进行端口冲突等预先检查。
- **数据库管理：** 直连 PostgreSQL、MySQL/MariaDB 与 SQLite 数据库，可视化浏览数据表、执行 SQL 查询并导出结果。
- **文件管理器：** 在设置允许的根目录下浏览、上传、下载与在线编辑文本文件。
- **计划备份：** 基于 restic 的自动化定时备份。支持选择目录与 Docker 数据卷、保留策略、S3/rclone 远程存储目标、快照列表浏览与一键恢复。无需在宿主机安装 restic，所有任务通过临时 `restic/restic` 容器隔离运行。

### 网络与安全

- **反向代理：** 便捷将域名指向本地服务端口（内置 Caddy，自动申请 Let's Encrypt 证书或使用本地自签 CA）。包含证书到期跟踪及 DDNS 动态域名解析（Cloudflare、DuckDNS 等）。
- **局域网设备：** 局域网设备发现与资产清单（带 MAC 地址厂商解析），新发现未知设备自动告警，支持网络唤醒 (Wake-on-LAN)、历史测速记录及 Tailscale 节点状态。
- **端口映射图谱：** 清晰展现每个端口被哪个容器或宿主机服务占用，并提示哪些端口空闲可分配。
- **防火墙：** 可视化查看、添加与删除 ufw 规则，轻松切换出入站默认策略。
- **系统安全防护：** 开放端口检测、SSH 密钥管理、fail2ban 状态与登录失败统计、UPnP 端口映射及基于 Trivy 的容器镜像已知漏洞 (CVE) 扫描。

### 系统与配置

- **服务器控制台：** 内置常用运维指令模板，支持交互式与自由命令执行，系统信息查看，systemd 服务管理，关机与重启。
- **宿主机定时任务：** 管理宿主机自身的 crontab。提供更加人性化的调度配置（如“每隔 N 天的 06:17 执行”）。
- **用户与权限：** 多用户体系，自定义角色与基于权限的访问控制 (RBAC)，支持 TOTP 双因素认证及在线会话管理。
- **安全审计日志：** 详细记录谁在何时修改了什么，支持条件筛选及导出为 CSV。
- **后台任务状态：** 统一查看各项后台任务（指标采集、聚合计算、健康探测、数据备份、证书巡检、网络扫描等）的执行结果，支持手动立即触发。
- **全局设置：** 180+ 项配置均由统一 Schema（`src/settings.schema.ts`）自动驱动渲染，涵盖 20 个分类。无硬编码阈值，修改即时记录审计日志，支持一键恢复默认值及 JSON 格式导入导出。

---

## 界面截图

<table>
<tr>
<td width="50%">

**总览仪表盘**
![总览](screenshots/genel-bakis.png)
实时状态、服务卡片、时钟天气与维护小组件。

</td>
<td width="50%">

**应用服务卡片**
![应用卡片](screenshots/apps.png)
按分类管理服务卡片，带实时健康状态指示灯。

</td>
</tr>
<tr>
<td width="50%">

**性能监控**
![监控](screenshots/izleme.png)
CPU、内存、磁盘与网络历史趋势，支持自选时间范围。

</td>
<td width="50%">

**Docker 容器管理**
![Docker](screenshots/docker.png)
容器列表、状态切换、实时资源占用与快捷终端。

</td>
</tr>
<tr>
<td width="50%">

**服务状态探针**
![服务状态](screenshots/servis-durumu.png)
探针列表、响应延迟与 60 天在线率。

</td>
<td width="50%">

**事件中心与告警**
![事件与通知](screenshots/olaylar.png)
实时捕获容器异常、OOM 崩溃与告警推送。

</td>
</tr>
<tr>
<td width="50%">

**定时数据备份**
![备份](screenshots/yedekleme.png)
基于 restic 的自动化定时备份与历史快照。

</td>
<td width="50%">

**宿主机控制台与服务**
![宿主机](screenshots/sunucu.png)
控制台命令执行、电源控制与 systemd 单元管理。

</td>
</tr>
<tr>
<td width="50%">

**面板任务与后台任务调度**
![面板任务](screenshots/panel-isleri.png)
后台采集、日志汇聚与安全巡检任务调度状态。

</td>
<td width="50%">

**宿主机定时任务 (Crontab)**
![宿主机任务](screenshots/host-gorevleri.png)
可视化查看与配置宿主机系统计划任务。

</td>
</tr>
</table>

---

## 运行环境要求

- **操作系统：** Linux（Debian、Ubuntu、Fedora、Arch、Alpine 等主流发行版，内核版本 ≥ 5.4）
- **容器环境：** Docker 20.10+ 及 Docker Compose v2
- **硬件资源：** 最低 1 核 CPU / 512MB RAM；推荐 2 核 CPU / 1GB RAM
- **存储：** 容器自身占用约 200MB，SQLite 数据文件根据历史指标保留时间通常为数十至数百 MB

---

## 安装部署

以下提供两种部署方式：对于绝大多数普通用户，推荐**方式一（极速免编译安装）**；若需要二次开发或调整源代码，可选择**方式二（源码编译安装）**。

---

### 方式一：极速免编译安装（推荐，专为普通用户设计）

普通用户无需安装 Node.js 或克隆全量源代码，只需准备两个配置文件（`docker-compose.yml` 和 `Caddyfile`）即可一键拉取已经预构建好的多架构容器镜像运行：

#### 选项 A：一键安装脚本（最快）

在服务器终端执行：
```bash
curl -sSL https://raw.githubusercontent.com/xiaoxinkeji/ServerManagementPanel/main/install.sh | bash
```

#### 选项 B：手动快速部署

1. 创建并进入专属部署目录：
```bash
mkdir -p /opt/server-panel && cd /opt/server-panel
```

2. 下载预置配置文件：
```bash
curl -fsSL https://raw.githubusercontent.com/xiaoxinkeji/ServerManagementPanel/main/Caddyfile -o Caddyfile
```

3. 创建 `docker-compose.yml`：
```yaml
services:
  panel:
    image: ghcr.io/xiaoxinkeji/servermanagementpanel:latest
    restart: unless-stopped
    group_add:
      - "${DOCKER_GID}"
    environment:
      MOCK_MODE: ${MOCK_MODE:-0}
      APP_VERSION: ${APP_VERSION:-1.9.0}
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
```

4. 创建 `.env` 环境变量文件：
```bash
# 生成 32 字节（64 位十六进制）加密私钥
MASTER_KEY=$(openssl rand -hex 32)
# 获取宿主机 docker 用户组的 GID
DOCKER_GID=$(getent group docker | cut -d: -f3)

cat << EOF > .env
MASTER_KEY=${MASTER_KEY}
DOCKER_GID=${DOCKER_GID}
PANEL_HTTP_PORT=8080
PANEL_HTTPS_PORT=8443
TZ=Asia/Shanghai
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
EOF
```

5. 启动服务：
```bash
docker compose up -d
```
打开浏览器访问 `http://<服务器IP>:8080`，首次管理员密码输出在日志中：`docker compose logs panel`。

---

### 方式二：克隆源码编译运行（适合二次开发）

若需要自定义前端页面、修改代码逻辑或自行构建镜像：

```bash
# 1. 克隆代码仓库
git clone https://github.com/xiaoxinkeji/ServerManagementPanel.git
cd ServerManagementPanel

# 2. 准备环境变量文件并配置 MASTER_KEY 与 DOCKER_GID
cp .env.example .env

# 3. 本地编译并启动
docker compose up -d --build
```

---

## 可选组件（提升管理能力）

### host-helper（宿主机助手）

用于支持 Compose 堆栈管理、systemd 服务管理、服务器开关机与重启、ufw 防火墙、宿主机 crontab 管理及服务器终端执行。

```bash
sudo host-helper/install.sh
```
该脚本会将后台辅助服务安装为 systemd 服务，并输出 `HELPER_SECRET`。将该值添加到 `.env` 文件中的 `HELPER_SECRET=` 后，执行 `docker compose up -d` 即可。可通过编辑 `/etc/panel-helper/allow.conf` 按需开启具体命令权限。

### 硬件健康检测报告（S.M.A.R.T / ZFS / 温度）

```bash
sudo apt install smartmontools
sudo install -m 700 scripts/hardware.sh /usr/local/bin/panel-hardware.sh
mkdir -p reports
sudo tee /etc/cron.d/panel-hardware <<EOF
*/30 * * * * root PANEL_REPORTS_DIR=$PWD/reports /usr/local/bin/panel-hardware.sh
EOF
```

### 系统可更新软件包检测报告

仅用于巡检与汇报系统安全更新与补丁，**不会**自动安装软件包：

```bash
sudo install -m 700 scripts/os-updates.sh /usr/local/bin/panel-os-updates.sh
sudo tee /etc/cron.d/panel-os-updates <<EOF
17 6 * * * root PANEL_REPORTS_DIR=$PWD/reports /usr/local/bin/panel-os-updates.sh
EOF
```

---

## 多语言支持

面板支持多语言界面切换：
可在 **设置 → 常规 → 语言** (Settings → General → Language) 中自由切换：
- **简体中文 (`zh`)**
- **English (`en`)**
- **Türkçe (`tr`)**
- **Deutsch (`de`)**
- **Français (`fr`)**
- **Italiano (`it`)**

所有语言文件保存在 `src/locales/` 目录下。

---

## 本地开发

本应用基于 Next.js 与 Node.js 构建：

```bash
# 1. 克隆代码仓库
git clone https://github.com/xiaoxinkeji/ServerManagementPanel.git
cd ServerManagementPanel

# 2. 安装依赖
npm install

# 3. 运行本地开发服务
npm run dev

# 4. 运行自动化测试
npm run test

# 5. 类型检查
npm run typecheck

# 6. 多语言完整性检查
npm run i18n:check
```

---

## 开源协议

本项目采用 MIT 协议开源。
