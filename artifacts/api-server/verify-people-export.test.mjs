import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPeopleExport } from "./verify-people-export.mjs";

const config = { baseUrl: "https://people.example.invalid", apiKey: "synthetic-integration-key" };
const contract = { service: "people-financial-integration", version: 2, ready: true, supportedTargets: ["diarias"] };

test("pre-deploy check is an authenticated read-only request", async () => {
  let calls = 0;
  await verifyPeopleExport({ ...config, request: async (url, options) => {
    calls++;
    assert.equal(url, config.baseUrl + "/api/integration/availability");
    assert.equal(options.method, "GET");
    assert.equal(options.headers["x-api-key"], config.apiKey);
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.equal(options.body, undefined);
    return { status: 200, json: async () => contract };
  } });
  assert.equal(calls, 1);
});

test("access failure or malformed capability contract stops deployment", async () => {
  for (const response of [
    { status: 401, body: contract }, { status: 503, body: contract },
    { status: 200, body: { ...contract, version: 1 } },
    { status: 200, body: { ...contract, ready: false } },
    { status: 200, body: { ...contract, supportedTargets: ["descontos"] } },
    { status: 200, body: null },
  ]) {
    await assert.rejects(verifyPeopleExport({ ...config,
      request: async () => ({ status: response.status, json: async () => response.body }),
    }));
  }
});

test("bad or missing configuration is rejected without any network call", async () => {
  for (const overrides of [
    { apiKey: "" }, { baseUrl: "" }, { baseUrl: "http://people.example.invalid" },
    { baseUrl: "https://user:password@example.invalid" },
    { baseUrl: "https://people.example.invalid?redirect=1" },
  ]) {
    await assert.rejects(verifyPeopleExport({ ...config, ...overrides,
      request: async () => { assert.fail("No request allowed"); },
    }));
  }
});
