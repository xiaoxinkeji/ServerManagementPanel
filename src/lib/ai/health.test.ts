import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSystemHealthReportCore } from "./health.ts";

describe("AI System Health Diagnostic Engine", () => {
  it("scores 100 when all containers and resources are healthy", async () => {
    const report = await generateSystemHealthReportCore({
      containers: [
        { id: "1", name: "nginx", state: "running", status: "Up 2 days" },
        { id: "2", name: "redis", state: "running", status: "Up 2 days (healthy)" },
      ],
      system: {
        cpuPercent: 12.5,
        memPercent: 45.2,
        diskPercent: 55.0,
      },
    });

    assert.equal(report.score, 100);
    assert.equal(report.rating, "Excellent");
    assert.equal(report.issues.length, 0);
  });

  it("identifies crashed container and provides Jev triage and remediation prescription", async () => {
    const report = await generateSystemHealthReportCore({
      containers: [
        {
          id: "1",
          name: "worker",
          state: "exited",
          status: "Exited (137) 5 minutes ago",
          logsSample: "fatal: out of memory (oom killed)",
        },
      ],
      system: {
        cpuPercent: 20.0,
        memPercent: 50.0,
        diskPercent: 40.0,
      },
    });

    assert.ok(report.score < 100);
    assert.equal(report.summary.crashedContainers, 1);
    const issue = report.issues.find((i) => i.id === "container:worker");
    assert.ok(issue);
    assert.equal(issue.category, "oom_killed");
    assert.equal(issue.severity, "critical");
    assert.ok(issue.commands.length > 0);
  });

  it("flags resource exhaustion when cpu and memory spike", async () => {
    const report = await generateSystemHealthReportCore({
      containers: [],
      system: {
        cpuPercent: 96.0,
        memPercent: 92.0,
        diskPercent: 90.0,
      },
    });

    assert.ok(report.issues.some((i) => i.source === "system"));
    assert.ok(report.issues.some((i) => i.source === "disk"));
    assert.ok(report.score <= 50);
  });
});
