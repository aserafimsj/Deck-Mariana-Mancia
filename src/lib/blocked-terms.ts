/**
 * Termos bloqueados em apelidos. Lista curta e conservadora: só o que não tem uso inocente.
 * Palavras com uso comum ou afetivo no Brasil ficam de fora de propósito, para não barrar
 * apelidos legítimos. A comparação ignora acentos, maiúsculas, separadores e leetspeak
 * (ver comparableForm em nickname.ts). Termos com menos de 5 letras só bloqueiam como palavra inteira.
 *
 * Revisar com a equipe depois dos primeiros testes com público; denúncias de apelido são Fase 2.
 */
export const BLOCKED_TERMS: readonly string[] = [
  // Apologia ao nazismo e à supremacia racial
  "hitler",
  "nazista",
  "nazismo",
  "heil",
  "siegheil",
  "whitepower",
  "kukluxklan",
  "supremaciabranca",
  // Ofensas contra pessoas LGBT+
  "viadinho",
  "boiola",
  "traveco",
  // Ofensas racistas
  "crioulo",
  // Apologia à violência sexual
  "pedofilo",
  "pedofilia",
  "estuprador",
  "estupro",
];
