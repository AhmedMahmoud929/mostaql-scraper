import type { MostaqlProject } from "../mostaql/types.js";

const KEYWORD_ALIASES: Record<string, string[]> = {
  react: ["react", "reactjs", "react.js"],
  "next.js": ["next.js", "nextjs", "next js"],
  "node.js": ["node.js", "nodejs", "node js"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js", "جافا سكريبت"],
  tailwindcss: ["tailwindcss", "tailwind", "tailwind css"],
  frontend: ["frontend", "front-end", "front end", "واجهات"],
  backend: ["backend", "back-end", "back end"],
  "full stack": ["full stack", "fullstack", "full-stack"],
};

export interface FilterResult {
  matched: boolean;
  matchedKeywords: string[];
}

export function matchesKeywords(
  project: MostaqlProject,
  keywords: string[],
): FilterResult {
  if (keywords.length === 0) {
    return { matched: true, matchedKeywords: [] };
  }

  const haystack = buildSearchText(project);
  const matchedKeywords: string[] = [];

  for (const keyword of keywords) {
    const variants = expandKeyword(keyword);
    if (variants.some((variant) => haystack.includes(variant))) {
      matchedKeywords.push(keyword);
    }
  }

  return {
    matched: matchedKeywords.length > 0,
    matchedKeywords,
  };
}

function buildSearchText(project: MostaqlProject): string {
  return [
    project.title,
    project.description ?? "",
    project.skills.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function expandKeyword(keyword: string): string[] {
  const normalized = keyword.toLowerCase().trim();
  const aliases = KEYWORD_ALIASES[normalized];
  if (aliases) return aliases;
  return [normalized];
}
