export const PAGES: Record<string, string>;
export const ALIASES: { path: string; fn?: string; aliases: string[] }[];

type HelpOptions = { pages?: Record<string, string>; aliases?: { path: string; fn?: string; aliases: string[] }[]; tamper?: string };

export function helpFixture(t: { after(callback: () => void | Promise<void>): void }, options?: HelpOptions): Promise<string>;
export function writeHelp(root: string, options?: HelpOptions): Promise<string>;
