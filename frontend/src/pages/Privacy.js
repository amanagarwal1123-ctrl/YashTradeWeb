import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";
import { PublicFooter } from "@/components/public/PublicFooter";
import { api } from "@/lib/api";

const FALLBACK = {
  name: "Yash Ornaments",
  legal_entity: "Yash Silver House Pvt. Ltd.",
  app_name: "Yash Trade App",
  address: "Yash Wali Building, 1159/1114, Kucha Mahajani, Chandni Chowk, New Delhi, Delhi 110006, India",
  support_email: "info@yashornaments.in",
  support_phone: "+91 97118 81372, +91 99998 13334",
  privacy_updated: "2026-09-09",
  deletion_sla_days: 30,
};

const SECTIONS = [
  ["who", "1. Who we are and what this policy covers"],
  ["glance", "2. Summary at a glance"],
  ["collect", "3. Information we collect"],
  ["permissions", "4. Device permissions we use (and do not use)"],
  ["use", "5. How we use your information"],
  ["legal", "6. Consent and legal basis"],
  ["share", "7. Who we share information with"],
  ["security", "8. How we protect your information"],
  ["retention", "9. How long we keep information"],
  ["rights", "10. Your rights and choices"],
  ["delete", "11. Deleting your account and data"],
  ["children", "12. Children"],
  ["transfers", "13. Where your data is stored"],
  ["links", "14. Third-party links and services"],
  ["changes", "15. Changes to this policy"],
  ["contact", "16. Contact us / Grievance Officer"],
];

const H2 = ({ id, children }) => (
  <h2 id={id} className="font-heading text-xl font-semibold text-[#0B1F3B] pt-6 scroll-mt-24">{children}</h2>
);
const P = ({ children }) => <p className="text-sm leading-relaxed text-slate-700">{children}</p>;
const UL = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const Table = ({ head, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200">
    <table className="w-full text-sm">
      <thead className="bg-[#FBF7F0] text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 align-top">
            {r.map((c, j) => <td key={j} className="px-3 py-2 text-slate-700">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function Privacy() {
  const [co, setCo] = useState(FALLBACK);
  useEffect(() => {
    api.get("/public/config").then((r) => setCo({ ...FALLBACK, ...(r.data?.company || {}) })).catch(() => {});
  }, []);
  const fmtDate = (iso) => {
    try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); } catch { return iso; }
  };
  const APP = co.app_name;
  const CO = co.name;

  return (
    <div className="min-h-screen flex flex-col bg-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 py-10 flex-1">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3B] mb-6" data-testid="privacy-back-link">
          <ArrowLeft className="h-4 w-4" /> Back to enrollment
        </Link>
        <img src="/brand/yash-logo-hd.png" alt={CO} className="brand-logo h-16 w-auto mb-6" />
        <h1 className="font-heading text-3xl sm:text-4xl font-bold text-[#0B1F3B] mb-2" data-testid="privacy-heading">Privacy Policy</h1>
        <p className="text-sm text-slate-600 mb-1">
          <strong>{CO}</strong> · {co.legal_entity} · applies to the <strong>{APP}</strong> (Android &amp; iOS) and the {CO} customer enrollment website
        </p>
        <p className="text-xs text-slate-500 mb-6" data-testid="privacy-effective-date">Last updated and effective: {fmtDate(co.privacy_updated)}</p>

        <div className="rounded-xl border border-[#C8A96A]/30 bg-white p-6 sm:p-8 space-y-4">
          <nav aria-label="Contents" className="rounded-lg bg-[#FBF7F0] border border-[#C8A96A]/30 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Contents</p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {SECTIONS.map(([id, label]) => (
                <li key={id}><a href={`#${id}`} className="text-[#0B1F3B] hover:underline underline-offset-2">{label}</a></li>
              ))}
            </ol>
          </nav>

          <H2 id="who">1. Who we are and what this policy covers</H2>
          <P>
            This Privacy Policy is published by <strong>{co.legal_entity}</strong>, trading as <strong>{CO}</strong> ("we", "us", "our"),
            a wholesale jewellery business located at {co.address}. It explains how we collect, use, store, share and delete personal
            information when you use:
          </P>
          <UL items={[
            <><strong>{APP}</strong> – our mobile application for jewellery trade customers, published on Google Play and the Apple App Store by {CO};</>,
            <>the <strong>{CO} customer enrollment website</strong> (this website), where trade customers register for the {CO} Scheme and verify their mobile number;</>,
            <>related services such as OTP messages, customer support, telecalling and reward programmes ("Services").</>,
          ]} />
          <P>
            {APP} is a business-to-business (B2B) application intended for jewellers, retailers and trade partners of {CO}. It is not
            intended for consumers under 18 years of age. By creating an account or enrolling, you confirm that you have read this policy.
          </P>

          <H2 id="glance">2. Summary at a glance</H2>
          <Table
            head={["Question", "Short answer"]}
            rows={[
              ["What do we collect?", "Your name, mobile number, shop/business name, location/city and business preferences; the enquiries, orders, cart and wishlist you create; your messages to us; and basic device and usage information."],
              ["Why?", "To create and secure your account (OTP login), show you catalogues, rates and schemes, process enquiries and orders, run the rewards programme, provide support, and improve the app."],
              ["Do we sell your data?", "No. We never sell personal data and we do not show third-party advertising."],
              ["Who else sees it?", "Only service providers that help us run the Services (SMS delivery, cloud hosting, AI assistant) under contract, our own staff, and authorities when legally required."],
              ["How long?", `While your account is active. You can delete your account at any time; deletion is completed within ${co.deletion_sla_days} days, except records we must keep by law.`],
              ["How do I delete my account?", <>In the {APP} (Profile → Account → Delete account) or on the web at <Link to="/delete-account" className="text-[#0B1F3B] underline underline-offset-2">Delete my account</Link>.</>],
              ["Contact", `${co.support_email} · ${co.support_phone}`],
            ]}
          />

          <H2 id="collect">3. Information we collect</H2>
          <p className="text-sm font-semibold text-[#0B1F3B]">3.1 Information you give us</p>
          <UL items={[
            <><strong>Account and enrollment details:</strong> full name, mobile number, shop or business name, location/city, customer type and product-category interests.</>,
            <><strong>Verification data:</strong> the one-time passwords (OTPs) you enter to verify your mobile number or to change it. OTPs are stored only in hashed form and expire within 10 minutes.</>,
            <><strong>Business activity:</strong> product enquiries and requests, orders you submit, items you add to your cart or wishlist, appointment or exhibition requests, and your participation in schemes and the rewards programme.</>,
            <><strong>Communications:</strong> messages you send to our support team or telecallers, feedback, and the text you type into any AI-powered assistant or suggestion feature in the app.</>,
            <><strong>Consents:</strong> your acceptance of our Terms &amp; Conditions and this Privacy Policy, and your SMS communication preferences.</>,
          ]} />
          <p className="text-sm font-semibold text-[#0B1F3B] pt-2">3.2 Information collected automatically when you use the app or website</p>
          <UL items={[
            <><strong>Device and technical data:</strong> device model, operating system version, app version, language, screen size, IP address and approximate region derived from it, time zone and time stamps.</>,
            <><strong>Usage and analytics data:</strong> screens and products you view, searches, features you use, session length and interaction events. This is used to improve the app and understand demand.</>,
            <><strong>Diagnostics:</strong> crash reports and error logs needed to keep the app working.</>,
            <><strong>Push notification token</strong> (if you allow notifications) so that we can send order and scheme updates to your device.</>,
            <><strong>Security logs:</strong> login attempts, OTP delivery status and administrative actions on your record, kept to prevent fraud and misuse.</>,
          ]} />
          <p className="text-sm font-semibold text-[#0B1F3B] pt-2">3.3 Information we create or receive about you</p>
          <UL items={[
            <>Records created by our sales executives and telecallers about your enquiries, follow-ups and preferences.</>,
            <>Reward points, scheme status and customer codes assigned to your account.</>,
            <>Delivery status of SMS messages, as reported to us by our SMS provider and telecom operators.</>,
          ]} />
          <P>
            We do <strong>not</strong> collect government identification numbers, payment-card details, precise GPS location, your contact list, call logs,
            the content of your SMS messages, or persistent hardware identifiers such as IMEI. Any payment for goods is arranged directly with {CO} outside the app.
          </P>

          <H2 id="permissions">4. Device permissions we use (and do not use)</H2>
          <Table
            head={["Permission", "Used for", "Required?"]}
            rows={[
              ["Internet / network", "Loading catalogues, rates, orders and syncing your account.", "Yes"],
              ["Notifications", "Order updates, scheme announcements and service alerts. You can switch them off in your device settings at any time.", "Optional"],
              ["Camera / Photos", "Only if you choose to attach a picture to an enquiry or use an image-based feature. Images are used solely for that feature.", "Optional, asked when needed"],
              ["SMS", "Not requested. OTP autofill, where available, is performed by your operating system and does not give us access to your messages.", "Not used"],
              ["Location (GPS)", "Not requested. The location you type during enrollment is a free-text business address.", "Not used"],
              ["Contacts, call logs, microphone", "Not requested.", "Not used"],
            ]}
          />
          <P>Wherever a permission is needed, the app asks you at the moment the feature is used and explains why. Declining a permission only disables that feature.</P>

          <H2 id="use">5. How we use your information</H2>
          <UL items={[
            <><strong>To create and secure your account</strong> – verifying your mobile number with an OTP, logging you in, and preventing unauthorised access or fraud.</>,
            <><strong>To provide the Services</strong> – showing you catalogues, rate lists, schemes, exhibitions and showroom information; processing your enquiries, orders, cart and wishlist; managing appointments.</>,
            <><strong>To run the {CO} Scheme and rewards programme</strong> – tracking eligibility, points, redemptions and benefits.</>,
            <><strong>To communicate with you</strong> – sending OTPs, order and enquiry updates, and service messages by SMS, push notification, phone call or WhatsApp; and, only with your consent, promotional messages about new collections and offers (you may opt out at any time).</>,
            <><strong>To support you</strong> – responding to your questions through our support team, sales executives and telecallers.</>,
            <><strong>To improve and personalise</strong> – understanding which products and features are popular, fixing problems, and tailoring the catalogue and suggestions shown to you.</>,
            <><strong>To keep our business records</strong> – maintaining accounts, invoices and audit trails as required by Indian tax, company and consumer-protection laws.</>,
          ]} />
          <P>We use your information only for the purposes described here and for purposes you would reasonably expect from a jewellery trade app. We do not use it for third-party advertising or profiling unrelated to the Services.</P>

          <H2 id="legal">6. Consent and legal basis</H2>
          <P>
            We process your personal data in accordance with the Digital Personal Data Protection Act, 2023 (India) and other applicable laws.
            We rely on <strong>your consent</strong> (given when you accept this policy at enrollment or first login, and when you grant a device permission),
            on the need to <strong>perform the Services you request</strong>, and on our <strong>legal obligations</strong> (for example, tax record-keeping).
            You may withdraw consent at any time by deleting your account or contacting us; withdrawal does not affect processing that already took place or records we must keep by law.
          </P>

          <H2 id="share">7. Who we share information with</H2>
          <P>We do not sell, rent or trade your personal information. We share it only as follows:</P>
          <Table
            head={["Recipient", "What is shared", "Why"]}
            rows={[
              ["SMS delivery provider (MSG91, India) and telecom operators", "Your mobile number and the content of OTP / service messages.", "To deliver OTPs and service SMS to you. Delivery reports are returned to us."],
              ["Cloud hosting and database providers", "All data described in Section 3, stored in encrypted, access-controlled systems.", "To host and run the app, website and databases securely."],
              ["AI model providers (for assistant / suggestion features)", "Only the text you type into the AI feature and the minimum context needed to answer. We do not send your mobile number for this purpose.", "To generate responses and product suggestions. Providers may not use this data to train their models under our terms."],
              ["Google Play and Apple App Store", "Standard app-store analytics such as installs and crashes, collected by the stores themselves.", "App distribution and stability reporting."],
              [`${CO} staff, sales executives and telecallers`, "Your account, enquiry, order and reward information.", "To serve your account and follow up on your requests. Staff access is role-based and audit-logged."],
              ["Legal and regulatory authorities", "Information required by a valid legal request.", "To comply with the law, protect our rights or the safety of others."],
              ["A successor business", "Business records including customer data, with notice to you.", "Only in the event of a merger, acquisition or restructuring."],
            ]}
          />
          <P>Your enrollment details entered on this website are stored in the {APP} customer database operated by {CO}, so that the same account works in the app. Both systems are operated by {co.legal_entity}.</P>

          <H2 id="security">8. How we protect your information</H2>
          <UL items={[
            <>All data is transmitted using modern encryption (HTTPS/TLS).</>,
            <>OTPs are never stored in plain text; they are hashed, expire after 10 minutes and are limited to a small number of attempts.</>,
            <>Access to customer data by our staff requires OTP-based login, is restricted by role, times out automatically and is recorded in an audit log.</>,
            <>Login attempts and OTP requests are rate-limited to prevent abuse.</>,
            <>Our systems are hosted with reputable cloud providers that maintain physical and network security controls.</>,
          ]} />
          <P>No method of transmission or storage is completely secure. If we become aware of a breach affecting your personal data, we will notify you and the authorities as required by law.</P>

          <H2 id="retention">9. How long we keep information</H2>
          <Table
            head={["Data", "Retention"]}
            rows={[
              ["Account and profile data (name, mobile, shop, location, preferences)", "While active. Canonical account access is revoked and the profile anonymized after verified deletion. External erasure requires separate acknowledgements."],
              ["One-time passwords", "Valid for 10 minutes; purpose-bound verification is performed by the canonical app service."],
              ["SMS delivery logs and provider-held records", "Provider retention and erasure require operational confirmation; website deletion does not prove provider erasure."],
              ["Enquiries, orders, cart and wishlist", `While your account is active. Orders that resulted in a sale are retained as business/tax records (see below).`],
              ["Invoices, sales and tax records", "Up to 8 years as required by Indian income-tax, GST and company law, even after account deletion, in a form restricted to accounting use."],
              ["Support conversations and staff notes", "Up to 24 months after your last interaction, or until account deletion."],
              ["Security and audit logs", "Up to 24 months. Deletion requests themselves are kept (with your number masked) as proof of compliance."],
              ["Analytics", "Aggregated or de-identified after 24 months."],
            ]}
          />

          <H2 id="rights">10. Your rights and choices</H2>
          <UL items={[
            <><strong>Access and correction:</strong> view and update your name, shop name and location in the {APP} profile, or ask us to correct them.</>,
            <><strong>Deletion:</strong> delete your account and personal data at any time (Section 11).</>,
            <><strong>Withdraw consent:</strong> you may withdraw consent for optional processing, such as promotional SMS or notifications, at any time.</>,
            <><strong>Opt out of promotional messages:</strong> reply STOP to a promotional SMS, disable notifications in your device settings, or contact us. Service messages such as OTPs and order updates will continue while your account exists.</>,
            <><strong>Nominate:</strong> under Indian law you may nominate a person to exercise these rights on your behalf in case of death or incapacity.</>,
            <><strong>Complain:</strong> raise a grievance with our Grievance Officer (Section 16). If unresolved, you may approach the Data Protection Board of India.</>,
          ]} />
          <P>We will respond to requests within 30 days. To protect your account we may ask you to verify your mobile number with an OTP before acting on a request.</P>

          <H2 id="delete">11. Deleting your account and data</H2>
          <P>You can delete your {APP} account and associated personal data in either of these ways:</P>
          <UL items={[
            <><strong>In the app:</strong> open <em>Profile → Account → Delete account</em> and confirm with the OTP sent to your mobile number.</>,
            <><strong>On the web (no app needed):</strong> visit <Link to="/delete-account" className="font-semibold text-[#0B1F3B] underline underline-offset-2" data-testid="privacy-delete-account-link">Delete my account</Link>, enter your registered mobile number and confirm with the OTP.</>,
            <><strong>By e-mail:</strong> write to {co.support_email} from your registered details with the subject "Delete my account".</>,
          ]} />
          <P><strong>What happens next:</strong></P>
          <UL items={[
            <>The canonical service revokes account access and anonymizes the local profile. Website sessions, drafts, caches and queued work are cleared before a website cleanup acknowledgement.</>,
            <>You receive a reference with external_erasure_pending status. Provider-held media and historical backups are not proven erased. The current storage adapter does not support remote deletion; a lifecycle audit does not free storage.</>,
            <>We keep only what the law requires us to keep (invoices, tax and sales records – see Section 9), plus a masked record of the deletion request itself. This retained data is not used for any other purpose.</>,
            <>Deletion tombstones prevent automatic re-enrollment and retry-based restoration. Retention exceptions and historical linkage records require restricted review; missing dates or verification evidence are not inferred.</>,
          ]} />
          <P>Deactivation is different from deletion. Provider and backup retention periods remain subject to a verified privacy review; we do not describe pending global erasure as completed.</P>

          <H2 id="children">12. Children</H2>
          <P>The {APP} and this website are intended for business users aged 18 and above. We do not knowingly collect personal data from children. If you believe a child has provided us data, contact us and we will delete it.</P>

          <H2 id="transfers">13. Where your data is stored</H2>
          <P>
            Your data is stored on secure cloud servers operated by our hosting providers, which may be located in India or in other countries.
            Wherever your data is processed, we apply the safeguards described in this policy and require our providers to protect it under contract.
          </P>

          <H2 id="links">14. Third-party links and services</H2>
          <P>
            The app and website may link to third-party sites (for example, Google Play, the App Store or WhatsApp). Those services have their own
            privacy policies, and we are not responsible for their practices. Where you use the app's AI assistant, your text is processed by our AI
            provider as described in Section 7.
          </P>

          <H2 id="changes">15. Changes to this policy</H2>
          <P>
            We may update this policy from time to time. The "Last updated" date at the top shows the current version. For significant changes we will
            notify you in the app, by SMS or on this website before the change takes effect. This policy is published at a permanent public URL so that
            you can review it at any time.
          </P>

          <H2 id="contact">16. Contact us / Grievance Officer</H2>
          <div className="rounded-lg bg-[#FBF7F0] border border-[#C8A96A]/30 p-4 text-sm text-slate-700 space-y-1" data-testid="privacy-contact-block">
            <p><strong>Data controller / developer:</strong> {co.legal_entity} (trading as {CO})</p>
            <p><strong>Grievance Officer (privacy enquiries and data requests):</strong> Privacy Desk, {CO}</p>
            <p><strong>E-mail:</strong> <a href={`mailto:${co.support_email}`} className="text-[#0B1F3B] underline underline-offset-2">{co.support_email}</a></p>
            <p><strong>Phone / WhatsApp:</strong> {co.support_phone}</p>
            <p><strong>Postal address:</strong> {co.address}</p>
            <p className="text-xs text-slate-500 pt-1">We acknowledge privacy requests within 72 hours and resolve them within 30 days.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link to="/delete-account" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#C21F2B]/40 bg-white px-4 py-2.5 text-sm font-semibold text-[#C21F2B] hover:bg-[#C21F2B]/5 transition-colors" data-testid="privacy-delete-account-button">
              <Trash2 className="h-4 w-4" /> Delete my account
            </Link>
            <Link to="/terms" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#0B1F3B] hover:bg-slate-50 transition-colors" data-testid="privacy-terms-button">
              <ShieldCheck className="h-4 w-4" /> Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
