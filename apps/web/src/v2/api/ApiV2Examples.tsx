import { useTranslation } from "react-i18next";
import full from "./scheduleV2Example.json";

type Translate = (key: string) => string;
const sections = ["Connection", "State", "Pages", "Delta", "Priority", "Errors"] as const;
export function apiV2Requests(endpoint: string) {
  const get = (query: string) => `GET ${endpoint}?${query}\nX-API-Key: <API_KEY>`;
  return {
    v2RequestFull: get("date=2030-01-01&days=31"),
    requestFiltered: get("date=2030-01-15&days=1&limit=50&variant=nitro"),
    v2RequestCursor: get("cursor=<sync_cursor>"),
    v2RequestPage: get("page=<next_page>"),
  };
}
export const apiV2Responses = {
  v2ResponseFull: full,
  v2ResponseDelta: {
    ...full,
    mode: "delta",
    batch_id: "cccccccc-0000-4000-8000-000000000002",
    lines: [],
    items: full.items.map((item) => ({ ...item, state: null })),
    cursor: "dddddddd-0000-4000-8000-000000000002",
  },
  v2ResponseUnchanged: {
    api_version: "2", mode: "unchanged", cursor: "dddddddd-0000-4000-8000-000000000002",
    has_more: false, next_page: null, items: [],
  },
};

export function apiV2ExamplesText(endpoint: string, translate: Translate) {
  const t = (key: string) => translate(`apiAdmin.${key}`);
  return [
    ...sections.flatMap((name) => [t(`v2${name}Title`), t(`v2${name}Text`)]),
    t("examplesTitle"), t("examplesIntro"),
    ...Object.entries(apiV2Requests(endpoint)).flatMap(([key, request]) => [t(key), request]),
    ...Object.entries(apiV2Responses).flatMap(([key, body]) => [t(key), JSON.stringify(body, null, 2)]),
  ].join("\n\n");
}

export function ApiV2Examples({ endpoint }: { endpoint: string }) {
  const { t } = useTranslation();
  return <section className="v2-api-examples">
    {sections.map((name) => <section key={name}>
      <h3>{t(`apiAdmin.v2${name}Title`)}</h3>
      <div className="v2-api-instructions">{t(`apiAdmin.v2${name}Text`)}</div>
    </section>)}
    <h3>{t("apiAdmin.examplesTitle")}</h3><p>{t("apiAdmin.examplesIntro")}</p>
    {Object.entries(apiV2Requests(endpoint)).map(([key, request]) => <section key={key}>
      <h4>{t(`apiAdmin.${key}`)}</h4><pre className="v2-api-code"><code>{request}</code></pre>
    </section>)}
    {Object.entries(apiV2Responses).map(([key, body]) => <section key={key}>
      <h4>{t(`apiAdmin.${key}`)}</h4>
      <pre className="v2-api-code" data-testid={key === "v2ResponseFull" ? "api-response-example" : undefined}><code>{JSON.stringify(body, null, 2)}</code></pre>
    </section>)}
  </section>;
}
