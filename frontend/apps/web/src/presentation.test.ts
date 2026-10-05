import { describe, expect, it } from "vite-plus/test";
import { AxiosError } from "axios";
import { errorMessage, statusLabel } from "./presentation";

describe("user-facing feedback", () => {
  it("distinguishes network errors from empty results", () => {
    expect(errorMessage(new AxiosError("Network Error"))).toContain("无法连接");
  });
  it("explains timeouts", () => {
    expect(errorMessage(new AxiosError("Timeout", "ECONNABORTED"))).toContain("超时");
  });
  it("uses readable lifecycle labels", () => {
    expect(statusLabel("needs-planning")).toBe("待规划");
    expect(statusLabel("completed")).toBe("已完成");
    expect(statusLabel("unknown")).toBe("unknown");
  });
});
