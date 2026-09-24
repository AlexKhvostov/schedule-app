import { Fragment, useEffect, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  loadRoleAccess,
  saveRoleOrder,
  setRoleAdminVisible,
  setRoleLimit,
  setRolePermission,
  type RoleAccessRow,
} from "../../data/roleAccess";
import { LIMIT_OPTIONS, formatLimit } from "../../schedule/capacity";
import { loadTheme } from "../theme";
import { showV2Toast } from "../V2Toast";

export function MembersRoleSettings() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<RoleAccessRow[]>([]);
  const [permissions, setPermissions] = useState<{ code: string; title: string }[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const reload = async () => {
    const next = await loadRoleAccess();
    const present = next.roles.filter((role) => role.present);
    setRoles(present);
    setPermissions(next.permissions);
    setOrder(present.map((role) => role.id));
  };

  useEffect(() => {
    void reload();
  }, []);

  const orderedRoles = order
    .map((id) => roles.find((role) => role.id === id))
    .filter((role): role is RoleAccessRow => Boolean(role));
  const primaryRoles = orderedRoles.filter((role) => role.adminVisible);
  const technicalRoles = orderedRoles.filter((role) => !role.adminVisible);
  const visibleRoles = showTechnical ? [...primaryRoles, ...technicalRoles] : primaryRoles;
  const editingRole = roles.find((role) => role.id === editingId) ?? null;

  const changePermission = async (role: RoleAccessRow, code: string, on: boolean) => {
    setBusy(`${role.id}:${code}`);
    const result = await setRolePermission(role.id, code, on);
    setBusy("");
    if (result.error) showV2Toast("err", t("admin.people.saveErr"));
    else await reload();
  };

  const changeLimit = async (role: RoleAccessRow, variant: "nitro" | "regular", limit: string, on: boolean) => {
    setBusy(`${role.id}:${variant}:${limit}`);
    const result = await setRoleLimit(role.id, variant, limit, on);
    setBusy("");
    if (result.error) showV2Toast("err", t("admin.people.saveErr"));
    else await reload();
  };

  const commitDrop = async (targetId: string, targetVisible: boolean) => {
    if (!draggingId || draggingId === targetId || busy) return;
    const source = roles.find((role) => role.id === draggingId);
    if (!source) return;
    const next = order.filter((id) => id !== source.id);
    next.splice(Math.max(0, next.indexOf(targetId)), 0, source.id);
    setOrder(next);
    setBusy("drag");
    const orderResult = await saveRoleOrder(next);
    const visibilityResult =
      source.adminVisible === targetVisible
        ? { error: null }
        : await setRoleAdminVisible(source.id, targetVisible);
    setBusy("");
    setDraggingId(null);
    if (orderResult.error || visibilityResult.error) showV2Toast("err", t("admin.people.saveErr"));
    else await reload();
  };

  const dropOnDivider = async () => {
    if (!draggingId || busy) return;
    const source = roles.find((role) => role.id === draggingId);
    if (!source) return;
    setBusy("drag");
    const result = await setRoleAdminVisible(source.id, !source.adminVisible);
    setBusy("");
    setDraggingId(null);
    if (result.error) showV2Toast("err", t("admin.people.saveErr"));
    else await reload();
  };

  const dragStart = (event: DragEvent, roleId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", roleId);
    setDraggingId(roleId);
  };

  const permissionTitle = new Map(permissions.map((permission) => [permission.code, permission.title]));

  return (
    <>
      <section className="v2-people-section v2-role-settings">
        <header className="v2-people-section-head">
          <span className="v2-people-section-icon"><i className="fa-solid fa-shield-halved" /></span>
          <span>
            <b>{t("admin.people.roleSettingsTitle")}</b>
            <small>{t("admin.people.roleListLead")}</small>
          </span>
          <span className="v2-section-count">{primaryRoles.length}</span>
        </header>
        <div className="v2-role-summary-list">
          {visibleRoles.map((role, index) => (
            <Fragment key={role.id}>
              {showTechnical && index === primaryRoles.length ? (
                <button
                  type="button"
                  className="v2-role-divider is-open"
                  onClick={() => setShowTechnical(false)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void dropOnDivider()}
                >
                  <span />
                  <b>{t("admin.people.technicalRoles", { n: technicalRoles.length })}</b>
                  <i className="fa-solid fa-chevron-up" />
                  <span />
                </button>
              ) : null}
              <article
                className={`v2-role-summary${draggingId === role.id ? " is-dragging" : ""}${role.adminVisible ? "" : " is-technical"}`}
                role="button"
                tabIndex={0}
                draggable={!busy}
                onDragStart={(event) => dragStart(event, role.id)}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => void commitDrop(role.id, role.adminVisible)}
                onClick={() => setEditingId(role.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") setEditingId(role.id);
                }}
              >
                <i className="fa-solid fa-grip-vertical v2-role-drag" title={t("admin.people.roleDrag")} />
                <span className="v2-role-name">
                  <i style={{ background: role.color || "#6b7280" }} />
                  <b>{role.name}</b>
                </span>
                <span className="v2-role-grant-summary">
                  {role.permissions.length
                    ? role.permissions.map((code) => <i key={code}>{permissionTitle.get(code) ?? code}</i>)
                    : <small>{t("admin.people.roleNoAccess")}</small>}
                </span>
                <span className="v2-role-limit-summary">
                  {(["nitro", "regular"] as const).map((variant) => {
                    const values = role.limits.filter((item) => item.variant === variant).map((item) => formatLimit(item.limit));
                    return values.length ? <small key={variant}><b>{variant === "nitro" ? "N" : "R"}</b> {values.join(" · ")}</small> : null;
                  })}
                </span>
                <i className="fa-solid fa-pen v2-role-edit" />
              </article>
            </Fragment>
          ))}
          {!showTechnical && technicalRoles.length ? (
            <button
              type="button"
              className="v2-role-divider"
              onClick={() => setShowTechnical(true)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void dropOnDivider()}
            >
              <span />
              <b>{t("admin.people.technicalRolesHidden", { n: technicalRoles.length })}</b>
              <i className="fa-solid fa-chevron-down" />
              <span />
            </button>
          ) : null}
        </div>
      </section>

      {editingRole
        ? createPortal(
            <div className={`v2-mem-overlay theme-${loadTheme()}`} onClick={() => setEditingId(null)}>
              <div className="v2-mem-modal v2-role-editor-modal" onClick={(event) => event.stopPropagation()}>
                <div className="v2-role-editor-head">
                  <i style={{ background: editingRole.color || "#6b7280" }} />
                  <span>
                    <b>{editingRole.name}</b>
                    <small>{t("admin.people.roleEditHint")}</small>
                  </span>
                  <button type="button" className="v2-ctrl" onClick={() => setEditingId(null)} aria-label={t("admin.card.close")}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
                <div className="v2-role-editor-permissions">
                  {permissions.map((permission) => {
                    const checked = editingRole.permissions.includes(permission.code);
                    return (
                      <label key={permission.code} className={checked ? "is-on" : undefined}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={Boolean(busy)}
                          onChange={(event) => void changePermission(editingRole, permission.code, event.target.checked)}
                        />
                        <i className={`fa-solid ${checked ? "fa-square-check" : "fa-square"}`} />
                        <span>{permission.title}</span>
                      </label>
                    );
                  })}
                </div>
                {editingRole.permissions.includes("schedule") ? (
                  <div className="v2-role-editor-limits">
                    {(["nitro", "regular"] as const).map((variant) => (
                      <div key={variant}>
                        <b>{variant === "nitro" ? "Nitro" : "Regular"}</b>
                        <span>
                          {LIMIT_OPTIONS.map((limit) => {
                            const checked = editingRole.limits.some((item) => item.variant === variant && item.limit === limit);
                            return (
                              <label key={limit} className={checked ? "is-on" : undefined}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={Boolean(busy)}
                                  onChange={(event) => void changeLimit(editingRole, variant, limit, event.target.checked)}
                                />
                                <span>{formatLimit(limit)}</span>
                              </label>
                            );
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
