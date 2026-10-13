import { describe, expect, it } from "vite-plus/test";
import { containsSecret, describeSecret, urlCredentials } from "./sensitive";

describe("credential refusal mirrors the runtime", () => {
  it("refuses a key-shaped assignment and names the shape", () => {
    expect(containsSecret("password=hunter2")).toBe(true);
    expect(describeSecret("api_key = abc123")).toContain("密钥赋值");
  });

  it("catches credentials inside a URL, which an assignment pattern misses", () => {
    // The shape an operator actually pastes into an endpoint field: no `=` and no `key: value` pair.
    expect(urlCredentials("http://user:secret@127.0.0.1:8080/api")).toBe("user:secret");
    expect(containsSecret("http://user:secret@127.0.0.1:8080/api")).toBe(true);
    expect(describeSecret("http://user:secret@127.0.0.1:8080/api")).toContain("地址中的凭据");
  });

  it("leaves an ordinary address alone", () => {
    expect(containsSecret("http://127.0.0.1:8080/api")).toBe(false);
    expect(describeSecret("http://127.0.0.1:8080/api")).toBeNull();
  });

  it("refuses a private key and a bearer token", () => {
    expect(describeSecret("-----BEGIN RSA PRIVATE KEY-----")).toContain("私钥");
    expect(containsSecret("Authorization: Bearer abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });

  it("does not refuse ordinary business text", () => {
    expect(containsSecret("订单表 orders 的 customer_id 需要索引")).toBe(false);
    expect(containsSecret("")).toBe(false);
    expect(containsSecret(null)).toBe(false);
    expect(containsSecret(undefined)).toBe(false);
  });
});
