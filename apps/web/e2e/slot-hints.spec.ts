import { expect, test, type Locator } from "@playwright/test";
import path from "node:path";

async function appearance(frame: Locator) {
  return frame.evaluate(el => {
    const style = getComputedStyle(el);
    const limit = getComputedStyle(el.querySelector(".v2-opt-frame-limit")!);
    const time = getComputedStyle(el.querySelector(".v2-opt-frame-time")!);
    return { border: style.borderColor, background: style.backgroundColor,
      color: limit.color, italic: limit.fontStyle, timeColor: time.color, timeStyle: time.fontStyle };
  });
}

for (const theme of ["dark", "light"]) {
  test(`hover and selection hints share palette and stay above locked rows in ${theme}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T09:00:00Z"));
    await page.setViewportSize({ width: 1000, height: 820 });
    await page.addInitScript(theme => {
      localStorage.setItem("v2-ui-theme", theme);
      localStorage.setItem("v2-schedule-prefs", JSON.stringify({ limits: ["50", "100"], kinds: ["nitro", "regular"], hidePastDays: true, dimPast: false, workHours: [8, 9, 10, 11] }));
      localStorage.setItem("v2-capacity", JSON.stringify(Object.fromEntries(["50", "100"].map(limit => [limit, {
        hours: Array.from({ length: 24 }, (_, h) => limit === "100" && h !== 9 ? 2 : 1), days: {}, weekdays: {}, equalize: false, weekOn: false, monthOn: false,
      }]))));
      localStorage.setItem("v2-demo-schedule-v1", JSON.stringify(Object.fromEntries(
        ["nitro:50", "nitro:100", "regular:50", "regular:100"].map(pair => [`2026-11:${pair}`, { days: 30, cells: [] }])
      )));
    }, theme);
    await page.goto("/");
    await page.getByRole("tab", { name: /Демо/ }).click();
    await page.getByRole("button", { name: "Войти для проверки" }).click();
    await page.getByRole("button", { name: "you", exact: true }).click();
    await page.getByRole("button", { name: "Кабинет" }).click();
    await page.getByRole("button", { name: "Игра", exact: true }).click();
    const regular = page.locator(".v2-cab-kind", { hasText: "Regular" }).getByRole("button", { name: "50 €", exact: true });
    if (!(await regular.getAttribute("class"))?.includes("is-on")) {
      await regular.click();
      await page.locator(".v2-cab-room").getByRole("button", { name: "Сохранить", exact: true }).click();
    }
    await page.getByRole("navigation", { name: "Меню" }).getByRole("button", { name: "Расписание", exact: true }).click();
    await page.getByTitle("Редактирование", { exact: true }).click();
    const day = page.locator('.v2-opt-block[data-row="4"]');
    const frame = page.locator(".v2-opt-frame");
    await expect(page.locator("body > .v2-opt-frame-host")).toHaveCount(1);
    for (const variant of ["nitro", "regular"]) {
      const prefix = variant === "regular" ? "E50" : "N50";
      const start = day.locator(`[data-slot][data-variant="${variant}"][data-limit="50"][data-half="18"]`).first();
      const end = day.locator(`[data-slot][data-variant="${variant}"][data-limit="50"][data-half="19"]`).first();
      await start.hover();
      await expect(frame).toHaveText(`${prefix}: 09:00 – 09:30`);
      const hover = await appearance(frame);
      expect(hover.border).toBe(hover.color);
      expect(hover.italic).toBe(variant === "regular" ? "italic" : "normal");
      expect(hover.timeStyle).toBe("normal");
      expect(hover.timeColor).not.toBe(hover.color);
      await expect(frame).toHaveCSS("pointer-events", "none");
      for (const mode of ["place", "remove"]) {
        const a = (await start.boundingBox())!;
        const b = (await end.boundingBox())!;
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await expect(frame).toHaveText(`${prefix}: 09:00 – 10:00`);
        await expect(frame).toHaveAttribute("data-mode", mode);
        expect(await appearance(frame)).toEqual(hover);
        const box = (await frame.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(1000);
        expect(box.y).toBeGreaterThanOrEqual(0);
        if (variant === "regular") {
          const locked = day.locator('[data-slot][data-variant="nitro"][data-limit="100"][data-half="18"][data-level="1"]');
          await expect(locked).toHaveClass(/is-lock/);
          // Move the real locked cell over the hint to test paint order, not only z-index values.
          const aboveLock = await locked.evaluate((el, rect) => {
            const old = el.getAttribute("style");
            Object.assign((el as HTMLElement).style, { position: "fixed", left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`, zIndex: "2000" });
            const hint = document.querySelector<HTMLElement>(".v2-opt-frame")!;
            hint.style.pointerEvents = "auto";
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            const above = hint === hit || hint.contains(hit);
            hint.style.removeProperty("pointer-events");
            if (old === null) el.removeAttribute("style"); else el.setAttribute("style", old);
            return above;
          }, box);
          expect(aboveLock).toBe(true);
          await page.screenshot({ path: path.resolve(`../../memory/tasks/2026-11-04-slot-hints-${theme}-${mode}.png`), clip: { x: 0, y: Math.max(0, a.y - 110), width: 700, height: 190 } });
        }
        await page.mouse.up();
        await page.mouse.move(0, 0);
        await expect(frame).toBeHidden();
        if (mode === "place") await expect(start).toHaveClass(/is-on/);
        else await expect(start).not.toHaveClass(/is-on/);
      }
      // Touch has no preceding hover state; cancellation must still remove its hint.
      const touch = await page.context().newCDPSession(page);
      const target = (await start.boundingBox())!;
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: target.x + target.width / 2, y: target.y + target.height / 2 }] });
      await expect(frame).toBeVisible();
      await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      await touch.detach();
      await expect(frame).toBeHidden();
      await expect(start).not.toHaveClass(/is-on/);
      await start.hover();
      await expect(frame).toBeVisible();
      await page.locator(".v2-opt-sheet").evaluate(el => el.dispatchEvent(new Event("scroll")));
      await expect(frame).toBeHidden();
    }
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.getByTitle("Настройки", { exact: true }).click();
    const panel = page.locator(".v2-float", { has: page.getByRole("heading", { name: "Вид поля", exact: true }) });
    await expect(panel).toBeVisible();
    await panel.evaluate(el => { (el as HTMLElement).style.left = "700px"; });
    const last = day.locator('[data-slot][data-variant="regular"][data-limit="50"][data-half="23"]').first();
    await last.hover();
    await expect(frame).toBeVisible();
    const rect = (await frame.boundingBox())!;
    const abovePanel = await panel.evaluate((el, rect) => {
      const old = el.getAttribute("style")!;
      Object.assign((el as HTMLElement).style, { left: `${rect.x}px`, top: `${rect.y}px` });
      const hint = document.querySelector<HTMLElement>(".v2-opt-frame")!;
      hint.style.pointerEvents = "auto";
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const above = hint === hit || hint.contains(hit);
      hint.style.removeProperty("pointer-events");
      el.setAttribute("style", old);
      return above;
    }, rect);
    expect(abovePanel).toBe(true);
    await panel.getByRole("button", { name: "close", exact: true }).click();
    await page.getByRole("button", { name: "you", exact: true }).click();
    await page.getByRole("button", { name: "Кабинет" }).click();
    await expect(page.locator(".v2-opt-frame-host")).toHaveCount(0);
  });
}
