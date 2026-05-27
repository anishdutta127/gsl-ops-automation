import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

describe('/mous/[mouId]/pi page', () => {
  it('redirects to /mous/[mouId]/installments', async () => {
    const { default: Page } = await import('./page')
    await expect(
      Page({ params: Promise.resolve({ mouId: 'MOU-X' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/mous/MOU-X/installments')
  })
})
