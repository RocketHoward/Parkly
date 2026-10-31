import { spawnSync } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";

const env = { ...process.env, PARKLY_BASE_PATH: process.env.PARKLY_BASE_PATH || "/Parkly/" };
const build = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

// Static entrypoints let GitHub Pages serve direct links without rewriting the
// URL, preserving Supabase's query parameters and authentication fragments.
const routes = ["login", "signup", "forgot-password", "verify-email", "reset-password", "auth/callback", "dashboard", "explore", "campus", "profile", "privacy", "terms"];
for (const route of routes) {
  await mkdir(`dist/${route}`, { recursive: true });
  await copyFile("dist/index.html", `dist/${route}/index.html`);
}
await copyFile("dist/index.html", "dist/404.html");
await writeFile("dist/.nojekyll", "");
console.log(`GitHub Pages: ${env.PARKLY_BASE_PATH}, ${routes.length} route entrypoints.`);
