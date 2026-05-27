import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ mouId: string }>
}

export default async function PiPage({ params }: PageProps) {
  const { mouId } = await params
  redirect(`/mous/${mouId}/installments`)
}
