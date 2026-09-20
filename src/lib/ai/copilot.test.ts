import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateNaturalLanguageToShell } from "./copilot.ts";

describe("Terminal AI Copilot Engine", () => {
  it("translates process check queries to top command", async () => {
    const res = await translateNaturalLanguageToShell("查看当前进程和内存");
    assert.equal(res.command, "top");
    assert.equal(res.safe, true);
    assert.equal(res.model, "builtin-rules");
  });

  it("translates file list queries to ls -la", async () => {
    const res = await translateNaturalLanguageToShell("列出当前目录的所有文件和属性");
    assert.equal(res.command, "ls -la");
    assert.equal(res.safe, true);
  });

  it("translates network test queries to ping", async () => {
    const res = await translateNaturalLanguageToShell("测试一下网络连通性");
    assert.match(res.command, /ping/);
    assert.equal(res.safe, true);
  });

  it("translates disk check queries to df -h", async () => {
    const res = await translateNaturalLanguageToShell("查看磁盘剩余空间");
    assert.equal(res.command, "df -h");
    assert.equal(res.safe, true);
  });

  it("handles empty prompt safely", async () => {
    const res = await translateNaturalLanguageToShell("   ");
    assert.equal(res.command, "");
    assert.equal(res.safe, false);
  });
});
