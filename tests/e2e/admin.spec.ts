import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Painel administrativo de ponta a ponta, com o login de administrador de teste. */

async function accessible(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`),
    `acessibilidade em ${label}`,
  ).toEqual([]);
}

async function loginAsAdmin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "PAINEL DA EQUIPE" })).toBeVisible();
  await page.getByRole("button", { name: "Entrar como admin de teste" }).click();
  await expect(page.getByRole("heading", { name: "PAINEL", exact: true })).toBeVisible();
}

test.describe("painel administrativo", () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

  test("jogador comum não acessa a API do painel", async ({ request }) => {
    expect((await request.get("/api/admin/cards?kind=white")).status()).toBe(401);
    const { token } = await (await request.post("/api/dev/session")).json();
    const res = await request.get("/api/admin/cards?kind=white", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status()).toBe(403);
    const del = await request.delete("/api/admin/cards/white/00000000-0000-4000-8000-000000000000", { headers: { authorization: `Bearer ${token}` } });
    expect(del.status()).toBe(403);
  });

  test("jogador comum vê a tela de acesso restrito", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const { token } = await (await fetch("/api/dev/session", { method: "POST" })).json();
      localStorage.setItem("scragbadum:dev-session:v1", token);
    });
    await page.goto("/admin");
    await expect(page.getByText(/Área restrita/)).toBeVisible();
  });

  test("painel: números, cartas, importação, categorias, partidas e equipe", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText("Respostas ativas")).toBeVisible();
    await accessible(page, "painel");

    // Cartas: criar, buscar, arquivar
    await page.getByRole("link", { name: "Cartas" }).click();
    await expect(page.getByRole("heading", { name: "CARTAS" })).toBeVisible();
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await accessible(page, "cartas");

    const text = `Carta de teste ${Date.now()}.`;
    await page.getByRole("button", { name: "Nova resposta" }).click();
    await page.getByLabel("Texto").fill(text);
    await page.getByLabel("Nível").last().selectOption("2");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Carta criada.")).toBeVisible();

    await page.getByLabel("Buscar").fill(text);
    const row = page.locator("tbody tr", { hasText: text });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Ativa");
    await row.getByRole("button", { name: /^Arquivar/ }).click();
    await expect(row).toContainText("Arquivada");

    // Repetida: mensagem clara
    await page.getByRole("button", { name: "Nova resposta" }).click();
    await page.getByLabel("Texto").fill(text);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Já existe uma carta com esse texto.")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Importação: erro apontado por linha, depois corrigido
    await page.getByRole("button", { name: "Importar CSV" }).click();
    const stamp = Date.now();
    await page.getByLabel("Ou cole aqui").fill(`Importada A ${stamp}.;1;cotidiano\nImportada B ${stamp}.;9;`);
    await page.getByRole("button", { name: "Conferir" }).click();
    await expect(page.getByText("Linha 2: Nível precisa ser 1, 2, 3 ou 4.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar", exact: true })).toBeDisabled();
    await page.getByLabel("Ou cole aqui").fill(`Importada A ${stamp}.;1;cotidiano\nImportada B ${stamp}.;3;`);
    await page.getByRole("button", { name: "Conferir" }).click();
    await expect(page.getByText("2 linha(s) válida(s).")).toBeVisible();
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await expect(page.getByText("2 cartas importadas.")).toBeVisible();
    await page.getByLabel("Buscar").fill(`${stamp}`);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Categorias
    await page.getByRole("link", { name: "Categorias" }).click();
    const cat = `Teste ${stamp}`;
    await page.getByLabel("Nome", { exact: true }).fill(cat);
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByText(cat)).toBeVisible();
    await page.getByRole("button", { name: `Desativar ${cat}` }).click();
    await expect(page.getByRole("button", { name: `Ativar ${cat}` })).toBeVisible();
    await accessible(page, "categorias");

    // Partidas e equipe
    await page.getByRole("link", { name: "Partidas" }).click();
    await expect(page.getByRole("heading", { name: "PARTIDAS" })).toBeVisible();
    await page.getByRole("link", { name: "Equipe" }).click();
    await expect(page.getByRole("heading", { name: "EQUIPE" })).toBeVisible();
    await expect(page.getByText("(você)")).toBeVisible();
    await page.getByLabel("E-mail", { exact: true }).fill("ninguem@exemplo.com");
    await page.getByRole("button", { name: "Dar acesso" }).click();
    await expect(page.getByText(/Não há conta com esse e-mail/)).toBeVisible();
    await accessible(page, "equipe");

    // Sair
    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page.getByRole("heading", { name: "PAINEL DA EQUIPE" })).toBeVisible();
  });
});
