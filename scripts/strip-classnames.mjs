/*
 * scripts/strip-classnames.mjs
 *
 * Strips JSX attribute values from .ts/.tsx content while preserving
 * line numbers (newlines kept; values replaced with empty placeholders).
 * Used by scripts/docs-lint.sh as the British-English preprocessor:
 * Tailwind utility classes inside className (text-center, transition-
 * colors) and CSS-in-JS property names inside style (color, backgroundColor)
 * contain words that look like American spellings but are code, not
 * user-facing English.
 *
 * Two attribute names are recognised:
 *   1. className=
 *   2. style=
 *
 * For each, three value forms are handled:
 *   a. =""    (double-quoted)
 *   b. =''    (single-quoted)
 *   c. ={...} (JSX expression: template literals, cn() calls, object
 *              literals like style={{color: '#xxx'}}, ternaries, anything
 *              brace-balanced)
 *
 * Attribute-boundary check: only matches `<attr>=` preceded by a non-
 * identifier character (whitespace, `<`, `(`, `,`, `;`, `{`, `[`), so
 * `data-className=` and `myClassName=` are left intact.
 *
 * The exported function name is stripClassNames for backward compat with
 * Fix-14 imports; functionally it is a multi-attribute stripper.
 *
 * CLI: invoke via `node scripts/strip-classnames.mjs`, reads stdin,
 * writes stripped output to stdout.
 */

import { readFileSync } from 'node:fs'

const NAME_CHAR = /[A-Za-z0-9_$-]/
const ATTRS_TO_STRIP = ['className', 'style']

export function stripClassNames(input) {
  const out = []
  let i = 0
  const n = input.length

  while (i < n) {
    const matched = matchAttrPrefix(input, i)
    if (matched) {
      const prev = i > 0 ? input[i - 1] : ''
      if (prev && NAME_CHAR.test(prev)) {
        // Part of a longer identifier (data-className, myStyle, etc.). Skip.
        out.push(input[i])
        i++
        continue
      }
      out.push(matched)
      i += matched.length

      const ch = input[i]
      if (ch === '"' || ch === "'") {
        i = skipString(input, i, ch, out)
      } else if (ch === '{') {
        i = skipExpression(input, i, out)
      }
      // If neither, malformed JSX; let the line stand.
    } else {
      out.push(input[i])
      i++
    }
  }

  return out.join('')
}

function matchAttrPrefix(input, i) {
  for (const attr of ATTRS_TO_STRIP) {
    const prefix = `${attr}=`
    if (input.startsWith(prefix, i)) return prefix
  }
  return null
}

// Advance past a quoted string starting at i (input[i] is the opening quote).
// Newlines inside the string are preserved in `out` so line numbers do not shift.
// Closing quote is also written to `out` (the quotes themselves are kept).
function skipString(input, i, quote, out) {
  out.push(quote)
  i++
  while (i < input.length && input[i] !== quote) {
    if (input[i] === '\\' && i + 1 < input.length) {
      // Skip the escape (don't write to out; the value is being stripped).
      i += 2
      continue
    }
    if (input[i] === '\n') out.push('\n')
    i++
  }
  if (i < input.length) {
    out.push(quote)
    i++
  }
  return i
}

// Advance past a JSX expression starting at i (input[i] is the opening `{`).
// Brace-counted with string-literal-awareness so `}` inside strings or
// template literals does not close the expression prematurely.
function skipExpression(input, i, out) {
  out.push('{')
  i++
  let depth = 1
  while (i < input.length && depth > 0) {
    const c = input[i]
    if (c === '{') {
      depth++
      i++
    } else if (c === '}') {
      depth--
      i++
    } else if (c === '"' || c === "'") {
      i = skipInnerString(input, i, c, out)
    } else if (c === '`') {
      i = skipTemplateLiteral(input, i, out)
    } else {
      if (c === '\n') out.push('\n')
      i++
    }
  }
  out.push('}')
  return i
}

// Skip a string inside a JSX expression (no quote-write to out; the value
// is being stripped along with surrounding expression content).
function skipInnerString(input, i, quote, out) {
  i++
  while (i < input.length && input[i] !== quote) {
    if (input[i] === '\\' && i + 1 < input.length) {
      i += 2
      continue
    }
    if (input[i] === '\n') out.push('\n')
    i++
  }
  if (i < input.length) i++
  return i
}

// Skip a template literal, including ${...} interpolations with their
// own brace-counted scope.
function skipTemplateLiteral(input, i, out) {
  i++ // past opening backtick
  while (i < input.length && input[i] !== '`') {
    if (input[i] === '\\' && i + 1 < input.length) {
      i += 2
      continue
    }
    if (input[i] === '$' && input[i + 1] === '{') {
      i += 2
      let interpDepth = 1
      while (i < input.length && interpDepth > 0) {
        if (input[i] === '{') interpDepth++
        else if (input[i] === '}') interpDepth--
        if (interpDepth > 0 && input[i] === '\n') out.push('\n')
        i++
      }
      continue
    }
    if (input[i] === '\n') out.push('\n')
    i++
  }
  if (i < input.length) i++ // past closing backtick
  return i
}

// CLI: read stdin, write stripped stdout.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('strip-classnames.mjs')
if (invokedDirectly) {
  const input = readFileSync(0, 'utf-8')
  process.stdout.write(stripClassNames(input))
}
