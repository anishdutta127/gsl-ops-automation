import { describe, it, expect } from 'vitest'
import { stripClassNames } from '../../../scripts/strip-classnames.mjs'

const strip = stripClassNames as (input: string) => string

describe('stripClassNames: passthrough', () => {
  it('preserves content with no className', () => {
    const src = 'const greeting = "hello world";'
    expect(strip(src)).toBe(src)
  })

  it('preserves prose with English words outside className', () => {
    const src = '<p title="our color picker">Pick a colour.</p>'
    const out = strip(src)
    // title attribute is NOT className; preserved verbatim including the word "color".
    expect(out).toContain('color')
    expect(out).toContain('Pick a colour')
  })
})

describe('stripClassNames: form 1, double-quoted attribute', () => {
  it('strips the value and leaves an empty placeholder', () => {
    const src = '<div className="text-center transition-colors">hi</div>'
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).not.toContain('transition-colors')
    expect(out).toContain('className=""')
    expect(out).toContain('hi</div>')
  })

  it('strips single-quoted attributes too', () => {
    const src = "<div className='text-center'>hi</div>"
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).toContain("className=''")
  })
})

describe('stripClassNames: form 2, template-literal in JSX expression', () => {
  it('strips static template-literal content', () => {
    const src = '<div className={`text-center transition-colors`}>hi</div>'
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).not.toContain('transition-colors')
    expect(out).toContain('hi</div>')
  })

  it('strips template-literal with interpolation', () => {
    const src =
      '<div className={`text-center ${active ? "text-navy-600" : "text-slate-500"}`}>hi</div>'
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).not.toContain('text-navy-600')
    expect(out).not.toContain('text-slate-500')
    expect(out).toContain('hi</div>')
  })

  it('handles nested template literals and brace-balanced interpolation', () => {
    const src =
      '<div className={`a-${b}-${cn("c", d ? "e-center" : "f")}-end`}>x</div>'
    const out = strip(src)
    expect(out).not.toContain('a-')
    expect(out).not.toContain('e-center')
    expect(out).toContain('x</div>')
  })
})

describe('stripClassNames: form 3, cn() function call', () => {
  it('strips cn() arguments', () => {
    const src = '<div className={cn("text-center", "transition-colors")}>hi</div>'
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).not.toContain('transition-colors')
    expect(out).toContain('hi</div>')
  })

  it('handles cn() with conditional arguments and nested calls', () => {
    const src =
      '<div className={cn("text-center", isActive && "text-blue-500", { "text-rose-700": disabled })}>x</div>'
    const out = strip(src)
    expect(out).not.toContain('text-center')
    expect(out).not.toContain('text-blue-500')
    expect(out).not.toContain('text-rose-700')
    expect(out).toContain('x</div>')
  })
})

describe('stripClassNames: attribute boundary detection', () => {
  it('does not strip data-className', () => {
    const src = '<div data-className="text-center">hi</div>'
    const out = strip(src)
    // 'className=' is a substring of 'data-className=' but should not match
    // because the preceding char is a hyphen (a name char).
    expect(out).toContain('text-center')
    expect(out).toContain('hi</div>')
  })

  it('does not strip myClassName', () => {
    const src = '<Foo myClassName="text-center" />'
    const out = strip(src)
    expect(out).toContain('text-center')
  })

  it('strips className when preceded by whitespace, <, (, or {', () => {
    const samples = [
      '<div className="text-center">x</div>',
      '<Foo\nclassName="text-center"\n/>',
    ]
    for (const src of samples) {
      const out = strip(src)
      expect(out).not.toContain('text-center')
    }
  })
})

describe('stripClassNames: line-number stability', () => {
  it('preserves the line count when stripping multi-line className values', () => {
    const src = `import x from 'y'
<div
  className="line-3-text-center
              line-4-bg-color
              line-5-transition-colors"
  data-foo="bar"
>hi</div>`
    const out = strip(src)
    expect(out.split('\n').length).toBe(src.split('\n').length)
    // Genuine British-English content elsewhere on those lines is gone
    // along with the className value (acceptable; the lint scopes per
    // line and the value was the only English on those lines).
    expect(out).not.toContain('line-3-text-center')
  })

  it('preserves line numbers across template-literal interpolation', () => {
    const src = `<div
  className={\`text-center
    \${active
      ? "text-navy-600"
      : "text-slate-500"}
    transition-colors\`}
>x</div>`
    const out = strip(src)
    expect(out.split('\n').length).toBe(src.split('\n').length)
  })
})

describe('stripClassNames: real-world shadcn primitive shapes', () => {
  it('strips cva() string arguments without mistaking them for English', () => {
    const src = `const buttonVariants = cva(
  "inline-flex items-center justify-center text-sm font-medium",
  { variants: { variant: { default: "bg-primary text-primary-foreground" } } }
)`
    const out = strip(src)
    // cva() string literals don't have a className= prefix, so they
    // would still pass through. This test documents the limitation:
    // cva-stripping is OUT OF SCOPE for this preprocessor; the
    // src/components/ui/ directory exclusion in docs-lint.sh handles
    // it instead.
    expect(out).toContain('items-center')
  })
})
