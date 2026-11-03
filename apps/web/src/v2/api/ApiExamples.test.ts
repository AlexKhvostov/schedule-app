import { describe, expect, it } from "vitest";
import { apiExampleRequests, apiExamplesText } from "./ApiExamples";
import ru from "../../locales/ru.json";
import en from "../../locales/en.json";
import example from "./scheduleExample.json";

describe("API instructions", () => {
  it("uses the selected endpoint and keeps continuation free of initial filters", () => {
    const endpoint = "https://example.test/functions/v1/external-api/v1/schedule";
    const requests = apiExampleRequests(endpoint);
    for (const request of Object.values(requests)) {
      expect(request).toContain(`GET ${endpoint}?`);
      expect(request).toContain("\nX-API-Key: <API_KEY>");
    }
    expect(requests.requestNext).toBe(`GET ${endpoint}?cursor=<next_cursor>\nX-API-Key: <API_KEY>`);
    const filtered = new URL(requests.requestFiltered.split("\n")[0].slice(4));
    expect(filtered.searchParams.get("date")).toBe(example.date_from);
    expect(Number(filtered.searchParams.get("days"))).toBe(example.days_count);
    expect(filtered.searchParams.get("limit")).toBe(example.filters.limit);
    expect(filtered.searchParams.get("variant")).toBe(example.filters.variant);
  });

  for (const [language, locale] of [["ru", ru], ["en", en]] as const) {
    it(`copies full examples and matching pagination rules in ${language}`, () => {
      const translate = (key: string) => {
        const value = locale.apiAdmin[key.replace("apiAdmin.", "") as keyof typeof locale.apiAdmin];
        expect(typeof value).toBe("string");
        return value;
      };
      const text = apiExamplesText("https://example.test", translate);
      expect(text).toContain(JSON.stringify(example, null, 2));
      expect(text).toContain("line.id");
      expect(text).toContain("slot.start");
      expect(text).toContain("24:00");
      expect(text).toContain("time_resolution");
      expect(text).not.toContain("slot.id");
    });
  }
});
