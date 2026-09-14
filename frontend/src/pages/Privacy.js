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
};
export const PRIVACY_EFFECTIVE = "2026-09-14";

const SECTIONS = [
  ["who", "1. Who we are and what this policy covers"],
  ["glance", "2. Summary at a glance"],
  ["collect", "3. Information we collect"],
  ["permissions", "4. Device permissions and SDKs"],
  ["use", "5. How we use your information"],
  ["legal", "6. Consent and legal basis"],
  ["ai", "7. AI business assistant (optional, in the app)"],
  ["staff-uploads", "8. Photos and documents uploaded by staff"],
  ["share", "9. Service providers and who else sees your data"],
  ["security", "10. How we protect your information"],
  ["website", "11. What this website itself stores"],
  ["delete", "12. Deleting your account — what is deleted, kept and not erased"],
  ["retention", "13. How long we keep information"],
  ["rights", "14. Your rights and choices"],
  ["staff", "15. Staff accounts and store review accounts"],
  ["children", "16. Children"],
  ["transfers", "17. Where your data is stored"],
  ["changes", "18. Changes to this policy"],
  ["contact", "19. Contact us / Grievance Officer"],
];

const H2 = ({ id, children }) => (
  <h2 id={id} className="font-heading text-xl font-semibold text-[#0B1F3B] pt-6 scroll-mt-24">{children}</h2>
);
const H3 = ({ children }) => <p className="text-sm font-semibold text-[#0B1F3B] pt-2">{children}</p>;
const P = ({ children, testid }) => <p className="text-sm leading-relaxed text-slate-700" data-testid={testid}>{children}</p>;
const UL = ({ items, testid }) => (
  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-700" data-testid={testid}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);
const Table = ({ head, rows, testid }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-200" data-testid={testid}>
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
/* Facts the owner has not confirmed with the hosting provider yet. Never replaced by a guessed value. */
const Pending = ({ children }) => <span className="italic text-slate-600" data-testid="privacy-pending-fact">{children}</span>;
const DeleteLink = ({ testid, children }) => <Link to="/delete-account" className="font-semibold text-[#0B1F3B] underline underline-offset-2" data-testid={testid}>{children}</Link>;

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
        <p className="text-xs text-slate-500 mb-6" data-testid="privacy-effective-date">Last updated and effective: {fmtDate(PRIVACY_EFFECTIVE)}</p>

        <div className="rounded-xl border border-[#C8A96A]/30 bg-white p-6 sm:p-8 space-y-4">
          <nav aria-label="Contents" className="rounded-lg bg-[#FBF7F0] border border-[#C8A96A]/30 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Contents</p>
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {SECTIONS.map(([id, label]) => (
                <li key={id}><a href={`#${id}`} className="text-[#0B1F3B] hover:underline underline-offset-2">{label}</a></li>
              ))}
            </ol>
          </nav>

          <div className="rounded-lg border border-[#C8A96A]/40 bg-[#FBF7F0] p-4 text-sm text-slate-700" data-testid="privacy-changes-summary">
            <p className="font-semibold text-[#0B1F3B]">What changed on {fmtDate(PRIVACY_EFFECTIVE)}</p>
            <UL items={[
              <>The AI assistant section now says plainly that whatever you type is sent as written — including any name or number you choose to type. Profile fields are not attached automatically.</>,
              <>Account deletion is described exactly as it works: the app and this website delete or anonymise their copies and the deletion is recorded as complete when this website acknowledges it; copies held by our SMS and AI providers are <strong>not</strong> erased by the request. The former blanket 30-day completion statement has been removed; the 30-day period now applies to this website's own systems only.</>,
              <>New sections on photos and documents uploaded by staff, staff accounts and store review accounts.</>,
              <>Retention periods are stated only where they are enforced by our systems; periods that depend on our hosting provider are marked as pending confirmation rather than guessed.</>,
            ]} />
          </div>

          <H2 id="who">1. Who we are and what this policy covers</H2>
          <P>
            This Privacy Policy is published by <strong>{co.legal_entity}</strong>, trading as <strong>{CO}</strong> ("we", "us", "our"),
            a wholesale jewellery business located at {co.address}. It explains how we collect, use, store, share and delete personal
            information when you use:
          </P>
          <UL items={[
            <><strong>{APP}</strong> – our mobile application for jewellery trade customers, published on Google Play and the Apple App Store by {CO};</>,
            <>the <strong>{CO} customer enrollment website</strong> (this website, register.yashsilver.com), where trade customers register, verify their mobile number and can delete their account;</>,
            <>related services such as one-time-code SMS messages, customer support, telecalling and reward programmes ("Services").</>,
          ]} />
          <P>
            {APP} is a business-to-business (B2B) application intended for jewellers, retailers and trade partners of {CO}. Accounts are created on this
            website and then used in the app. It is not intended for anyone under 18 years of age. Both systems are operated by {co.legal_entity}; the
            customer record you create here is the same record the app uses.
          </P>

          <H2 id="glance">2. Summary at a glance</H2>
          <Table
            head={["Question", "Short answer"]}
            rows={[
              ["What do we collect?", "Your name, mobile number, shop/business name and location; the enquiries, cart, wishlist and reward activity you create in the app; notes our telecallers make about your enquiries; and, only if you switch it on, the text you type into the app's AI assistant."],
              ["What do we not collect?", "No email address, payment details, precise location, contacts, SMS content, device identifiers, crash reports or behavioural analytics. The app contains no advertising, analytics or crash-reporting SDK."],
              ["Do we sell your data?", "No. We never sell personal data and we do not show third-party advertising."],
              ["Who else sees it?", "Only service providers working on our instructions — MSG91 for one-time-code SMS, the Emergent LLM gateway and Anthropic for the optional AI assistant, Emergent for hosting and file storage — plus our own staff, and authorities when legally required."],
              ["How long?", "While your account exists. Delete it at any time (Section 12). One-time codes live 10 minutes; SMS delivery diagnostics 90 days; a few consent-based or anonymous records described in Sections 11–13 are kept longer."],
              ["How do I delete my account?", <>In the {APP}: <em>Profile → Delete My Account</em>. On this website: <DeleteLink testid="privacy-glance-delete-link">Delete account</DeleteLink>. Both are confirmed with a one-time code sent to your registered number.</>],
              ["Contact", `${co.support_email} · ${co.support_phone}`],
            ]}
          />

          <H2 id="collect">3. Information we collect</H2>
          <H3>3.1 Information you give us</H3>
          <UL items={[
            <><strong>Account and enrollment details:</strong> name, mobile number, shop or business name and location/city (typed by you as free text — not derived from your device).</>,
            <><strong>Verification codes:</strong> the one-time codes you enter to sign in, verify or change your mobile number, or delete your account. Codes are stored only in hashed form and expire within 10 minutes.</>,
            <><strong>Business activity in the app:</strong> product enquiries and call-back requests with any notes and preferred time you add, cart and wishlist contents, reward points and reward history, appointment or exhibition requests.</>,
            <><strong>AI assistant messages (optional):</strong> the text of each message or quick prompt you send to the assistant, and its replies — only after you allow the assistant (Section 7).</>,
            <><strong>Consents:</strong> your acceptance of our Terms &amp; Conditions and this Privacy Policy, your AI-assistant consent version, and — on this website's deletion page only — any optional win-back or callback consent you give (Section 11).</>,
          ]} />
          <H3>3.2 Information we create about you</H3>
          <UL items={[
            <>Records created by our telecallers and sales executives about your enquiries, follow-ups and assignments.</>,
            <>Reward points, scheme status and the customer code assigned to your account.</>,
            <>A server-generated account ID (not a device identifier), carried in your sign-in token and in every record about you.</>,
            <>Delivery status of one-time-code SMS messages, as reported by our SMS provider (kept 90 days).</>,
          ]} />
          <H3>3.3 Information we do not collect</H3>
          <P>
            We do not collect email addresses, government identification numbers, payment-card details or payment history, precise GPS location, your contact list,
            call logs, the content of your SMS messages, photos or files from customers, crash logs or performance diagnostics, or hardware or advertising identifiers.
            Catalogue and customer searches are answered from our database and not stored. Payment for goods is arranged directly with {CO} outside the app.
          </P>
          <P>
            For abuse prevention, the app and this website count sign-in and one-time-code requests per network address, browser and phone number using
            <strong> keyed hashes</strong> in short time windows (app: 10 minutes; website: 10-minute windows that expire after 20 minutes). The address itself is
            not stored in readable form and is never linked to your profile.
          </P>

          <H2 id="permissions">4. Device permissions and SDKs</H2>
          <Table
            head={["Item", "Status"]}
            rows={[
              ["Internet / network", "Required — loading catalogues, rates, enquiries and syncing your account over HTTPS only."],
              ["Camera, photos, files", "No permission is requested from customers. Customers cannot upload photos or files. Authorised staff choose files with the system file picker (no storage permission) to build the catalogue — see Section 8."],
              ["Location (GPS)", "Not requested. The location you type at enrollment is free text."],
              ["SMS, contacts, call logs, microphone, notifications", "Not requested. One-time-code autofill, where offered, is performed by your operating system and does not give us access to your messages."],
              ["Analytics, advertising, crash-reporting or attribution SDKs", "None. The app embeds no such SDK and emits no behavioural analytics events."],
            ]}
            testid="privacy-permissions-table"
          />

          <H2 id="use">5. How we use your information</H2>
          <UL items={[
            <><strong>To create and secure your account</strong> – verifying your mobile number with a one-time code, signing you in, revoking sessions when you delete your account, and preventing misuse (rate limiting with keyed hashes).</>,
            <><strong>To provide the Services</strong> – showing catalogues, rate lists, schemes and showroom information; processing your enquiries, call-back requests, cart and wishlist; assigning your enquiries to a telecaller.</>,
            <><strong>To run the {CO} rewards programme</strong> – tracking points, redemptions and benefits.</>,
            <><strong>To communicate with you</strong> – sending one-time codes and service updates by SMS or phone call; and, only with your separate consent, contacting you about offers.</>,
            <><strong>To answer AI-assistant questions</strong> – only when you have allowed the assistant (Section 7).</>,
            <><strong>To understand the business</strong> – our admin dashboards aggregate enquiry, customer and reward records; anonymous deletion statistics help us understand why customers leave (Section 11).</>,
          ]} />
          <P>We use your information only for the purposes described here. We do not use it for third-party advertising or for profiling unrelated to the Services.</P>

          <H2 id="legal">6. Consent and legal basis</H2>
          <P>
            We process personal data in accordance with the Digital Personal Data Protection Act, 2023 (India) and other applicable laws. We rely on
            <strong> your consent</strong> (given when you accept this policy at enrollment, when you allow the AI assistant, and when you tick an optional
            box on this website's deletion page), on the need to <strong>perform the Services you request</strong>, and on our
            <strong> legitimate operational needs</strong> such as fraud prevention and keeping proof that a deletion request was honoured. You may withdraw
            consent at any time (Section 14); withdrawal does not affect processing that already took place.
          </P>

          <H2 id="ai">7. AI business assistant (optional, in the app)</H2>
          <div className="space-y-3" data-testid="privacy-ai-section">
            <P>
              <strong>AI business assistant (optional).</strong> The app contains an optional AI assistant for trade questions (selling tips, silver care,
              stock suggestions). It is switched off until you tap <strong>Allow and continue</strong> on the consent card shown inside the assistant.
              When you use it, the following is transferred to <strong>Anthropic PBC</strong> (Claude model, United States) through the <strong>Emergent LLM gateway</strong>
              (integrations.emergentagent.com), which relays the request to Anthropic on our behalf:
            </P>
            <UL items={[
              <>the exact text of each message you type or quick prompt you tap — <strong>including any name, phone number, address or other detail you choose to write in it</strong>;</>,
              <>the earlier messages and replies of the same conversation (up to the last ten stored), so the assistant has context;</>,
              <>our fixed instruction describing the assistant's role and your chosen reply language (English, Hindi or Punjabi);</>,
              <>our gateway credential, which identifies {CO} as the sender — not you.</>,
            ]} />
            <P>
              Your profile fields (name, phone number, shop name, city), your account ID, enquiries, orders, cart, wishlist and reward balance
              are <strong>not attached automatically</strong> to these requests, and no photo or file is ever sent — the assistant is text only. Only what
              you write yourself is transferred, so please do not type personal details into the assistant that you do not want the provider to receive.
            </P>
            <P>
              <strong>Purpose and legal basis:</strong> generating the assistant's reply, on the basis of your explicit consent (consent version shown on the card;
              if the disclosure changes you are asked again before anything further is sent).
            </P>
            <P>
              <strong>Retention:</strong> we keep the conversation in the app until you withdraw consent or delete your account; then our copy is deleted.
              The gateway and Anthropic process the request under their own terms. We have no per-user deletion request that we can send to
              them, so we do not claim that their copies are erased and we do not state a retention period for them.
            </P>
            <P testid="privacy-ai-withdrawal">
              <strong>Withdrawing AI consent and deleting your AI chat history.</strong> Open <strong>Profile → AI Data Sharing</strong> in the app and tap
              <strong> Withdraw and delete AI chat history</strong>. From that moment no further text is sent to the AI provider, and every AI message,
              reply and content report stored for your account is deleted immediately from our systems — including a reply that was still being
              generated at the time of withdrawal, which is discarded rather than saved. Every other part of the app keeps working. You can allow
              the assistant again at any time. Withdrawal does <strong>not</strong> erase copies already processed by the gateway or the AI provider.
            </P>
            <P>This website has no AI feature and never sends anything you enter here to an AI provider.</P>
          </div>

          <H2 id="staff-uploads">8. Photos and documents uploaded by staff</H2>
          <P testid="privacy-staff-uploads">
            <strong>Photos and documents uploaded by staff.</strong> Customers cannot upload photos or files in the app. Authorised {CO} staff
            (administrators, billing executives) upload product photographs, promotional banners and PDF catalogues from their device to build
            the catalogue you see — in the app, or through this website's staff console, which passes the files to the app's servers in chunks. These files are business content and are stored with our storage service provider, <strong>Emergent Managed Object
            Storage</strong>, and served to signed-in users through our servers. The provider does not offer a per-file deletion function: when a file is
            withdrawn from the catalogue we revoke access to it and mark it deleted in our records, but we cannot guarantee that the stored bytes
            are erased until the files are migrated to a storage service that supports deletion. If a catalogue document ever contains personal
            data about you, contact us and we will revoke access to it.
          </P>

          <H2 id="share">9. Service providers and who else sees your data</H2>
          <P>We do not sell, rent or trade your personal information. Transfers to the service providers below happen only on our instructions; no data is sold, and no advertising, analytics or crash-reporting SDK is embedded in the app.</P>
          <Table
            head={["Provider", "Data", "Purpose", "Location"]}
            rows={[
              ["MSG91", "phone number, one-time code, template ID", "SMS one-time codes", "India"],
              ["Emergent LLM gateway → Anthropic PBC", "AI-assistant message text, conversation context, fixed instruction, our credential", "AI assistant replies (consent-based, app only)", "United States"],
              ["Emergent Managed Object Storage", "staff-uploaded photos, banners, PDF catalogues and derived images", "Catalogue storage", <Pending>Region as stated by Emergent — pending the owner's confirmation with the provider</Pending>],
              ["Emergent (hosting)", "all server-side data, operational logs, database backups", "Hosting of the app backend and this website", <Pending>Region as stated by Emergent — pending the owner's confirmation with the provider</Pending>],
            ]}
            testid="privacy-providers-table"
          />
          <UL items={[
            <><strong>{CO} staff</strong> (administrators, telecallers, billing executives) see your account, enquiry and reward information to serve you. Access is role-based, one-time-code protected and recorded.</>,
            <><strong>Legal and regulatory authorities</strong> receive information only under a valid legal request.</>,
            <><strong>A successor business</strong> would receive business records, with notice to you, only in a merger, acquisition or restructuring.</>,
            <><strong>Google Play and the Apple App Store</strong> collect their own install statistics under their own policies; we embed no store analytics SDK.</>,
          ]} />

          <H2 id="security">10. How we protect your information</H2>
          <UL items={[
            <>All data is transmitted over HTTPS/TLS; no cleartext traffic is configured.</>,
            <>One-time codes are hashed, expire after 10 minutes and are limited to a small number of attempts; requests are rate-limited with keyed hashes.</>,
            <>Staff access requires a one-time-code sign-in, is restricted by role, times out after two hours of inactivity on this website and is recorded.</>,
            <>Deleting your account bumps a session version so that every existing sign-in token is rejected immediately.</>,
            <>Service keys between this website and the app are held only in server configuration, never in the browser.</>,
          ]} />
          <P>No method of transmission or storage is completely secure. If we become aware of a breach affecting your personal data, we will notify you and the authorities as required by law.</P>

          <H2 id="website">11. What this website itself stores</H2>
          <P>This website is a front door to the app's customer system; it holds no copy of your account. Its own records are:</P>
          <Table
            head={["Record on this website", "Content", "Kept for"]}
            rows={[
              ["Enrollment / deletion drafts", "The number you are verifying and, for enrollment, the name, shop and location you typed, until the step completes", "1 day, then deleted automatically; deleted at once when you delete your account"],
              ["Browser cookie and CSRF token", "A random browser identifier and a hashed request token (no personal data)", "1 day"],
              ["Staff sessions", "The staff member's sign-in token, held server-side behind an HttpOnly cookie", "30 days, or 2 hours of inactivity; removed at sign-out and on account deletion"],
              ["Rate-limit counters", "Keyed hashes of network address, browser and phone number", "10-minute windows, expiring after 20 minutes"],
              ["Win-back contact — only if you tick the optional offers box while deleting, or ask us for a callback first", "Name, mobile, shop and place, plus the consent time and version, kept separately from the deleted account so our team can contact you about offers or return your call", "12 months (enforced by the database), or until you withdraw — tell the caller or write to us and the details are erased immediately"],
              ["Deleted-number recognition", "A keyed one-way hash of a deleted mobile number and the deletion time, used only to flag to our team that a number registering again was deleted earlier; the number itself is not kept and cannot be recovered", "24 months (enforced by the database)"],
              ["Deletion (churn) statistics", "Month of registration and deletion, place, reason for leaving if you chose one, and whether the deletion came from the app or this website — no name, number or identifier of any kind", "Kept as anonymous statistics"],
              ["Staff import records", "Job identifiers for PDF catalogue imports that the website keeps moving on a staff member's behalf (no customer data)", "7 days"],
            ]}
            testid="privacy-website-table"
          />

          <H2 id="delete">12. Deleting your account — what is deleted, kept and not erased</H2>
          <div className="space-y-3" data-testid="privacy-deletion-section">
            <P>
              <strong>Deleting your account.</strong> In the app: <strong>Profile → Delete My Account</strong>, confirmed with a one-time code sent to your registered
              number. On this website: the <DeleteLink testid="privacy-delete-account-link">Delete account</DeleteLink> page, confirmed the same way. Store-review sample accounts follow the same steps with a
              simulated code.
            </P>
            <P>
              <strong>What happens immediately.</strong> All your sessions are signed out and your login stops working. We delete your name, phone number, shop
              name and location, your cart and wishlist, reward points and reward history, telecaller notes about you, your AI chat history and AI
              consent record, content reports, any usage records, and the one-time-code and SMS-delivery records for your number. Your enquiries are
              anonymised: the type, status, dates and assigned staff member remain as anonymous business statistics, but your name, phone number,
              shop, notes and item details are blanked. You receive a deletion reference (<code>DEL-…</code>).
            </P>
            <P>
              <strong>What we keep, and why.</strong> (1) A keyed hash of your phone number with the deletion time, so that a retried enrolment or a stale
              sign-in cannot silently recreate your account; (2) the deletion reference and its timestamps as proof that your request was honoured;
              (3) the anonymised enquiry statistics described above. None of these contain your name or phone number in readable form.
            </P>
            <P testid="privacy-deletion-website">
              <strong>This website.</strong> The app sends this website an erasure event for your account. We remove the enrolment record, drafts, cached
              profile data and sessions held here and acknowledge the event <strong>within 30 days of your request</strong> — when you delete on this website, that
              normally happens in the same minute and the page tells you so. This website's acknowledgement is the only one the app waits for; once it is recorded the deletion is
              marked <strong>complete</strong>. We acknowledge only after our own cleanup has verifiably finished, and never on behalf of any other party. The 30-day period applies to our own systems only.
              This website additionally keeps the consent-based win-back contact (only if you ticked the box or asked for a callback), the keyed deleted-number hash and the anonymous churn statistics described in Section 11.
            </P>
            <P testid="privacy-deletion-providers">
              <strong>Service providers — not erased by your request.</strong> Our SMS provider (<strong>MSG91</strong>) keeps its own delivery records of the one-time codes
              sent to your number, and, if you used the AI assistant, the AI provider and its gateway (Section 7) keep whatever they retain under their own
              terms. We have no per-user deletion request that we can send to these providers and therefore do not claim that their copies are
              erased or state a retention period for them. Operational server logs contain only the last four digits of a phone number and are kept
              for <Pending>the hosting platform's log-retention period — pending the owner's confirmation with the provider; no fixed number of days is stated until then</Pending>; database backups age out after
              <Pending> the hosting platform's backup-retention period — pending the owner's confirmation with the provider</Pending> and are not edited individually.
            </P>
            <P>
              <strong>Retention while your account is active.</strong> Profile, enquiries, cart, wishlist, rewards and AI history: for as long as your account
              exists (AI history: until you withdraw consent). One-time codes and sign-in grants: 10 minutes. SMS-delivery diagnostics for your
              number: 90 days. Rate-limiting counters: 10 minutes, keyed hash only.
            </P>
            <P>You can also write to {co.support_email} from your registered number with the subject "Delete my account"; we will ask you to confirm with a one-time code.</P>
          </div>

          <H2 id="retention">13. How long we keep information</H2>
          <Table
            head={["Data", "Retention"]}
            rows={[
              ["Profile (name, mobile, shop, location), cart, wishlist, rewards, telecaller notes", "While your account exists; deleted immediately on verified deletion."],
              ["Enquiries and call-back requests", "While your account exists; anonymised on deletion (type, status, dates and assignee remain without your details)."],
              ["AI chat history and AI consent record (app)", "Until you withdraw AI consent or delete your account — then deleted immediately."],
              ["One-time codes and sign-in grants", "10 minutes."],
              ["SMS-delivery diagnostics for your number (app)", "90 days; deleted immediately on account deletion."],
              ["Rate-limiting counters", "App: 10 minutes. Website: 10-minute windows expiring after 20 minutes. Keyed hashes only."],
              ["After deletion (app)", "Keyed hash of the phone number + deletion time; deletion reference and timestamps; anonymised enquiry statistics; the erasure event record (IDs only). Kept as the deletion record itself."],
              ["After deletion (this website)", "Win-back contact only with your consent — 12 months or until withdrawn; keyed deleted-number hash — 24 months; anonymous churn statistics — kept."],
              ["Staff-uploaded catalogue files", "Business content; access is revoked when withdrawn from the catalogue — byte erasure is not offered by the current storage provider (Section 8)."],
              ["Operational server logs (masked phone suffixes)", <Pending>Hosting platform's log-retention period — pending the owner's confirmation with the provider</Pending>],
              ["Database backups", <Pending>Hosting platform's backup-retention period — pending the owner's confirmation with the provider; backups are not edited individually</Pending>],
            ]}
            testid="privacy-retention-table"
          />

          <H2 id="rights">14. Your rights and choices</H2>
          <UL items={[
            <><strong>Access and correction:</strong> view and update your name, shop name and location in the {APP} profile, or ask us to correct them.</>,
            <><strong>Deletion:</strong> delete your account and personal data at any time (Section 12).</>,
            <><strong>Withdraw AI consent:</strong> Profile → AI Data Sharing → Withdraw and delete AI chat history (Section 7).</>,
            <><strong>Withdraw win-back or callback consent given on this website:</strong> tell the caller, or write to {co.support_email}; the details are erased immediately.</>,
            <><strong>Nominate:</strong> under Indian law you may nominate a person to exercise these rights on your behalf in case of death or incapacity.</>,
            <><strong>Complain:</strong> raise a grievance with our Grievance Officer (Section 19). If unresolved, you may approach the Data Protection Board of India.</>,
          ]} />
          <P>We respond to requests within 30 days. To protect your account we may ask you to verify your mobile number with a one-time code before acting on a request.</P>

          <H2 id="staff">15. Staff accounts and store review accounts</H2>
          <P testid="privacy-staff-accounts">
            <strong>Staff accounts.</strong> {CO} staff (administrators, telecallers, billing executives) sign in with their phone number and a
            one-time code. Their name, phone number and the actions they take in the app (assignments, notes, uploads) are kept as the business's
            staff record and are not covered by the customer self-service deletion above; a staff account is deactivated by the owner and its
            record removed on written request to {CO}.
          </P>
          <P testid="privacy-review-accounts">
            <strong>Store review accounts.</strong> App-store review teams may sign in to the app with a Reviewer ID and access key issued privately by
            {" "}{CO} (app: Login → Help → App review access). These accounts see only clearly labelled sample data; SMS and calls are
            simulated. Their records are kept in separate <code>review__</code>-prefixed collections inside the app's main database, isolated by the server
            from live customer data. No separate review database exists and this website neither stores nor authenticates reviewer accounts.
          </P>

          <H2 id="children">16. Children</H2>
          <P>The {APP} and this website are intended for business users aged 18 and above. We do not knowingly collect personal data from children. If you believe a child has provided us data, contact us and we will delete it.</P>

          <H2 id="transfers">17. Where your data is stored</H2>
          <P>
            The app backend and this website are hosted by Emergent; one-time-code SMS are sent by MSG91 from India; the optional AI assistant is answered by
            Anthropic in the United States via the Emergent LLM gateway (Section 9). <Pending>The hosting and storage regions are as stated by Emergent and are pending the owner's confirmation with the provider; they will be named here once confirmed.</Pending>
            {" "}Wherever your data is processed, we apply the safeguards described in this policy.
          </P>

          <H2 id="changes">18. Changes to this policy</H2>
          <P>
            We may update this policy from time to time. The "Last updated" date at the top and the "What changed" box show the current version. For significant changes we
            notify you in the app or on this website before the change takes effect. This policy is published at a permanent public URL so that you can review it at any time.
          </P>

          <H2 id="contact">19. Contact us / Grievance Officer</H2>
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
