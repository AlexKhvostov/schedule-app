import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const state = vi.hoisted(() => ({ failed: false }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(),
  useState: () => [state.failed, (value: boolean) => { state.failed = value; }],
}));
import { PersonAvatar } from "./PersonAvatar";

function picture(src: string | null) {
  const avatar = PersonAvatar({ src, label: "polar", size: "sm" });
  const Component = avatar.type as (props: typeof avatar.props) => ReactElement<{ onError?: () => void; children?: string; src?: string; className: string }>;
  return Component(avatar.props);
}
afterEach(() => { state.failed = false; });
describe("avatar image failure", () => {
  it("replaces a failed image with initials at the same size", () => {
    const image = picture("/avatar.png");
    expect(image.type).toBe("img");
    image.props.onError?.();
    const fallback = picture("/avatar.png");
    expect(fallback.type).toBe("span");
    expect(fallback.props.children).toBe("PO");
    expect(fallback.props.className).toContain("is-sm");
  });
  it("shows initials for empty image URLs without rendering a broken image", () => {
    expect(picture(" ").type).toBe("span");
    expect(picture(null).props.children).toBe("PO");
  });
});
