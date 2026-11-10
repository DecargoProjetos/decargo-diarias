import { fileURLToPath } from "node:url";
import path from "node:path";

export async function verifyPeopleExport({ baseUrl, apiKey, request = fetch }) {
  if (!baseUrl || !apiKey) throw new Error("INTEGRATION_CONFIG_MISSING");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("INTEGRATION_URL_INVALID");
  }
  const response = await request(`${baseUrl.replace(/\/+$/, "")}/api/integration/availability`, {
    method: "GET",
    headers: { "x-api-key": apiKey, Accept: "application/json" },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200) throw new Error("INTEGRATION_ACCESS_REJECTED");
  const body = await response.json();
  if (body?.service !== "people-financial-integration" || body.version !== 2 ||
      body.ready !== true || !Array.isArray(body.supportedTargets) ||
      !body.supportedTargets.includes("diarias")) {
    throw new Error("INTEGRATION_CONTRACT_UNAVAILABLE");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyPeopleExport({
      baseUrl: process.env.PEOPLE_API_URL,
      apiKey: process.env.DECARGO_PEOPLE_API_KEY,
    });
    console.log("People export preflight passed: integration key and read-only contract accepted; no financial writes.");
  } catch {
    console.error("People export preflight failed; deployment must not start. Check integration availability and configuration.");
    process.exitCode = 1;
  }
}
