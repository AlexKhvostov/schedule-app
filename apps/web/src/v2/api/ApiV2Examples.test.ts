import { describe, expect, it } from "vitest";
import ru from "../../locales/ru.json";
import en from "../../locales/en.json";
import { apiV2Requests, apiV2Responses } from "./ApiV2Examples";
import { apiExamplesText } from "./ApiExamples";

describe("portable API v2 instructions", () => {
  const endpoint = "https://example.test/functions/v1/external-api/v2/schedule";
  it("separates full queries, saved checkpoints and page tokens", () => {
    const requests = apiV2Requests(endpoint);
    expect(requests.v2RequestCursor).toBe(`GET ${endpoint}?cursor=<sync_cursor>\nX-API-Key: <API_KEY>`);
    expect(requests.v2RequestPage).toBe(`GET ${endpoint}?page=<next_page>\nX-API-Key: <API_KEY>`);
    const q = new URL(requests.requestFiltered.split("\n")[0].slice(4)).searchParams;
    const example = apiV2Responses.v2ResponseFull;
    expect(q.get("date")).toBe(example.query.date);
    expect(Number(q.get("days"))).toBe(example.query.days);
    expect(example.items[1].half).toBe(43);
    expect(example.items[1].state?.person_id).toBe(example.items[0].id);
    expect(apiV2Responses.v2ResponseDelta.items.every((x) => x.state === null)).toBe(true);
    expect(apiV2Responses.v2ResponseUnchanged.items).toEqual([]);
  });
  for (const [lang, locale] of [["ru", ru], ["en", en]] as const) {
    it(`copies complete v2 rules and all response modes in ${lang}`, () => {
      const t = (key: string) => {
        const value = locale.apiAdmin[key.replace("apiAdmin.", "") as keyof typeof locale.apiAdmin];
        expect(typeof value).toBe("string"); return value;
      };
      const text = apiExamplesText(endpoint, t, 2);
      for (const body of Object.values(apiV2Responses)) expect(text).toContain(JSON.stringify(body, null, 2));
      for (const term of ["priority.order", "batch_id", "state:null", "Retry-After", "Europe/Madrid", "page=", "cursor=", "410", "24", "1000", "180"]) expect(text).toContain(term);
      expect(text).not.toContain("/v1/schedule");
      expect(text).not.toContain("Google");
    });
  }
});
