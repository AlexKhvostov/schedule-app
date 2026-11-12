import { useTranslation } from "react-i18next";
import scheduleExample from "./scheduleExample.json";
import { ApiV2Examples, apiV2ExamplesText } from "./ApiV2Examples";

export function apiExampleRequests(endpoint: string) {
  const get = (query: string) => `GET ${endpoint}?${query}\nX-API-Key: <API_KEY>`;
  return {
    requestAll: get("date=2030-01-15&days=3"),
    requestFiltered: get("date=2030-01-15&days=1&limit=50&variant=nitro"),
    requestNext: get("cursor=<next_cursor>"),
  };
}

export function ApiExamples({ endpoint, version = 1 }: { endpoint: string; version?: 1 | 2 }) {
  const { t } = useTranslation();
  if (version === 2) return <ApiV2Examples endpoint={endpoint} />;
  return <section className="v2-api-examples">
    <h3>{t("apiAdmin.examplesTitle")}</h3>
    <p>{t("apiAdmin.examplesIntro")}</p>
    {Object.entries(apiExampleRequests(endpoint)).map(([key, request]) => <div key={key}>
      <h4>{t(`apiAdmin.${key}`)}</h4>
      {key === "requestNext" && <p>{t("apiAdmin.requestNextHint")}</p>}
      <pre className="v2-api-code"><code>{request}</code></pre>
    </div>)}
    <h4>{t("apiAdmin.responseExample")}</h4>
    <pre className="v2-api-code" data-testid="api-response-example"><code>{JSON.stringify(scheduleExample, null, 2)}</code></pre>
    <div className="v2-api-instructions">{t("apiAdmin.compactNotes")}</div>
  </section>;
}

export function apiExamplesText(endpoint: string, translate: (key: string) => string, version: 1 | 2 = 1) {
  if (version === 2) return apiV2ExamplesText(endpoint, translate);
  const t = (key: string) => translate(`apiAdmin.${key}`);
  return [
    t("examplesTitle"), t("examplesIntro"),
    ...Object.entries(apiExampleRequests(endpoint)).flatMap(([key, request]) => [
      t(key), ...(key === "requestNext" ? [t("requestNextHint")] : []), request,
    ]),
    t("responseExample"), JSON.stringify(scheduleExample, null, 2), t("compactNotes"),
  ].join("\n\n");
}
