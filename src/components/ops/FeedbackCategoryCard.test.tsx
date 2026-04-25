import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FeedbackCategoryCard } from './FeedbackCategoryCard'

describe('FeedbackCategoryCard', () => {
  it('renders the category label as a heading', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="Training quality"
        rating={null}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('<h3')
    expect(html).toContain('Training quality')
  })

  it('renders a radiogroup of 6 radios for the rating', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="Kit condition"
        rating={null}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('role="radiogroup"')
    expect(html).toMatch(/role="radio"/)
  })

  it('renders a labelled textarea', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="Delivery timing"
        rating={null}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toMatch(/<label[^>]*>Comment for Delivery timing<\/label>/)
    expect(html).toContain('<textarea')
  })

  it('expanded textarea + tell-us-more placeholder when rating <= 2', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="Trainer rapport"
        rating={1}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('rows="3"')
    expect(html).toContain('Could you tell us more')
  })

  it('compact textarea + neutral placeholder when rating >= 3 or null', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="Trainer rapport"
        rating={4}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('rows="2"')
    expect(html).toContain('Anything specific to share?')
  })

  it('counter shows soft-limit hint when comment is empty', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="x"
        rating={null}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('500-character soft limit')
  })

  it('counter switches to "X characters left" + signal-attention colour at warn threshold', () => {
    const longComment = 'x'.repeat(460)
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="x"
        rating={3}
        comment={longComment}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('40 characters left')
    expect(html).toContain('var(--signal-attention)')
  })

  it('uses CSS variables, no raw hex', () => {
    const html = renderToStaticMarkup(
      <FeedbackCategoryCard
        label="x"
        rating={2}
        comment={null}
        onChange={() => {}}
      />,
    )
    expect(html).toContain('var(--brand-navy)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
  })
})
