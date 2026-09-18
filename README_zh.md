# 服务器管理面板 (Server Management Panel)

[English](README.md) · [Türkçe](README_tr.md) · [简体中文](README_zh.md)

专为单台 Linux + Docker 服务器设计的自建管理面板。集系统监控、告警、Docker 与 Compose 管理、服务导航卡片、备份、防火墙、文件管理及数据库管理于一体。

专为家庭服务器 (Homelab) 规模打造：单容器部署，内置嵌入式 SQLite，无须外部数据库或消息队列。支持简体中文、英文、土耳其语、德语、法语、意大利语等多语言。

> **版本：** 1.9.0 · **技术栈：** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Node 24 (`node:sqlite`)

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
实时状态、服务卡片与维护组件一目了然。

</td>
<td width="50%">

**性能监控**
![监控](screenshots/izleme.png)
CPU、内存、磁盘与网络历史趋势，支持自选时间范围。

</td>
</tr>
<tr>
<td width="50%">

**Docker 容器管理**
![Docker](screenshots/docker.png)
容器列表、状态切换、资源占用与快捷操作。

</td>
<td width="50%">

**服务状态探针**
![服务状态](screenshots/servis-durumu.png)
探针列表、响应延迟与 60 天在线率。

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

推荐通过 `docker-compose.yml` 部署：

```yaml
services:
  panel:
    image: ghcr.io/coraspirin/server-management-panel:latest
    container_name: server-panel
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - MASTER_KEY=在此填入64位随机十六进制密钥
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /:/host:ro
```

> **提示：** 生成 `MASTER_KEY`：
> ```bash
> openssl rand -hex 32
> ```

启动服务：
```bash
docker compose up -d
```
打开浏览器访问 `http://<你的服务器IP>:3000` 即可开始使用。初次访问将引导创建超级管理员账号。

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
git clone https://github.com/coraspirin/ServerManagementPanel.git
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
