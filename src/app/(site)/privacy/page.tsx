import type { Metadata } from 'next'
import { LegalPage } from '@/components/site/LegalPage'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How AngaVeritas collects, uses and protects personal data in line with the Kenya Data Protection Act, 2019.',
}

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains how AngaVeritas (“we”, “us”) collects and uses personal data through this website and the
        AngaVeritas client portal, in line with the Kenya Data Protection Act, 2019. We are the data controller for the
        information described here.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> when you register: name, email address, phone or WhatsApp number, where you are based and your time zone. Your password is stored only as a one-way cryptographic hash.</li>
        <li><strong>Request and project details</strong> you give us: what you need checked, the site location, what you have been told, your concerns, contacts at the site, and documents you upload.</li>
        <li><strong>Engagement records</strong> we create while working for you: proposals and your acceptance of them, inspection findings, photographs, video, GPS and time data, reports and messages.</li>
        <li><strong>Enquiry details</strong> you submit through the contact form.</li>
        <li><strong>Technical data</strong> needed to run the service securely, such as a one-way hash of your IP address, your browser type and sign-in history.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use only essential cookies: one keeps you signed in, and one lets the website show a link to your dashboard.
        We do not use advertising or tracking cookies.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li>To prepare estimates and proposals, deliver the services you engage us for, and keep you updated.</li>
        <li>To keep evidence and reports accurate, traceable and tamper-evident.</li>
        <li>To keep the website and portal secure and working.</li>
      </ul>
      <p>
        We rely on your consent, which you give when you register or submit a form, on the steps needed to enter into and
        perform our contract with you, and on our legal obligations. We will not send you marketing messages unless you
        ask to receive them, and we never sell your data.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Your details are seen only by AngaVeritas staff who need them for your engagement. Field agents see only the site
        information needed for the inspections they are assigned, never your financial details. We use service providers
        for hosting, file storage, email and maps, who process data on our behalf under appropriate safeguards. Some may
        store data outside Kenya; where they do, we take steps to ensure your data remains protected as the Act requires.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep account and engagement records for the duration of our relationship and for any period required by law
        afterwards. Enquiries that do not lead to an engagement are deleted when no longer needed.
      </p>

      <h2>Your rights</h2>
      <p>Under the Data Protection Act you have the right to:</p>
      <ul>
        <li>be informed of how your data is used;</li>
        <li>access the personal data we hold about you;</li>
        <li>object to processing of your data;</li>
        <li>have inaccurate data corrected, and have false or misleading data deleted;</li>
        <li>withdraw your consent at any time.</li>
      </ul>
      <p>
        To exercise any of these rights, email <a href={`mailto:${site.email}`}>{site.email}</a>. If you are not satisfied
        with our response, you may complain to the Office of the Data Protection Commissioner (ODPC) of Kenya.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy. The date at the top shows when it last changed.</p>
    </LegalPage>
  )
}
