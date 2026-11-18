// @vitest-environment jsdom
import { h } from "vue";
import { fireEvent, screen } from "@testing-library/dom";
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from "./vue-render.ts";
import { afterEach, expect, it } from "vite-plus/test";
import { ImagePreview } from "../src/ImagePreview.tsx";
afterEach(cleanup);
it("keeps status inside the preview and resets failures when the source changes", async () => {
  const props = {
    src: "/one.png",
    alt: "Comparison",
    loadingLabel: "Loading image",
    failedLabel: "Image unavailable",
  };
  const { rerender } = await act(async () => render(h(ImagePreview, { ...props }, undefined)));
  expect(screen.getByRole("status").textContent).toBe("Loading image");
  await act(async () => fireEvent.error(screen.getByRole("img")));
  expect(screen.getByRole("status").textContent).toBe("Image unavailable");
  expect(screen.queryByRole("img")).toBeNull();
  await act(async () => {
    rerender(h(ImagePreview, { ...props, src: "/two.png" }, undefined));
  });
  expect(screen.getByRole("status").textContent).toBe("Loading image");
  await act(async () => fireEvent.load(screen.getByRole("img")));
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});
