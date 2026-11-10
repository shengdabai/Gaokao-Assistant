import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const cwd = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), "gaokao-db-test-"));
mkdirSync(path.join(fixture, "data"));
let queries: typeof import("../src/lib/db");
let execute: typeof import("../src/lib/chatTools");
before(async () => {
  process.chdir(fixture);
  try {
    queries = await import("../src/lib/db");
    execute = await import("../src/lib/chatTools");
    queries.getDb();
  } finally { process.chdir(cwd); }
});
after(() => { queries?.getDb().close(); rmSync(fixture, { recursive: true, force: true }); });

test("fresh database supports dorm queries without the optional import script", () => {
  queries.getDb().prepare("INSERT INTO schools (code, name, response_count, dorm_info) VALUES (?, ?, ?, ?)")
    .run("test", "Test University", 1, JSON.stringify({ private_bathroom: ["有"] }));
  const ranked = queries.rankByDormQuality({});
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].dorm_score, 3);
});

test("region names matching object prototype properties are literal city searches", () => {
  assert.equal(queries.searchPrograms({ city: "constructor" }).total_results, 0);
  assert.deepEqual(queries.rankByDormQuality({ city: "__proto__" }), []);
});

test("invalid model tool arguments are rejected before database queries", () => {
  for (const [name, args] of [
    ["search_programs", null], ["search_programs", []], ["search_programs", { subject: {} }],
    ["search_programs", { limit: -1 }], ["search_programs", { limit: 1.5 }],
    ["search_programs", { tuition_max: "free" }], ["rank_by_dorm_quality", { limit: 10000 }],
    ["get_school_info", {}], ["compare_schools", { school_names: "all schools" }],
    ["compare_schools", { school_names: Array(6).fill("School") }],
    ["get_statistics", { dimension: "unrecognized" }],
  ] as const) {
    assert.deepEqual(execute.executeToolCall(name, args), { error: "Invalid tool arguments" });
  }
  assert.equal((execute.executeToolCall("get_school_info", { school_name: "Test University" }) as { name: string }).name, "Test University");
});
