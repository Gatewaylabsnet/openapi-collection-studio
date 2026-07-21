import { describe, expect, it } from "vitest";
import { createRequest, parseCurlCommand, requestToCurl, looksLikeCurl } from "../src";

describe("requestToCurl", () => {
  it("renders method, url, headers, bearer auth, and body", () => {
    const request = createRequest({ name: "Create", method: "POST", url: "https://api.example.com/users" });
    request.headers.push({ id: "h1", key: "Content-Type", value: "application/json", enabled: true });
    request.auth = { type: "bearer", token: "{{accessToken}}" };
    request.body = { mode: "json", contentType: "application/json", raw: '{"name":"a"}' };

    const curl = requestToCurl(request);

    expect(curl).toContain("curl -X POST 'https://api.example.com/users'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain("-H 'Authorization: Bearer {{accessToken}}'");
    expect(curl).toContain(`--data '{"name":"a"}'`);
  });

  it("appends enabled query params to the url", () => {
    const request = createRequest({ name: "List", method: "GET", url: "https://api.example.com/users" });
    request.queryParams.push({ id: "q1", key: "status", value: "active", enabled: true });
    expect(requestToCurl(request)).toContain("users?status=active");
  });

  it("renders enabled URL-encoded form fields", () => {
    const request = createRequest({ name: "Token", method: "POST", url: "https://api.example.com/token" });
    request.body = {
      mode: "form",
      contentType: "application/x-www-form-urlencoded",
      form: [
        { id: "grant", key: "grant_type", value: "client_credentials", enabled: true },
        { id: "secret", key: "client_secret", value: "skip", enabled: false }
      ]
    };

    const curl = requestToCurl(request);

    expect(curl).toContain("--data-urlencode 'grant_type=client_credentials'");
    expect(curl).not.toContain("client_secret");
  });
});

describe("parseCurlCommand", () => {
  it("parses a devtools-style multi-line curl", () => {
    const request = parseCurlCommand(`curl 'https://api.example.com/users?limit=10' \\
      -X POST \\
      -H 'Content-Type: application/json' \\
      -H 'Authorization: Bearer abc.def.ghi' \\
      --data '{"name":"a"}'`);

    expect(request.method).toBe("POST");
    // URL is stored without its query string; params are separate.
    expect(request.url).toBe("https://api.example.com/users");
    expect(request.queryParams).toEqual([
      expect.objectContaining({ key: "limit", value: "10" })
    ]);
    expect(request.headers.some((h) => h.key === "Content-Type")).toBe(true);
    // Authorization is lifted into bearer auth, not left as a header.
    expect(request.headers.some((h) => h.key.toLowerCase() === "authorization")).toBe(false);
    expect(request.auth).toEqual({ type: "bearer", token: "abc.def.ghi" });
    expect(request.body.raw).toBe('{"name":"a"}');
  });

  it("defaults to POST when data is present without an explicit method", () => {
    const request = parseCurlCommand(`curl https://x.test/a -d 'hello'`);
    expect(request.method).toBe("POST");
    expect(request.body.mode).toBe("raw");
  });

  it("maps --user to basic auth", () => {
    const request = parseCurlCommand(`curl https://x.test -u alice:secret`);
    expect(request.auth).toEqual({ type: "basic", username: "alice", password: "secret" });
  });

  it("round-trips a request through curl and back", () => {
    const original = createRequest({ name: "R", method: "PUT", url: "https://x.test/items/5" });
    original.headers.push({ id: "h", key: "X-Test", value: "1", enabled: true });
    original.queryParams.push({ id: "q", key: "verbose", value: "true", enabled: true });
    original.body = { mode: "raw", contentType: "application/json", raw: '{"a":1}' };

    const reparsed = parseCurlCommand(requestToCurl(original));

    expect(reparsed.method).toBe("PUT");
    // The URL stays query-free and the param is not duplicated on round trip.
    expect(reparsed.url).toBe("https://x.test/items/5");
    expect(reparsed.queryParams).toEqual([
      expect.objectContaining({ key: "verbose", value: "true" })
    ]);
    expect(reparsed.headers.find((h) => h.key === "X-Test")?.value).toBe("1");
    expect(reparsed.body.raw).toBe('{"a":1}');
  });

  it("detects curl text", () => {
    expect(looksLikeCurl("  curl https://x.test")).toBe(true);
    expect(looksLikeCurl("openapi: 3.0.0")).toBe(false);
  });
});
