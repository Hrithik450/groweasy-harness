/**
 * Tokenizes a command string into arguments, respecting single and double quotes.
 */
export function parseCommandArgs(cmd: string): string[] {
  const matches = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  return matches.map((m) => m.replace(/^["']|["']$/g, ""));
}
