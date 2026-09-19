export interface StackTemplate {
  id: string;
  name: string;
  category: "ai" | "database" | "tool" | "web";
  description: string;
  compose: string;
  defaultName: string;
}

export const PRESET_STACK_TEMPLATES: StackTemplate[] = [
  {
    id: "whisperjav",
    name: "WhisperJAV (AI 语音与字幕工作站)",
    category: "ai",
    description: "针对嘈杂背景、日语低信噪比特定调优的语音识别、VAD 分割与字幕生成服务。",
    defaultName: "whisperjav",
    compose: `services:
  whisperjav:
    image: ghcr.io/meizhong986/whisperjav:latest
    container_name: whisperjav
    restart: unless-stopped
    ports:
      - "8800:8800"
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - ./data:/app/data
      - ./subtitles:/app/subtitles
`,
  },
  {
    id: "ollama",
    name: "Ollama (本地大模型运行环境)",
    category: "ai",
    description: "轻量高效的本地大语言模型运行服务，支持一键运行 Llama 3、Qwen、DeepSeek 等大模型。",
    defaultName: "ollama",
    compose: `services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama

volumes:
  ollama_data:
`,
  },
  {
    id: "postgres",
    name: "PostgreSQL 16",
    category: "database",
    description: "强大开源的对象关系型关系数据库系统，带健康检查与持久化数据卷。",
    defaultName: "postgres",
    compose: `services:
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: app_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ChangeMeStrongPassword!
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`,
  },
  {
    id: "redis",
    name: "Redis 7 Stack",
    category: "database",
    description: "高性能内存键值缓存与消息队列服务，开启 AOF 持久化。",
    defaultName: "redis",
    compose: `services:
  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
`,
  },
  {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    category: "tool",
    description: "美观易用的自托管网站与服务正常运行时间（Uptime）监控面板。",
    defaultName: "uptime-kuma",
    compose: `services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - kuma_data:/app/data

volumes:
  kuma_data:
`,
  },
];
