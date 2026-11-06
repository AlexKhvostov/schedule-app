import { describe, expect, it } from "vitest";
import { dashboardHash, dashboardSections, resolveDashboardSection } from "./routes";
import ru from "../locales/ru.json";
import en from "../locales/en.json";

describe("Dashboard routes", () => {
  it("opens every supported deep link, including the shared regular-player list", () => {
    for (const { id } of dashboardSections) expect(resolveDashboardSection(dashboardHash(id))).toBe(id);
    expect(resolveDashboardSection("#dashboard/regs")).toBe("regs");
  });

  it("falls back to daily points for the root and unknown or malformed sections", () => {
    for (const hash of ["#dashboard", "#dashboard/", "#dashboard/unknown", "#dashboard/%", "#dashboard/regs/extra"]) {
      expect(resolveDashboardSection(hash)).toBe("points");
    }
  });

  it("has complete Russian and English content for every reachable section and block", () => {
    for (const locale of [ru, en]) {
      for (const { id, blocks } of dashboardSections) {
        expect(locale.sections[id].title).toBeTruthy();
        expect(locale.sections[id].description).toBeTruthy();
        for (const block of blocks) {
          expect(locale.blocks[block].title).toBeTruthy();
          expect(locale.blocks[block].description).toBeTruthy();
        }
      }
    }
  });
});
