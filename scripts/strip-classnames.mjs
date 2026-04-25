/*
 * scripts/strip-classnames.mjs
 *
 * Preprocessor for the British-English check in scripts/docs-lint.sh.
 * Strips selected JSX attribute values from .ts/.tsx content while
 * preserving line numbers (newlines kept; values replaced with empty
 * placeholders so error reports point at the right line).
 *
 * The function exported as stripClassNames() is now a multi-attribute
 * stripper despite the name (kept for backward compat with the Fix-14
 * import). Renaming would force a coordinated change in docs-lint.sh,
 * the CLI invocation, and the test imports.
 *
 * ============================================================================
 * What gets stripped (attribute scope)
 * ============================================================================
 *
 * Attribute name        Why it's stripped
 * --------------------  ----------------------------------------------------
 * className=            Tailwind utility classes (text-center, transition-
 *                       colors, items-center) contain words that look like
 *                       American spellings but are CSS class identifiers.
 * style=                CSS-in-JS object keys (color, backgroundColor,
 *                       textAlign) and string-form CSS values (color: red)
 *                       contain CSS property names, not English prose.
 *
 * ============================================================================
 * What value forms are handled (per attribute)
 * ============================================================================
 *
 * Value form                                    Example
 * --------------------------------------------  --------------------------
 * 1. ="..." double-quoted attribute             className="text-center"
 * 2. ='...' single-quoted attribute             className='text-center'
 * 3. ={`...`} JSX expression: static template   className={`text-center`}
 *    literal
 * 4. ={`...${x}...`} JSX expression: template   className={`p-2 ${active
 *    literal with ${...} interpolation,         ? "bg-teal" : "bg-slate"}`}
 *    nested-brace-aware
 * 5. ={cn(...)} JSX expression: function call,  className={cn("text-center",
 *    nested-string-aware                        active && "text-blue")}
 * 6. ={{ ... }} JSX expression: object literal  style={{ color: "#073393",
 *    (style attr's idiomatic form)              fontSize: "14px" }}
 * 7. ={someVar} JSX expression: identifier      className={baseClasses}
 *
 * Forms 3-7 all flow through a single brace-counted skip that respects
 * string literals, template literals (including ${...} interpolations),
 * and nested braces. The skip is in scripts/strip-classnames.mjs's
 * skipExpression() and friends.
 *
 * ============================================================================
 * What is NOT stripped (deliberate)
 * ============================================================================
 *
 *   data-className=, myClassName=        Attribute-boundary check
 *                                        (preceding char must be a non-
 *                                        identifier, not a name char).
 *   raw object literals at module scope  Only attribute= forms are stripped;
 *                                        const FOO = { color: '...' } is
 *                                        not. Use British 'colour' to
 *                                        avoid the British-English flag,
 *                                        or rename if the field name
 *                                        legitimately requires it.
 *   cva() calls outside className=       cva strings inside src/components/
 *                                        ui/ are scope-excluded at the
 *                                        docs-lint.sh level (vendored
 *                                        shadcn primitives) rather than
 *                                        parsed.
 *   Markdown rule-doc anti-examples      The British English check is
 *                                        scoped to .ts/.tsx in
 *                                        docs-lint.sh. Markdown is
 *                                        reviewer-judged.
 *   *.test.ts(x) test fixture strings    Excluded at docs-lint.sh level.
 *
 * ============================================================================
 * Extension history
 * ============================================================================
 *
 * Each extension was reactive (a new pattern broke; we added handling).
 * Pattern observation: keep this header current when adding new attribute
 * names or value forms so future contributors see the scope at a glance.
 *
 *   Item 8       Initial em-dash check; preprocessor only stripped
 *                className="..." double-quoted attributes.
 *   Fix-14       Extended to template-literal and cn() forms (JSX
 *                expressions with brace-balanced skip + string awareness).
 *                Added attribute-boundary check (NAME_CHAR regex).
 *   Item 11C     Extended to style= attribute (the same brace-balanced
 *                skip handled object-literal value forms naturally).
 *
 * ============================================================================
 * CLI
 * ============================================================================
 *
 * Invoke via `node scripts/strip-classnames.mjs`, reads stdin, writes the
 * stripped output to stdout. The same module is imported by
 * src/lib/lint/stripClassNames.test.ts as a Vitest fixture for the unit
 * tests covering each value form above.
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
