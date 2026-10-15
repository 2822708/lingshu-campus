import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// 独立诊断入口：执行历史问题的观测探针，不把“复现到缺陷”表述为正确性通过。
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(process.argv[2] || join(here, '../..'));
const out = resolve(process.argv[3] || join(repo, '.numerical-audit-results'));
const { build } = createRequire(join(repo, 'package.json'))('esbuild');
await fs.mkdir(out, { recursive: true });
const executable = join(out, 'temporary-runtime');
await fs.mkdir(executable, { recursive: true });
const resolver = {
  name: 'current-repository-source',
  setup(builder) {
    builder.onResolve({ filter: /^\.\.\/versioned-project\// }, (args) =>
      builder.resolve(
        join(repo, args.path.slice('../versioned-project/'.length)),
        { kind: args.kind, resolveDir: repo }
      )
    );
  },
};
const results = [];
for (const name of ['growth', 'equipment', 'battle', 'economy']) {
  let entry;
  if (name === 'economy') {
    entry = join(executable, 'economy.probe.mjs');
    await fs.copyFile(join(here, 'economy.probe.mjs'), entry);
  } else {
    entry = join(executable, `${name}.mjs`);
    const plugins = [resolver];
    if (name === 'battle')
      plugins.push({
        name: 'isolated-hook-ref',
        setup(builder) {
          builder.onResolve({ filter: /^react$/ }, () => ({
            path: 'react',
            namespace: 'audit-ref',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'audit-ref' }, () => ({
            contents: 'export default {useRef:(value)=>({current:value})};',
            loader: 'js',
          }));
        },
      });
    await build({
      entryPoints: [join(here, `${name}.probe.mjs`)],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      define: { 'import.meta.env': '{}' },
      plugins,
      logLevel: 'warning',
    });
  }
  const run = spawnSync(process.execPath, [entry], {
    encoding: 'utf8',
    env: { ...process.env, AUDIT_REPO: repo, AUDIT_OUTPUT: out },
    maxBuffer: 8 * 1024 * 1024,
  });
  await fs.writeFile(join(out, `${name}.log`), run.stdout + run.stderr);
  if (run.error || run.status !== 0)
    throw (
      run.error ||
      new Error(`${name} diagnostic did not complete; inspect ${name}.log`)
    );
  if (name === 'equipment')
    await fs.copyFile(
      join(executable, 'equipment-items-results.json'),
      join(out, 'equipment-items-results.json')
    );
  if (name === 'economy')
    await fs.copyFile(
      join(executable, 'economy-results.json'),
      join(out, 'economy-results.json')
    );
  if (name === 'battle') {
    const start = run.stdout.indexOf('{');
    const parsed = JSON.parse(run.stdout.slice(start));
    await fs.writeFile(
      join(out, 'battle-adventure-evidence.json'),
      JSON.stringify(parsed, null, 2) + '\n'
    );
  }
  results.push({ probe: name, completed: true });
}
await fs.writeFile(
  join(out, 'execution.json'),
  JSON.stringify(
    {
      repo,
      results,
      meaning:
        'Completed observation probes, not a claim that game numbers are correct',
      network: 'disabled within probes',
      react:
        'functional-state harness; battle useRef is isolated; no browser scheduling integration',
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify({
    out,
    completed: results.map((x) => x.probe),
    meaning: '诊断已完成；详细数据包含已确认的缺陷，不表示数值健康',
  })
);
