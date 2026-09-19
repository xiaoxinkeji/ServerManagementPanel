import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateHeuristicPrescription } from "./llm.ts";

describe("LLM SRE Expert Engine", () => {
  it("generates actionable prescription for OOM crash", () => {
    const res = generateHeuristicPrescription("my-worker", "oom_killed");
    assert.ok(res.rootCause.includes("内存消耗"));
    assert.ok(res.commands.length >= 2);
    assert.ok(res.commands.some((c) => c.includes("docker update")));
    assert.equal(res.model, "builtin-heuristic-expert");
  });

  it("generates actionable prescription for network timeouts", () => {
    const res = generateHeuristicPrescription("api-gateway", "network_timeout");
    assert.ok(res.rootCause.includes("网络超时"));
    assert.ok(res.commands.some((c) => c.includes("docker inspect")));
    assert.ok(res.prevention.includes("networks"));
  });

  it("generates actionable prescription for config syntax errors", () => {
    const res = generateHeuristicPrescription("web", "config_syntax_error");
    assert.ok(res.rootCause.includes("语法错误"));
    assert.ok(res.commands.some((c) => c.includes("docker inspect")));
  });

  it("generates actionable prescription for permission denied errors", () => {
    const res = generateHeuristicPrescription("db", "permission_denied");
    assert.ok(res.rootCause.includes("权限"));
    assert.ok(res.commands.some((c) => c.includes("chown")));
  });
});
