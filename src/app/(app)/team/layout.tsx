import type { Metadata } from 'next'
import FeedbackWidget from '@/components/FeedbackWidget'

export const metadata: Metadata = {
  manifest: '/team-manifest.json',
  applicationName: 'Wash and Fold Team',
  appleWebApp: {
    capable: true,
    title: 'Team Portal',
    statusBarStyle: 'default',
  },
}

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FeedbackWidget source="Team Portal" />
    </>
  )
}
