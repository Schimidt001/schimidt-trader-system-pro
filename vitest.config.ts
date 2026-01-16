import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json'],
      include: [
        'server/backtest/runners/**/*.ts',
        'server/backtest/utils/**/*.ts',
        'server/backtest/validation/**/*.ts',
        'server/backtest/multi-asset/**/*.ts',
        'server/backtest/persistence/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/*.types.ts',
      ],
    },
  },
});
