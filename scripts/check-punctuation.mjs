#!/usr/bin/env node
/**
 * The em dash check.
 *
 * House style does not use one. Sweeping for them has been done twice and they
 * came back both times, because a sweep fixes a file and a rule fixes a habit.
 *
 * Walks `git ls-files` rather than a source directory, and that is deliberate:
 * the character turns up in `.md`, `.yml`, `.gitignore` and story files as
 * readily as in `.ts`, and a check scoped to `src/` would have said the repo
 * was clean while three of those carried one.
 *
 * Ratcheted rather than absolute. A baseline of what exists today lets the rule
 * start failing on new ones immediately, without a mechanical rewrite of
 * hundreds of lines of somebody's prose in one commit. The count per file can
 * only go down: adding one fails, and removing one fails until the baseline
 * comes down with it, which is the same shape drift's TYPE_TIER_DEBT uses and
 * for the same reason. A ceiling alone would let the number rot.
 *
 *   node scripts/check-punctuation.mjs            check against the baseline
 *   node scripts/check-punctuation.mjs --write    record the current state
 *
 * Two forms are looked for. The literal character, and the HTML entity, which
 * survives a search for the character and renders as one.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE = join(ROOT, 'scripts', 'punctuation-baseline.json')

/** The character, and the entity that renders as it. */
/* Escaped rather than literal, so this file is not the one exception to the
   rule it enforces. U+2014 is the em dash. */
const PATTERNS = [/\u2014/g, /&mdash;/gi]

/** Anything whose bytes are not prose. A match inside a lockfile or a binary is
 *  noise, and a lockfile is not somewhere a house style applies. */
const SKIP = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|.*\.(png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|pdf|zip))$/i

function tracked() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean).filter((f) => !SKIP.test(f))
}

function count(file) {
  const path = join(ROOT, file)
  // A tracked path can be absent in a worktree mid-rebase, and a directory
  // entry appears for a submodule.
  if (!existsSync(path) || !statSync(path).isFile()) return 0
  const text = readFileSync(path, 'utf8')
  return PATTERNS.reduce((n, p) => n + (text.match(p)?.length ?? 0), 0)
}

const found = new Map()
for (const file of tracked()) {
  const n = count(file)
  if (n > 0) found.set(file, n)
}

if (process.argv.includes('--write')) {
  const sorted = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + '\n')
  const total = [...found.values()].reduce((a, b) => a + b, 0)
  console.log(`baseline written: ${found.size} files, ${total} occurrences`)
  process.exit(0)
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const problems = []

for (const [file, n] of [...found].sort()) {
  const allowed = baseline[file] ?? 0
  if (n > allowed) {
    problems.push(allowed === 0
      ? `  ${file}: ${n} em dash${n > 1 ? 'es' : ''}, and this file had none`
      : `  ${file}: ${n} em dashes, baseline allows ${allowed}`)
  }
}

/* The half that makes it a ratchet rather than a ceiling. Without it the
   baseline records a debt that has already been paid and nothing says so, which
   is how a number goes stale while every check stays green. */
for (const [file, allowed] of Object.entries(baseline).sort()) {
  const n = found.get(file) ?? 0
  if (n < allowed) {
    problems.push(`  ${file}: ${n} em dashes, baseline still allows ${allowed}. Run --write`)
  }
}

if (problems.length === 0) {
  const total = [...found.values()].reduce((a, b) => a + b, 0)
  console.log(`punctuation: ${found.size} files at the baseline, ${total} occurrences, none new`)
  process.exit(0)
}

console.error('House style does not use an em dash.\n')
console.error(problems.join('\n'))
console.error('\nUse a comma, a colon, a full stop or brackets, whichever the sentence wants.')
console.error('Run `node scripts/check-punctuation.mjs --write` once the count has come down.')
process.exit(1)
