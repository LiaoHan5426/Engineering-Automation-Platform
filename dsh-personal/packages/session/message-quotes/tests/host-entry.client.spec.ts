/** The browser quotation plugin can load without Host services. */
import { expect, it } from "vite-plus/test";
import { apply } from "../src/index.ts";

it("loads the Host entry without requiring services or registering hooks", () => {
  expect(apply).not.toThrow();
});
