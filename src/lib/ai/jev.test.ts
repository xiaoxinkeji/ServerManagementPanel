import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askJevCore, diagnoseContainerLogsCore } from "./jev.ts";

describe("Jev System One Kernel", () => {
  it("diagnoses OOM killed crash correctly", async () => {
    const logs = `
      2026-09-19T10:00:00.000Z Starting memory stress test
      2026-09-19T10:00:05.000Z fatal: out of memory (allocated 104857600 bytes)
      2026-09-19T10:00:06.000Z Killed
    `;
    const res = await diagnoseContainerLogsCore("test-worker", logs, 137);
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
    const res = await diagnoseContainerLogsCore("api-backend", logs, 1);
    assert.equal(res.category, "network_timeout");
    assert.equal(res.is_fatal, false);
    assert.equal(res.can_autoheal, true);
  });

  it("diagnoses config syntax error as fatal non-autohealable", async () => {
    const logs = `
      YAML: Parse error at line 14, column 8: unexpected token
      fatal error: invalid configuration file
    `;
    const res = await diagnoseContainerLogsCore("web-app", logs, 1);
    assert.equal(res.category, "config_syntax_error");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, false);
  });

  it("diagnoses healthy running state without fatal flags", async () => {
    const logs = `
      Server listening on http://0.0.0.0:8080
      Ready on port 8080 in 450ms
    `;
    const res = await diagnoseContainerLogsCore("web-app", logs, 0);
    assert.equal(res.category, "normal_operation");
    assert.equal(res.is_fatal, false);
  });

  it("answers custom Jev choice queries", async () => {
    const decision = await askJevCore({
      type: "choice",
      context: "Docker container crashed with code 137 due to Out Of Memory",
      question: "What is the reason?",
      options: ["oom_killed", "network_timeout", "unknown"],
    });
    assert.equal(decision.answer, "oom_killed");
    assert.ok(decision.confidence >= 0.7);
    assert.equal(decision.engine, "builtin_jev");
  });

  it("diagnoses disk full as fatal non-autohealable", async () => {
    const logs = `Error: ENOSPC: no space left on device, write`;
    const res = await diagnoseContainerLogsCore("app", logs, 1);
    assert.equal(res.category, "disk_full");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, false);
  });

  it("diagnoses port conflict", async () => {
    const logs = `Error: listen EADDRINUSE: address already in use :::3000`;
    const res = await diagnoseContainerLogsCore("web", logs, 1);
    assert.equal(res.category, "port_conflict");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, false);
  });

  it("diagnoses DNS failure as autohealable", async () => {
    const logs = `Error: getaddrinfo ENOTFOUND db.internal`;
    const res = await diagnoseContainerLogsCore("api", logs, 1);
    assert.equal(res.category, "dns_failure");
    assert.equal(res.is_fatal, false);
    assert.equal(res.can_autoheal, true);
  });

  it("diagnoses auth failure", async () => {
    const logs = `FATAL: password authentication failed for user "postgres"`;
    const res = await diagnoseContainerLogsCore("db", logs, 1);
    assert.equal(res.category, "auth_failure");
    assert.equal(res.is_fatal, true);
    assert.equal(res.can_autoheal, false);
  });

  it("diagnoses missing dependency", async () => {
    const logs = `Error: Cannot find module 'express'\nRequire stack: /app/index.js`;
    const res = await diagnoseContainerLogsCore("node-app", logs, 1);
    assert.equal(res.category, "missing_dependency");
    assert.equal(res.is_fatal, true);
  });

  it("nginx [emerg] missing file resolves to config error not missing dependency", async () => {
    const logs = `nginx: [emerg] open() "/etc/nginx/nginx.conf" failed (2: No such file or directory)`;
    const res = await diagnoseContainerLogsCore("nginx", logs, 1);
    assert.equal(res.category, "config_syntax_error");
  });

  it("returns evidence lines for the winning category", async () => {
    const logs = `start ok\nError: connect ECONNREFUSED 10.0.0.1:5432`;
    const res = await diagnoseContainerLogsCore("api", logs, 1);
    assert.ok(Array.isArray(res.evidence));
    assert.ok(res.evidence.some((l) => l.includes("ECONNREFUSED")));
  });

  it("distribution sums to ~1 and only contains passed options", async () => {
    const decision = await askJevCore({
      type: "choice",
      context: "fatal: out of memory, process killed",
      question: "cause?",
      options: ["oom_killed", "network_timeout", "unknown"],
    });
    const dist = decision.distribution || {};
    assert.deepEqual(
      Object.keys(dist).sort(),
      ["network_timeout", "oom_killed", "unknown"].sort(),
    );
    const sum = Object.values(dist).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.06, `sum=${sum}`);
  });

  it("score mode returns number in range, >=8 for fatal and <=2 for healthy", async () => {
    const fatal = await askJevCore({
      type: "score",
      context: "fatal: out of memory, killed",
      question: "How severe?",
      min: 0,
      max: 10,
    });
    assert.equal(typeof fatal.answer, "number");
    assert.ok((fatal.answer as number) >= 8 && (fatal.answer as number) <= 10);

    const healthy = await askJevCore({
      type: "score",
      context: "Server listening on 0.0.0.0:80, started successfully",
      question: "How severe?",
      min: 0,
      max: 10,
    });
    assert.equal(typeof healthy.answer, "number");
    assert.ok((healthy.answer as number) >= 0 && (healthy.answer as number) <= 2);
  });

  it("boolean mode answers healthy question correctly", async () => {
    const healthy = await askJevCore({
      type: "boolean",
      context: "Server listening on 0.0.0.0:8080, status: up",
      question: "Is this container healthy?",
    });
    assert.equal(healthy.answer, true);

    const broken = await askJevCore({
      type: "boolean",
      context: "Error: connect ECONNREFUSED 127.0.0.1:3306",
      question: "Is this container healthy?",
    });
    assert.equal(broken.answer, false);
  });

  it("boolean mode answers failure question true for error log", async () => {
    const res = await askJevCore({
      type: "boolean",
      context: "Error: connect ECONNREFUSED 127.0.0.1:3306",
      question: "Did the container fail?",
    });
    assert.equal(res.answer, true);
  });

  it("does not false-positive on yaml config loading or numeric 401 in logs", async () => {
    const logs = `Loading config from /app/config.yaml\nServer listening on :8080\nrequest id 4011 done`;
    const res = await diagnoseContainerLogsCore("web", logs, 0);
    assert.equal(res.category, "normal_operation");
  });

  it("does not false-positive on configured read timeout lines", async () => {
    const logs = `Warning: read timeout 30s configured\nlistening on 0.0.0.0:80`;
    const res = await diagnoseContainerLogsCore("web", logs, 0);
    assert.equal(res.category, "normal_operation");
  });

  it("caps repeat-hit bonus and evidence for repeated identical failures", async () => {
    const logs = Array(6).fill("connect ECONNREFUSED 10.0.0.5:5432").join("\n");
    const res = await diagnoseContainerLogsCore("api", logs, 1);
    assert.equal(res.category, "network_timeout");
    assert.ok(res.evidence.length <= 3);
    assert.ok(res.confidence <= 0.99);
  });
});
