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
  const testFiles = (await readdir(join(root, 'tests')))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort();
  await build({
    entryPoints: testFiles.map((name) => join(root, 'tests', name)),
    outdir: temporary,
    bundle: true,
    platform: 'node',
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    define: { 'import.meta.env': '{}' },
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
