const ENTFALLT_RE = /Entf[äa]llt/i;

// Rough token estimate: 4 chars ≈ 1 token
const CHARS_PER_TOKEN = 4;
const TOKEN_LIMIT = 3000;

export function isEntfallt(content: string): boolean {
  return ENTFALLT_RE.test(content);
}

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

export function exceedsTokenLimit(content: string): boolean {
  return estimateTokens(content) > TOKEN_LIMIT;
}
