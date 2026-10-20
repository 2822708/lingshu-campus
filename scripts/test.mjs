import { build } from 'esbuild';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 使用已安装的 Vite/esbuild 依赖，无需另装测试框架；临时产物不进入仓库。
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'xiuxian-npu-tests-'));
try {
  const available = await readdir(join(root, 'tests'));
  const requested = process.argv.slice(2);
  const testFiles = requested.length
    ? requested.map((name) => {
        if (!available.includes(name) || !name.endsWith('.mjs')) {
          throw new Error(`Unknown test file: ${name}`);
        }
        return name;
      })
    : available.filter((name) => name.endsWith('.test.mjs')).sort();
  await build({
    entryPoints: testFiles.map((name) => join(root, 'tests', name)),
    outdir: temporary,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    define: { 'import.meta.env': '{}' },
    // React 服务端渲染依赖 Node 内置模块；为 ESM 测试包保留 require 入口。
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  const result = spawnSync(
    process.execPath,
    ['--test', ...testFiles.map((name) => join(temporary, name))],
    {
      stdio: 'inherit',
    }
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
