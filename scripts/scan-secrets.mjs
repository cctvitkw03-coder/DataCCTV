import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const ignored = new Set([
  "node_modules",
  ".git",
  ".next",
  ".vercel",
  "coverage",
]);
const patterns = [
  /sb_secret_[A-Za-z0-9_-]{15,}/,
  /ghp_[A-Za-z0-9]{25,}/,
  /github_pat_[A-Za-z0-9_]{25,}/,
  /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
];
const local = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const privateValues = local
  .split(/\r?\n/)
  .filter((l) =>
    /^(SUPABASE_SECRET_KEY|TELEGRAM_BOT_TOKEN|GOOGLE_REFRESH_TOKEN|GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)=/.test(
      l,
    ),
  )
  .map((l) => l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, ""))
  .filter((v) => v.length > 12);
let findings = 0;
function scan(folder, browser = false) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (
      ignored.has(entry.name) ||
      entry.name.startsWith(".env") ||
      entry.name === "package-lock.json"
    )
      continue;
    const p = path.join(folder, entry.name);
    if (entry.isDirectory()) scan(p, browser);
    else if (/\.(ts|tsx|js|mjs|json|sql|md|yml)$/.test(p)) {
      const content = fs.readFileSync(p, "utf8");
      if (
        patterns.some((r) => r.test(content)) ||
        privateValues.some((v) => content.includes(v))
      ) {
        findings++;
        console.error("Potential secret in " + path.relative(root, p));
      }
    }
  }
}
scan(root);
if (fs.existsSync(".next/static")) scan(path.join(root, ".next/static"), true);
if (findings) process.exitCode = 1;
else
  console.log(
    "Source and browser chunks: no configured private credential values or known secret patterns found.",
  );
