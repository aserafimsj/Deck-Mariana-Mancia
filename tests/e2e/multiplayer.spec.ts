import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/** Auditoria de acessibilidade (WCAG 2.1 A/AA) da tela atual. */
async function expectAccessible(page: Page, label: string) {
  // Espera o aviso grande de rodada sumir, para auditar a tela de verdade.
  await page.waitForTimeout(1900);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
  expect(summary, `acessibilidade em ${label}`).toEqual([]);
}

/**
 * Partida real entre 3 navegadores (cada um com a própria sessão), usando o servidor,
 * o banco e o login local de teste. Sem atalhos: tudo pela interface.
 */

async function newPlayer(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  return ctx.newPage();
}

async function createRoom(page: Page, nickname: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("link", { name: "Criar sala" }).click();
  await page.getByLabel("Seu apelido").fill(nickname);
  await page.getByRole("button", { name: "Criar sala" }).click();
  await page.waitForURL(/\/s\/[A-Z2-9]{5}$/);
  return page.url().split("/s/")[1]!;
}

async function joinByLink(page: Page, code: string, nickname: string) {
  await page.goto(`/s/${code}`);
  await expect(page.getByText("TE CHAMARAM PRA FARRA!")).toBeVisible();
  await page.getByLabel("Seu apelido").fill(nickname);
  await page.getByRole("button", { name: "Entrar na sala" }).click();
  await expect(page.getByRole("heading", { name: /Jogadores/ })).toBeVisible();
}

test.describe("multijogador", () => {
  test.describe.configure({ timeout: 90_000 });

  test("três pessoas jogam uma rodada completa", async ({ browser }) => {
    const [ana, beto, cris] = await Promise.all([newPlayer(browser), newPlayer(browser), newPlayer(browser)]);

    const code = await createRoom(ana, "Ana");
    await expect(ana.getByText(code).first()).toBeVisible();
    await expect(ana.getByRole("button", { name: "Faltam 2" })).toBeDisabled();

    await joinByLink(beto, code, "Beto");
    await joinByLink(cris, code, "Cris");

    // A lista atualiza nos três aparelhos.
    for (const p of [ana, beto, cris]) {
      await expect(p.getByRole("list", { name: "Jogadores" }).getByRole("listitem")).toHaveCount(3);
    }
    await expect(beto.getByText("Esperando Ana começar a farra...")).toBeVisible();
    await expectAccessible(ana, "sala de espera");

    await ana.getByRole("button", { name: "Começar a farra" }).click();

    // Cada um descobre se é juiz ou jogador.
    const pages = { Ana: ana, Beto: beto, Cris: cris };
    await expect(ana.getByText(/RODADA 1 ·/)).toBeVisible();
    const judgeName = (await ana.getByText(/^Juiz: /).textContent())!.replace("Juiz: ", "").trim();
    const judge = pages[judgeName as keyof typeof pages];
    const players = Object.entries(pages).filter(([n]) => n !== judgeName).map(([, p]) => p);

    await expect(judge.getByText("VOCÊ É O JUIZ. SEJA JUSTO. OU NÃO.")).toBeVisible();
    await expect(ana.getByText(/^RODADA 1$/)).toBeVisible(); // aviso grande de rodada nova
    await expectAccessible(players[0]!, "mão de cartas");

    for (const p of players) {
      const hand = p.getByRole("region", { name: "Sua mão" }).locator("button[aria-pressed]");
      await expect(hand).toHaveCount(7);
      // A pergunta pode pedir 1 ou 2 cartas ("ESCOLHA 2").
      const pickTwo = (await p.getByRole("region", { name: "Sua mão" }).getByRole("heading").textContent())!.includes("escolha 2");
      await expect(p.getByRole("button", { name: pickTwo ? "Escolha 2 cartas" : "Escolha uma carta" })).toBeDisabled();
      await hand.first().click();
      if (pickTwo) await hand.nth(1).click();
      await p.getByRole("button", { name: "Mandar essa" }).click();
      // Quem responde por último já cai direto no julgamento.
      await expect(p.getByText(/ENVIADA\. AGORA É REZAR\.|está revelando as respostas/)).toBeVisible();
    }

    // Julgamento: o juiz revela as duas respostas e escolhe.
    await expect(judge.getByText("Toque na carta em destaque para revelar", { exact: false })).toBeVisible();
    await expect(players[0]!.getByText(`${judgeName} está revelando as respostas.`)).toBeVisible();
    await expectAccessible(judge, "julgamento");
    // Revela uma por uma: só a próxima da fila pode ser tocada.
    for (let left = 2; left > 0; left--) {
      await judge.getByRole("button", { name: /toque para revelar/ }).click();
      await expect(judge.getByRole("button", { name: /escondida/ })).toHaveCount(left - 1);
    }
    await expect(judge.getByRole("button", { name: /escondida/ })).toHaveCount(0);
    await expect(judge.getByRole("button", { name: "Escolha a melhor" })).toBeDisabled();
    await judge.locator("button[aria-pressed]").first().click();
    await judge.getByRole("button", { name: "Essa é a melhor" }).click();

    // Resultado aparece para todos, com 1 ponto no placar.
    for (const p of [ana, beto, cris]) {
      await expect(p.getByText("VENCEU!", { exact: true })).toBeVisible();
      const scores = await p.getByRole("list", { name: "Placar" }).getByText(/de 7 pontos/).allTextContents();
      expect(scores.map((t) => parseInt(t, 10)).reduce((a, b) => a + b, 0)).toBe(1);
    }

    await expectAccessible(ana, "resultado da rodada");

    // O anfitrião avança; o juiz muda.
    await ana.getByRole("button", { name: "Próxima rodada" }).click();
    await expect(ana.getByText(/RODADA 2 ·/)).toBeVisible();
    await expect(ana.getByText(`Juiz: ${judgeName}`)).toHaveCount(0);
  });

  test("código errado mostra mensagem clara", async ({ browser }) => {
    const page = await newPlayer(browser);
    await page.goto("/entrar");
    await page.getByLabel("Seu apelido").fill("Duda");
    await page.getByLabel("Código da sala").fill("zzzzz");
    await expect(page.getByLabel("Código da sala")).toHaveValue("ZZZZZ");
    await page.getByRole("button", { name: "Entrar na sala" }).click();
    await expect(page.getByText("Essa sala não existe ou a festa já acabou.")).toBeVisible();
  });

  test("sair e voltar pelo link mantém o lugar", async ({ browser }) => {
    const ana = await newPlayer(browser);
    const beto = await newPlayer(browser);
    const code = await createRoom(ana, "Ana");
    await joinByLink(beto, code, "Beto");
    await beto.reload();
    await expect(beto.getByRole("list", { name: "Jogadores" }).getByRole("listitem")).toHaveCount(2);
    await expect(beto.getByText("TE CHAMARAM PRA FARRA!")).toHaveCount(0);
  });

  test("anfitrião remove alguém e a pessoa é avisada", async ({ browser }) => {
    const ana = await newPlayer(browser);
    const beto = await newPlayer(browser);
    const code = await createRoom(ana, "Ana");
    await joinByLink(beto, code, "Beto");
    await ana.getByRole("button", { name: "Remover Beto" }).click();
    await ana.getByRole("dialog").getByRole("button", { name: "Remover" }).click();
    await expect(beto.getByText("VOCÊ SAIU DA FARRA")).toBeVisible();
  });

  test("páginas de erro e offline", async ({ page }) => {
    await page.goto("/pagina-que-nao-existe");
    await expect(page.getByText("ESSA PÁGINA NÃO EXISTE")).toBeVisible();
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "SEM INTERNET" })).toBeVisible();
    const sw = await page.request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["cache-control"]).toContain("no-store");
  });
});

