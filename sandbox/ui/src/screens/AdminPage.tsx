import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MARKS, ME } from "../schedule/marks";
import { MarkChip } from "../schedule/MarkChip";
import { useTranslation } from "react-i18next";

const palette = [...MARKS, ME];

const rows = [
  { key: "1", id: "PH-014", tag: "NS", request: "pending", status: "school" },
  { key: "2", id: "PH-002", tag: "SV", request: "active", status: "club" },
  { key: "3", id: "PH-009", tag: "YO", request: "active", status: "club" },
  { key: "4", id: "PH-021", tag: "AL", request: "active", status: "school" },
  { key: "5", id: "PH-007", tag: "OK", request: "blocked", status: "club" },
];

export function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-xl px-6 py-5">
      <h1 className="text-base font-semibold tracking-tight">{t("admin.title")}</h1>
      <p className="mt-1 mb-4 text-[13px] text-foreground/70">{t("admin.lead")}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("admin.colId")}</TableHead>
            <TableHead>{t("admin.colTag")}</TableHead>
            <TableHead>{t("admin.colRequest")}</TableHead>
            <TableHead>{t("admin.colStatus")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const mark = palette.find((m) => m.t === row.tag) ?? {
              t: row.tag,
              discord: row.tag,
              room: row.tag,
              bg: "#c5cad3",
              fg: "#1a1c1e",
              tables: 1,
            };
            const requestVariant = row.request === "active" ? "success" : row.request === "pending" ? "warning" : "danger";
            return (
              <TableRow key={row.key}>
                <TableCell className="font-mono">{row.id}</TableCell>
                <TableCell>
                  <MarkChip mark={mark} />
                </TableCell>
                <TableCell>
                  <Badge variant={requestVariant}>{t(`admin.request.${row.request}`)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === "club" ? "success" : "info"}>{t(`admin.status.${row.status}`)}</Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
