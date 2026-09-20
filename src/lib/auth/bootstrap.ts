import "server-only";
import { serverT } from "@/lib/i18n/runtime";

import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { hashPassword } from "@/lib/crypto";
import { audit } from "./audit";

/**
 * İlk açılışta admin hesabı yoksa oluşturur.
 *
 * Parola `ADMIN_PASSWORD` env'inden alınır; yoksa rastgele üretilip loga
 * yazılır. Her iki durumda da `must_change_pw` işaretlenir — üretilen parola
 * konteyner logunda kalır, ilk girişte değiştirilmesi gerekir.
 */
export function bootstrapAdmin(): void {
  const db = getDb();

  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return;

  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const provided = process.env.ADMIN_PASSWORD?.trim();
  const password = provided || randomBytes(12).toString("base64url");

  db.prepare(
    `INSERT INTO users (username, display_name, password_hash, role_id, must_change_pw)
     VALUES (?, ?, ?, 1, 1)`,
  ).run(username, serverT("bootstrapLib.displayName"), hashPassword(password));

  audit({
    username,
    action: "auth.bootstrap",
    detail: provided ? serverT("bootstrapLib.fromEnv") : serverT("bootstrapLib.random"),
  });

  const banner = "=".repeat(64);
  console.log(`\n${banner}`);
  console.log("  [ServerManagementPanel] 管理员账号已就绪 / INITIAL ADMIN ACCOUNT READY");
  console.log(`  用户名 / Username : ${username}`);
  if (provided) {
    console.log("  密码 / Password   : 来自 ADMIN_PASSWORD 环境变量 / From ADMIN_PASSWORD env");
  } else {
    console.log(`  密码 / Password   : ${password}`);
    console.log("  ! 警告: 此密码已记录在启动日志中，请尽快在面板中更改。");
  }
  console.log(`${banner}\n`);
}
