import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FormCard, type FormCardField } from './FormCard'

describe('FormCard', () => {
  it('renders form posting to action with submit label', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[
          { name: 'foo', label: 'Foo', type: 'text', required: true },
        ]}
      />,
    )
    expect(html).toContain('action="/api/x"')
    expect(html).toContain('method="POST"')
    expect(html).toContain('Save')
    expect(html).toContain('name="foo"')
    expect(html).toContain('required=""')
  })

  it('renders text + textarea + select + checkbox-group + comma-list', () => {
    const fields: FormCardField[] = [
      { name: 'a', label: 'Alpha', type: 'text' },
      { name: 'b', label: 'Beta', type: 'textarea', rows: 4 },
      {
        name: 'c', label: 'Charlie', type: 'select',
        options: [
          { value: '1', label: 'One' },
          { value: '2', label: 'Two' },
        ],
      },
      {
        name: 'd', label: 'Delta', type: 'checkbox-group',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
        ],
      },
      { name: 'e', label: 'Echo', type: 'comma-list', placeholder: 'one, two' },
    ]
    const html = renderToStaticMarkup(
      <FormCard action="/api/x" submitLabel="Save" fields={fields} />,
    )
    expect(html).toContain('name="a"')
    expect(html).toContain('rows="4"')
    expect(html).toContain('value="1"')
    expect(html).toContain('value="x"')
    expect(html).toContain('placeholder="one, two"')
  })

  it('select shows placeholder option when no defaultValue', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[{
          name: 'sheet',
          label: 'Sheet',
          type: 'select',
          options: [{ value: 'East', label: 'East' }],
        }]}
      />,
    )
    expect(html).toContain('Choose sheet')
  })

  it('renders defaultValue for text and textarea', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[
          { name: 'a', label: 'Alpha', type: 'text', defaultValue: 'hello' },
          { name: 'b', label: 'Beta', type: 'textarea', defaultValue: 'world' },
        ]}
      />,
    )
    expect(html).toContain('value="hello"')
    expect(html).toContain('>world</textarea>')
  })

  it('checkbox-group pre-checks options whose value is in defaultValue array', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[{
          name: 'tags',
          label: 'Tags',
          type: 'checkbox-group',
          defaultValue: ['x', 'z'],
          options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ],
        }]}
      />,
    )
    // X and Z should be checked, Y should not
    const matches = html.match(/checked=""/g) ?? []
    expect(matches).toHaveLength(2)
  })

  it('comma-list joins defaultValue array with ", " separator', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[{
          name: 'territories',
          label: 'Territories',
          type: 'comma-list',
          defaultValue: ['Pune', 'Mumbai', 'Nashik'],
        }]}
      />,
    )
    expect(html).toContain('value="Pune, Mumbai, Nashik"')
  })

  it('renders error message in alert role', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[]}
        errorMessage="Something failed"
      />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('Something failed')
  })

  it('renders cancel link when cancelHref provided', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[]}
        cancelHref="/admin/x"
      />,
    )
    expect(html).toContain('href="/admin/x"')
    expect(html).toContain('Cancel')
  })

  it('uses CSS variables, no raw hex', () => {
    const html = renderToStaticMarkup(
      <FormCard
        action="/api/x"
        submitLabel="Save"
        fields={[{ name: 'x', label: 'X', type: 'text' }]}
      />,
    )
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3}\b/)
  })
})
