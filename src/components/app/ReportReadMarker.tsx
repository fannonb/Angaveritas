'use client'

import { useEffect } from 'react'
import { recordReportViewAction } from '@/app/portal/actions'

/** Runs after the authorised report actually mounts, including client navigation. */
export default function ReportReadMarker({ reportId }: { reportId: string }) {
  useEffect(() => { void recordReportViewAction(reportId).catch(() => { /* Keep the reminder if the view could not be recorded. */ }) }, [reportId])
  return null
}
