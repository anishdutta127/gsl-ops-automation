#!/usr/bin/env node
/*
 * audit-routes.mjs (hotfix-mou-new Step 3).
 *
 * Static structural route audit. Enumerates every internal link
 * declared in `src/` (href, router.push, redirect) and every Next.js
 * App Router route declared under `src/app/`, then reports the
 * coverage matrix.
 *
 * Output: docs/hotfix-mou-new/ROUTE_AUDIT.md plus a stderr summary.
 * Exit code: 0 if no broken (❌) links, 1 otherwise. Intended to be
 * wired into npm scripts or pre-deploy verification.
 *
 * Scope: STATIC checks only. The script CANNOT detect:
 *   - Pages that call notFound() conditionally (the /mous/new gate
 *     mismatch is invisible to a static check)
 *   - Dynamic-segment resolution failures (e.g. /mous/[mouId] with a
 *     real id that does not exist in the data)
 *   - Auth-redirect chains
 * Those are runtime concerns. The audit's job is structural: every
 * advertised path corresponds to a real route file.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SRC_APP = join(REPO_ROOT, 'src', 'app')
const SRC_ROOT = join(REPO_ROOT, 'src')
const OUT_PATH = join(REPO_ROOT, 'docs', 'hotfix-mou-new', 'ROUTE_AUDIT.md')

// ---------------------------------------------------------------------------
// 1. Enumerate Next.js routes (page.tsx files under src/app/)
// ---------------------------------------------------------------------------

async function walkDir(dir, predicate, acc = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      await walkDir(full, predicate, acc)
    } else if (entry.isFile() && predicate(entry.name, full)) {
      acc.push(full)
    }
  }
  return acc
}

function routePathFromFile(file, leafRegex) {
  // src/app/foo/[id]/page.tsx     -> /foo/[id]
  // src/app/page.tsx              -> /
  // src/app/(group)/foo/page.tsx  -> /foo (route groups stripped)
  // src/app/api/foo/route.ts      -> /api/foo
  const rel = relative(SRC_APP, file).split(sep).join('/')
  const withoutFile = rel.replace(leafRegex, '')
  if (withoutFile === '' || withoutFile === '/') return '/'
  const trimmed = withoutFile.replace(/^\/+|\/+$/g, '')
  const segments = trimmed.split('/').filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  return '/' + segments.join('/')
}

async function enumerateRoutes() {
  const pageFiles = await walkDir(
    SRC_APP,
    (name) => name === 'page.tsx' || name === 'page.ts' || name === 'page.jsx' || name === 'page.js',
  )
  const apiFiles = await walkDir(
    SRC_APP,
    (name) => name === 'route.ts' || name === 'route.tsx' || name === 'route.js' || name === 'route.mjs',
  )
  const routes = []
  const pageRe = /\/?page\.(tsx|ts|jsx|js)$/
  const apiRe = /\/?route\.(ts|tsx|js|mjs)$/
  for (const file of pageFiles) {
    routes.push({
      path: routePathFromFile(file, pageRe),
      file: relative(REPO_ROOT, file).split(sep).join('/'),
      kind: 'page',
    })
  }
  for (const file of apiFiles) {
    routes.push({
      path: routePathFromFile(file, apiRe),
      file: relative(REPO_ROOT, file).split(sep).join('/'),
      kind: 'api',
    })
  }
  return routes
}

// ---------------------------------------------------------------------------
// 2. Enumerate internal links in source
// ---------------------------------------------------------------------------

// Matchers for things that look like internal-link declarations.
// Each captures the path text in group 1.
const LINK_PATTERNS = [
  // <Link href="/foo"> or <a href="/foo">
  { name: 'href-string', regex: /\bhref\s*=\s*"([^"]+)"/g },
  { name: 'href-single', regex: /\bhref\s*=\s*'([^']+)'/g },
  // href={`/foo/${x}`} -- template
  { name: 'href-template', regex: /\bhref\s*=\s*\{\s*`([^`]+)`\s*\}/g },
  // href={'/foo'} -- braced literal
  { name: 'href-brace-string', regex: /\bhref\s*=\s*\{\s*"([^"]+)"\s*\}/g },
  { name: 'href-brace-single', regex: /\bhref\s*=\s*\{\s*'([^']+)'\s*\}/g },
  // router.push('/foo'), router.replace('/foo'), router.prefetch('/foo')
  { name: 'router-push', regex: /\brouter\.(?:push|replace|prefetch)\(\s*"([^"]+)"/g },
  { name: 'router-push-single', regex: /\brouter\.(?:push|replace|prefetch)\(\s*'([^']+)'/g },
  { name: 'router-push-template', regex: /\brouter\.(?:push|replace|prefetch)\(\s*`([^`]+)`/g },
  // redirect('/foo') from next/navigation
  { name: 'redirect', regex: /\bredirect\(\s*"([^"]+)"/g },
  { name: 'redirect-single', regex: /\bredirect\(\s*'([^']+)'/g },
  { name: 'redirect-template', regex: /\bredirect\(\s*`([^`]+)`/g },
]

function isInternalCandidate(rawPath) {
  // Internal links start with '/' and the second char is not '/' (protocol-relative URLs).
  if (typeof rawPath !== 'string') return false
  if (!rawPath.startsWith('/')) return false
  if (rawPath.startsWith('//')) return false
  // Reject obvious non-route hrefs (anchors, mailto, etc. won't match anyway)
  return true
}

function normalisePath(rawPath) {
  // Drop query string and hash, then normalise template substitutions:
  //   - `/foo/${id}`         -> `/foo/[param]`   (whole-segment substitution)
  //   - `/foo/${id}/bar`     -> `/foo/[param]/bar`
  //   - `/schools${query}`   -> `/schools`       (in-segment substitution; the
  //                                                substitution most likely begins
  //                                                a query string or hash that
  //                                                we cannot resolve statically)
  let p = rawPath.split('#')[0].split('?')[0]
  const MARK = 'PARAM'
  p = p.replace(/\$\{[^}]*\}/g, MARK)
  // Walk segment by segment. For each segment, if it contains the marker
  // adjacent to literal text, drop the marker (treat as a non-path inline
  // substitution). If the segment is exactly the marker, replace with [param].
  const segs = p.split('/')
  const out = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s === MARK) {
      out.push('[param]')
    } else if (s.includes(MARK)) {
      // Inline substitution inside a segment with literal text. Trim the
      // segment to before the marker and stop processing further segments
      // (the substitution likely opened a query / hash / inline path tail
      // we cannot resolve statically).
      out.push(s.split(MARK)[0])
      break
    } else {
      out.push(s)
    }
  }
  let result = out.join('/')
  result = result.replace(/\/+/g, '/')
  if (result.length > 1 && result.endsWith('/')) result = result.slice(0, -1)
  return result
}

async function enumerateLinks() {
  const files = await walkDir(SRC_ROOT, (name) => {
    if (!/\.(tsx?|jsx?|mjs)$/.test(name)) return false
    if (/\.test\.(tsx?|jsx?)$/.test(name)) return false
    if (/\.spec\.(tsx?|jsx?)$/.test(name)) return false
    return true
  })
  const links = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    for (const pat of LINK_PATTERNS) {
      pat.regex.lastIndex = 0
      let m
      while ((m = pat.regex.exec(text)) !== null) {
        const raw = m[1]
        if (!isInternalCandidate(raw)) continue
        const normalised = normalisePath(raw)
        const line = text.slice(0, m.index).split('\n').length
        links.push({
          raw,
          normalised,
          file: relative(REPO_ROOT, file).split(sep).join('/'),
          line,
          via: pat.name,
        })
      }
    }
  }
  return links
}

// ---------------------------------------------------------------------------
// 3. Match links to routes
// ---------------------------------------------------------------------------

function pathSegments(p) {
  if (p === '/') return []
  return p.replace(/^\//, '').split('/')
}

function routeMatchesPath(routePath, linkPath) {
  const rSegs = pathSegments(routePath)
  const lSegs = pathSegments(linkPath)
  // Catch-all routes (e.g. [...slug]) match >= 1 trailing segments
  // We treat [...slug] as matching anything from that segment onward.
  for (let i = 0; i < rSegs.length; i++) {
    const r = rSegs[i]
    const l = lSegs[i]
    if (r.startsWith('[...') && r.endsWith(']')) {
      // catch-all: matches remaining segments (at least 1)
      return lSegs.length >= i + 1
    }
    if (r.startsWith('[[...') && r.endsWith(']]')) {
      // optional catch-all: matches >= 0
      return true
    }
    if (l === undefined) return false
    if (r.startsWith('[') && r.endsWith(']')) continue
    if (r !== l) return false
  }
  return lSegs.length === rSegs.length
}

function findRouteForLink(linkPath, routes) {
  // Prefer exact (non-dynamic) match if available
  let bestExact = null
  let bestDynamic = null
  for (const r of routes) {
    if (!routeMatchesPath(r.path, linkPath)) continue
    if (r.path.includes('[')) {
      if (!bestDynamic) bestDynamic = r
    } else {
      if (!bestExact) bestExact = r
    }
  }
  if (bestExact || bestDynamic) return { route: bestExact ?? bestDynamic, dynamicFallback: false }
  // Fallback: if the link contains [param] (template substitution), check
  // whether any route shares the prefix up to the [param] segment. The
  // substitution might resolve to a sibling static folder at runtime
  // (e.g. /reports/${slug} where slug is one of the static report folders).
  // Such links cannot be statically verified but they are not "broken" in
  // the file-tree sense; demote to dynamic.
  if (linkPath.includes('[param]')) {
    const lSegs = pathSegments(linkPath)
    const paramIdx = lSegs.indexOf('[param]')
    if (paramIdx >= 0) {
      const prefix = lSegs.slice(0, paramIdx).join('/')
      const candidates = routes.filter((r) => {
        const segs = pathSegments(r.path)
        return segs.length >= paramIdx + 1 && segs.slice(0, paramIdx).join('/') === prefix
      })
      if (candidates.length > 0) {
        return { route: candidates[0], dynamicFallback: true }
      }
    }
  }
  return { route: null, dynamicFallback: false }
}

function hasDynamicSegments(linkPath) {
  return linkPath.includes('[param]')
}

// ---------------------------------------------------------------------------
// 4. Build report
// ---------------------------------------------------------------------------

function uniqLinkRows(links) {
  const seen = new Map()
  for (const link of links) {
    const key = link.normalised + '\0' + link.file + ':' + link.line
    if (!seen.has(key)) seen.set(key, link)
  }
  return [...seen.values()]
}

function uniqByPath(rows) {
  const seen = new Map()
  for (const row of rows) {
    if (!seen.has(row.normalised)) seen.set(row.normalised, [])
    seen.get(row.normalised).push(row)
  }
  return seen
}

async function main() {
  const routes = await enumerateRoutes()
  const rawLinks = await enumerateLinks()
  const links = uniqLinkRows(rawLinks)

  // Categorise each unique link path
  const byPath = uniqByPath(links)
  const broken = []   // ❌ linked but no route exists
  const ok = []       // ✅ linked and route exists, no dynamic segments
  const dynamic = []  // ⚠ linked + dynamic segments resolved to a dynamic route
  for (const [linkPath, occurrences] of byPath.entries()) {
    const { route, dynamicFallback } = findRouteForLink(linkPath, routes)
    const dyn = hasDynamicSegments(linkPath) || (route && route.path.includes('[')) || dynamicFallback
    if (!route) {
      broken.push({ linkPath, occurrences })
    } else if (dyn) {
      dynamic.push({ linkPath, route, occurrences })
    } else {
      ok.push({ linkPath, route, occurrences })
    }
  }

  // Orphans: routes that no link could resolve to. A link with a dynamic
  // segment (e.g. /reports/${slug}) potentially resolves to any sibling
  // route sharing the prefix, so all such siblings count as linked even if
  // findRouteForLink only returned one representative.
  const linkedRoutePaths = new Set()
  for (const row of ok) linkedRoutePaths.add(row.route.path)
  for (const linkPath of byPath.keys()) {
    if (!linkPath.includes('[param]')) continue
    const lSegs = pathSegments(linkPath)
    const paramIdx = lSegs.indexOf('[param]')
    if (paramIdx < 0) continue
    const prefix = lSegs.slice(0, paramIdx).join('/')
    const after = lSegs.slice(paramIdx + 1)
    for (const r of routes) {
      const segs = pathSegments(r.path)
      if (segs.length !== lSegs.length) continue
      if (segs.slice(0, paramIdx).join('/') !== prefix) continue
      // Match the trailing segments too (dynamic-segment routes match anything)
      let trailingMatch = true
      for (let i = 0; i < after.length; i++) {
        const ra = segs[paramIdx + 1 + i]
        const la = after[i]
        if (ra.startsWith('[') && ra.endsWith(']')) continue
        if (la === '[param]') continue
        if (ra !== la) {
          trailingMatch = false
          break
        }
      }
      if (trailingMatch) linkedRoutePaths.add(r.path)
    }
  }
  // Also credit non-dynamic matches surfaced by dynamic[] rows
  for (const row of dynamic) linkedRoutePaths.add(row.route.path)
  const orphans = routes.filter((r) => !linkedRoutePaths.has(r.path))

  // Sort
  broken.sort((a, b) => a.linkPath.localeCompare(b.linkPath))
  ok.sort((a, b) => a.linkPath.localeCompare(b.linkPath))
  dynamic.sort((a, b) => a.linkPath.localeCompare(b.linkPath))
  orphans.sort((a, b) => a.path.localeCompare(b.path))

  // Counts
  const counts = {
    routesTotal: routes.length,
    linksUniquePaths: byPath.size,
    linksTotalOccurrences: links.length,
    ok: ok.length,
    dynamic: dynamic.length,
    broken: broken.length,
    orphans: orphans.length,
  }

  // Build markdown
  const lines = []
  lines.push('# Route audit')
  lines.push('')
  lines.push(`Generated by \`scripts/audit-routes.mjs\` on ${new Date().toISOString().slice(0, 10)}.`)
  lines.push('')
  lines.push('Static structural check. The script enumerates every internal link in `src/` and every Next.js route under `src/app/`, then matches one against the other. It cannot detect runtime gates (e.g. a page that calls `notFound()` for some users); that class of bug is addressed by gating CTAs alongside their target pages, not by this audit.')
  lines.push('')
  lines.push('## Counts')
  lines.push('')
  lines.push('| Bucket | Count |')
  lines.push('|---|---|')
  lines.push(`| Routes declared (\`src/app/**/page.tsx\`) | ${counts.routesTotal} |`)
  lines.push(`| Distinct link paths found in source | ${counts.linksUniquePaths} |`)
  lines.push(`| Total link occurrences | ${counts.linksTotalOccurrences} |`)
  lines.push(`| ✅ OK (static path matches a route) | ${counts.ok} |`)
  lines.push(`| ⚠ Dynamic (link matches a dynamic route, needs runtime verification) | ${counts.dynamic} |`)
  lines.push(`| ❌ Broken (link points to no route) | ${counts.broken} |`)
  lines.push(`| ⚠ Orphan routes (route exists but nothing links to it) | ${counts.orphans} |`)
  lines.push('')

  lines.push('## ❌ Broken links')
  lines.push('')
  if (broken.length === 0) {
    lines.push('_None._')
  } else {
    lines.push('| Link path | Occurrence(s) |')
    lines.push('|---|---|')
    for (const row of broken) {
      const locs = row.occurrences.map((o) => `\`${o.file}:${o.line}\``).join('<br />')
      lines.push(`| \`${row.linkPath}\` | ${locs} |`)
    }
  }
  lines.push('')

  lines.push('## ⚠ Dynamic-segment links')
  lines.push('')
  lines.push('These resolve to a dynamic-segment route (e.g. `/mous/[mouId]`). The static check confirms the route exists; whether the runtime id resolves to a real entity is a separate runtime concern.')
  lines.push('')
  if (dynamic.length === 0) {
    lines.push('_None._')
  } else {
    lines.push('| Link path | Resolves to | Occurrence count |')
    lines.push('|---|---|---|')
    for (const row of dynamic) {
      lines.push(`| \`${row.linkPath}\` | \`${row.route.path}\` | ${row.occurrences.length} |`)
    }
  }
  lines.push('')

  lines.push('## ⚠ Orphan routes (no internal link points here)')
  lines.push('')
  lines.push('These routes exist but no `href` / `router.push` / `redirect` in `src/` references them. Page orphans are the interesting cases: a user-facing page that no CTA reaches is either reachable only by direct URL (admin-only, deep-link) or a leftover from a removed feature. API-route orphans are typically called via `fetch()` rather than navigated to, so most are expected; only worth investigating those that the codebase clearly should be calling.')
  lines.push('')

  const pageOrphans = orphans.filter((r) => r.kind === 'page')
  const apiOrphans = orphans.filter((r) => r.kind === 'api')

  lines.push(`### Page orphans (${pageOrphans.length})`)
  lines.push('')
  if (pageOrphans.length === 0) {
    lines.push('_None._')
  } else {
    lines.push('| Route path | Source file |')
    lines.push('|---|---|')
    for (const row of pageOrphans) {
      lines.push(`| \`${row.path}\` | \`${row.file}\` |`)
    }
  }
  lines.push('')

  lines.push(`### API-route orphans (${apiOrphans.length})`)
  lines.push('')
  lines.push('API routes are typically called via `fetch()` rather than navigated to via `<Link>` or `router.push`. The static audit only inspects href / router.push / redirect, so most API orphans are expected. Listed here for completeness; treat as low signal unless a specific endpoint looks unused.')
  lines.push('')
  if (apiOrphans.length === 0) {
    lines.push('_None._')
  } else {
    lines.push('<details>')
    lines.push('<summary>Expand the list</summary>')
    lines.push('')
    lines.push('| Route path | Source file |')
    lines.push('|---|---|')
    for (const row of apiOrphans) {
      lines.push(`| \`${row.path}\` | \`${row.file}\` |`)
    }
    lines.push('')
    lines.push('</details>')
  }
  lines.push('')

  lines.push('## ✅ OK links (sample)')
  lines.push('')
  lines.push(`${ok.length} static links resolved to a non-dynamic route. Full list omitted from the report; the script\'s exit code (0 vs 1) is the actionable signal.`)
  lines.push('')

  const md = lines.join('\n') + '\n'
  await mkdir(join(REPO_ROOT, 'docs', 'hotfix-mou-new'), { recursive: true })
  await writeFile(OUT_PATH, md, 'utf8')

  // stderr summary so CI logs are readable
  process.stderr.write(
    `route-audit: routes=${counts.routesTotal} links=${counts.linksUniquePaths} ` +
      `ok=${counts.ok} dynamic=${counts.dynamic} broken=${counts.broken} orphans=${counts.orphans}\n`,
  )
  process.stderr.write(`route-audit: report at ${relative(REPO_ROOT, OUT_PATH).split(sep).join('/')}\n`)

  // Exit non-zero if broken links found
  if (counts.broken > 0) {
    process.stderr.write(`route-audit: ${counts.broken} broken link(s) found:\n`)
    for (const row of broken) {
      process.stderr.write(`  ${row.linkPath}\n`)
      for (const occ of row.occurrences) {
        process.stderr.write(`    at ${occ.file}:${occ.line}\n`)
      }
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`route-audit failed: ${err.stack || err}\n`)
  process.exit(2)
})
