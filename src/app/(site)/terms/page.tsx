import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/site/LegalPage'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Use and Service',
  description: 'Terms governing use of the AngaVeritas website and client portal, and the standard terms for AngaVeritas engagements.',
}

export default function Terms() {
  return (
    <LegalPage title="Terms of Use and Service">
      <p>
        These terms apply to your use of this website and the AngaVeritas client portal. Part B sets out the standard
        terms that apply when you accept a proposal from us (terms version {site.termsVersion}). A proposal may add
        specific terms; where it does, the proposal prevails.
      </p>

      <h2>A. Using the website and portal</h2>
      <h3>Information on this website</h3>
      <p>
        Content on this site is general information about our services. It is not investment, legal, financial or
        technical advice, and should not be relied on as such for any specific decision.
      </p>
      <h3>Your account</h3>
      <p>
        Keep your password private and tell us at once if you think someone else has used your account. You are
        responsible for the information you give us being accurate to the best of your knowledge.
      </p>
      <h3>Estimates</h3>
      <p>
        Prices shown by the calculator are estimates. They become binding only when stated in a proposal you accept. USD
        amounts are approximate conversions for convenience; invoices are issued in Kenya Shillings.
      </p>
      <h3>Sample report</h3>
      <p>
        Our sample report is a fictional, illustrative case study. Its site, figures, photographs and findings are not
        evidence of an actual inspection and do not describe any real client.
      </p>

      <h2>B. Standard engagement terms</h2>
      <h3>Scope</h3>
      <p>
        We carry out the work described in the accepted proposal. Work outside that scope needs a new or revised proposal.
        Our reports reflect the evidence available within the agreed scope at the time of assessment.
      </p>
      <h3>No guarantee of outcome</h3>
      <p>
        We do not guarantee investment outcomes, and we do not provide reassurance the evidence does not support. GPS
        confirmation is not a cadastral survey or title verification, and our work does not replace licensed professionals
        such as surveyors, lawyers, engineers, veterinarians or auditors where their opinion is required.
      </p>
      <h3>Your cooperation</h3>
      <p>
        You give us accurate site details and tell us of any access restrictions. Delays caused by lack of access, unsafe
        conditions or third parties may move the delivery date.
      </p>
      <h3>Fees and payment</h3>
      <p>
        Fees and payment terms are those in the accepted proposal. Fieldwork is scheduled once the payment stated in the
        proposal has been received.
      </p>
      <h3>Confidentiality</h3>
      <p>
        We keep your information and our findings confidential and share them only with you or people you authorise. You
        may request a separate non-disclosure agreement when accepting a proposal.
      </p>
      <h3>Use of reports</h3>
      <p>
        Reports are prepared for you. You may share them with your advisers, lenders and partners, but third parties may
        not rely on them without our written consent.
      </p>
      <h3>Cancellation</h3>
      <p>
        You may cancel before fieldwork starts and receive a refund of fees paid, less any costs already incurred. Once
        fieldwork has started, fees for work done are payable.
      </p>

      <h2>C. General</h2>
      <p>
        The AngaVeritas name, logo and website content belong to AngaVeritas. See our <Link href="/privacy">Privacy Policy</Link>{' '}
        for how we handle personal data. These terms are governed by the laws of Kenya. Questions:{' '}
        <a href={`mailto:${site.email}`}>{site.email}</a>.
      </p>
    </LegalPage>
  )
}
