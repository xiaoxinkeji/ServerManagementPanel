import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askJev, diagnoseContainerLogs } from "./jev.ts";

describe("Jev System One Kernel", () => {
  it("diagnoses OOM killed crash correctly", async () => {
    const logs = `
      2026-09-19T10:00:00.000Z Starting memory stress test
      2026-09-19T10:00:05.000Z fatal: out of memory (allocated 104857600 bytes)
      2026-09-19T10:00:06.000Z Killed
    `;
    const res = await diagnoseContainerLogs("test-worker", logs, 137);
    assert.equal(res.category, "oom_killed");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, true);
    assert.ok(res.confidence > 0.8);
    assert.ok(res.latency_ms >= 0);
  });

  it("diagnoses network timeout correctly", async () => {
    const logs = `
      Error: connect ECONNREFUSED 127.0.0.1:3306
      at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1605:16)
    `;
    const res = await diagnoseContainerLogs("api-backend", logs, 1);
    assert.equal(res.category, "network_timeout");
    assert.equal(res.is_fatal, false);
    assert.equal(res.can_autoheal, true);
  });

  it("diagnoses config syntax error as fatal non-autohealable", async () => {
    const logs = `
      YAML: Parse error at line 14, column 8: unexpected token
      fatal error: invalid configuration file
    `;
    const res = await diagnoseContainerLogs("web-app", logs, 1);
    assert.equal(res.category, "config_syntax_error");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, false);
  });

  it("diagnoses healthy running state without fatal flags", async () => {
    const logs = `
      Server listening on http://0.0.0.0:8080
      Ready on port 8080 in 450ms
    `;
    const res = await diagnoseContainerLogs("web-app", logs, 0);
    assert.equal(res.category, "normal_operation");
    assert.equal(res.is_fatal, false);
  });

  it("answers custom Jev choice queries", async () => {
    const decision = await askJev({
      type: "choice",
      context: "Docker container crashed with code 137 due to Out Of Memory",
      question: "What is the reason?",
      options: ["oom_killed", "network_timeout", "unknown"],
    });
    assert.equal(decision.answer, "oom_killed");
    assert.ok(decision.confidence >= 0.7);
    assert.equal(decision.engine, "builtin_jev");
  });
});
