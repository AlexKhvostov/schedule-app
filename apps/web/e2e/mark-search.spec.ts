import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"]) {
  for (const merged of [false, true]) {
    test(`mark search stays still and desaturates every nonmatch in ${theme}, merged=${merged}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-11-04T12:00:00Z"));
      await page.addInitScript(({ theme, merged }) => {
        localStorage.setItem("v2-ui-theme", theme);
        localStorage.setItem("redparty.demo.schedule-settings.v1", JSON.stringify({ mergeAdjacentSlots: merged }));
        localStorage.setItem("redparty.demo.hour-load.v2", JSON.stringify({ "nitro:50": Array(24).fill("peach") }));
        localStorage.setItem("v2-schedule-prefs", JSON.stringify({ kinds: ["nitro", "regular"], limits: ["50", "100"] }));
      }, { theme, merged });
      await page.goto("/#schedule");
      await page.getByRole("tab", { name: /Демо/ }).click();
      await page.getByRole("button", { name: "Войти для проверки" }).click();
      const marks = page.locator(merged ? ".v2-opt .v2-opt-merged" : ".v2-opt .v2-opt-cell.is-on");
      await expect(marks.locator('xpath=self::*[@data-mark="YO"]').first()).toBeAttached();
      await expect(marks.locator('xpath=self::*[@data-mark="PL"]').first()).toBeAttached();
      expect(await marks.evaluateAll(nodes => nodes.some(node => node.classList.contains("is-past")))).toBe(true);
      expect(await marks.evaluateAll(nodes => nodes.some(node => !node.classList.contains("is-past")))).toBe(true);

      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 800 });
        const initial = await marks.evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          return [style.filter, style.opacity, style.boxShadow];
        }));
        for (const tag of ["YO", "PL"]) {
          if (width === 1280) await page.getByRole("combobox", { name: "Найти метку" }).fill(tag);
          else {
            await page.getByRole("button", { name: "Найти метку", exact: true }).click();
            await page.locator(".v2-mark-pick .v2-bar-menu").getByRole("button", { name: tag, exact: true }).click();
          }
          await expect(page.locator(".v2-opt")).toHaveAttribute("data-opt-find", tag);
          const state = await marks.evaluateAll((nodes, tag) => nodes.map(node => {
            const style = getComputedStyle(node);
            return {
              match: node.getAttribute("data-mark") === tag,
              filter: style.filter, opacity: style.opacity, shadow: style.boxShadow,
              outline: style.outlineStyle, animations: node.getAnimations().length,
            };
          }), tag);
          for (const mark of state) {
            expect(mark.animations).toBe(0);
            if (mark.match) {
              expect(mark.opacity).toBe("1");
              expect(mark.filter).not.toContain("grayscale");
              expect(mark.shadow).not.toBe("none");
              expect(mark.outline).toBe("solid");
            } else {
              expect(mark.filter).toBe("grayscale(1)");
              expect(Number(mark.opacity)).toBeGreaterThan(0.3);
              expect(Number(mark.opacity)).toBeLessThan(1);
            }
          }
        }
        if (width === 1280) await page.getByRole("combobox", { name: "Найти метку" }).fill("");
        else {
          await page.getByRole("button", { name: "Найти метку", exact: true }).click();
          await page.locator(".v2-mark-pick .v2-bar-menu").getByRole("button", { name: "все", exact: true }).click();
        }
        await expect(page.locator(".v2-opt")).not.toHaveClass(/is-find/);
        expect(await marks.evaluateAll(nodes => nodes.map(node => {
          const style = getComputedStyle(node);
          return [style.filter, style.opacity, style.boxShadow];
        }))).toEqual(initial);
      }
    });
  }
}
