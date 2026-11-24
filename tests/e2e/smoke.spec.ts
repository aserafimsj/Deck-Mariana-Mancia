import { expect, test } from "@playwright/test";

test.describe("fundação", () => {
  test("tela inicial mostra o logo e o menu, sem rolagem lateral", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Scragbadum!" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Jogar", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar em uma sala" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Como jogar" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("como jogar explica as regras e os 4 níveis", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Como jogar" }).click();
    await expect(page).toHaveURL(/\/como-jogar$/);
    await expect(page.getByRole("heading", { name: "Alguém vira juiz" })).toBeVisible();
    for (const lv of ["DE LEVE", "PICANTE", "PESADO", "SEM FILTRO"]) await expect(page.getByText(lv, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Voltar" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("configurações ficam salvas no aparelho", async ({ page }) => {
    await page.goto("/configuracoes");
    const sound = page.getByRole("switch", { name: "Sons" });
    await expect(sound).toHaveAttribute("aria-checked", "true");
    await sound.click();
    await expect(sound).toHaveAttribute("aria-checked", "false");

    const motion = page.getByRole("switch", { name: "Menos animação" });
    await motion.click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

    await page.getByLabel("Apelido padrão").fill("  Ana   Clara ");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("status")).toHaveText("Salvo.");

    await page.reload();
    await expect(page.getByRole("switch", { name: "Sons" })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByLabel("Apelido padrão")).toHaveValue("Ana Clara");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
  });

  test("apelido inválido mostra o motivo", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.getByLabel("Apelido padrão").fill("Admin");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("status")).toContainText("reservado");
  });

  test("health check responde e informa a configuração", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", app: "scragbadum" });
    expect(["ok", "not_configured"]).toContain(body.supabase);
    expect(body.database).toBe("ok");
  });

  test("PWA: manifesto e cabeçalhos de segurança", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: "Scragbadum!", display: "standalone", lang: "pt-BR" });
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
  });
});
