// Each checkout runs its own tests; sibling worktrees are separate codebases.
import { defineConfig,configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},
  test:{exclude:[...configDefaults.exclude,"**/.worktrees/**"]},
});
