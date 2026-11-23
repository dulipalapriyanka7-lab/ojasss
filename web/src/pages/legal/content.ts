// Public policy content. Written to match how the platform actually works (see backend).
// Legal review note: have counsel review before launch and fill in the registered entity
// details in LEGAL_ENTITY (docs/PRODUCTION_CHECKLIST.md).

export const LEGAL_ENTITY = {
  brand: 'OJASSS',
  site: 'https://ojasss.com',
  support: 'support@ojasss.com',
  grievance: 'grievance@ojasss.com',
  safety: 'safety@ojasss.com',
  privacy: 'privacy@ojasss.com',
  payouts: 'payouts@ojasss.com',
};

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDoc {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}

const E = LEGAL_ENTITY;

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  about: {
    title: 'About OJASSS',
    description: 'OJASSS is an Indian short-video and poster platform for creators, businesses and citizens.',
    updated: '2026-09-18',
    sections: [
      { heading: 'What we are', paragraphs: [
        'OJASSS (from “ojas” — vitality) is a place to watch and share short vertical videos and visual posters. Creators entertain, businesses promote, job-seekers find work, and citizens raise public issues — all in one feed, on the web at ojasss.com and in the OJASSS Android app.',
        'The website and the app are two windows onto the same platform: one account, one feed, one wallet.',
      ] },
      { heading: 'HOT, SPEAK and VIRAL', paragraphs: [
        'Fires are likes. Speak opens free comments. At 10 Fires and 10 Shares a post automatically becomes Viral and appears in One Chance; no extra votes or payment are required. Optional One Chance Premium costs ₹10 for 7 days of featured placement and a purple crown after admin verifies the UPI payment.',
      ] },
      { heading: 'Our principles', bullets: [
        'Creators should share in the value they create.',
        'Rewards are calculated and reviewed on our servers — never on your device.',
        'Public complaints are the complainant’s own words; we forward them faithfully and never claim to have verified them.',
        'Zero tolerance for child sexual abuse material and exploitation.',
      ] },
      { heading: 'Contact', paragraphs: [`General: ${E.support} · Grievances: ${E.grievance} · Safety: ${E.safety}`] },
    ],
  },

  'privacy-policy': {
    title: 'Privacy Policy',
    description: 'What information OJASSS collects, why, how long we keep it and your rights.',
    updated: '2026-09-18',
    sections: [
      { heading: 'Who this applies to', paragraphs: ['This policy covers the OJASSS website (ojasss.com) and the OJASSS Android app, which share one account system and one database. It is written to comply with India’s Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and rules under it.'] },
      { heading: 'Information we collect', bullets: [
        'Account data: email address, password (stored only as a salted hash by our authentication provider), name, username, profile photo, bio, and optional public phone number and interests.',
        'Content you create: videos, posters, captions, comments, messages, complaint details and business inquiries.',
        'Optional location: with your device permission, upload detects an approximate location. You can edit or remove it before publishing; only the location you publish is stored with the post.',
        'Activity: follows, HOT/SPEAK/VIRAL reactions, bookmarks, views, shares and call-to-action clicks — used to run the feed and to calculate rewards.',
        'Payout data (only if you withdraw): UPI ID or bank account holder name, account number, IFSC and bank name.',
        'Technical data: IP address and device/browser information in server logs, used for security, rate limiting and fraud prevention.',
        'Push token (Android, optional): lets us send notifications you have enabled.',
      ] },
      { heading: 'Information we do not collect', bullets: [
        'We remove location (GPS/EXIF) metadata from posters when you upload them.',
        'We do not sell personal data. We do not use invasive device fingerprinting.',
      ] },
      { heading: 'How we use information', bullets: [
        'To provide the service: show your content, deliver messages and notifications, and personalise the feed.',
        'To pay creators: calculate rewards, process withdrawals and keep auditable financial records.',
        'To keep OJASSS safe: detect spam, fake engagement and fraud; enforce the Community Guidelines; respond to reports and lawful requests.',
        'To forward public complaints to the authority you choose, when you ask us to.',
      ] },
      { heading: 'Who can see what', bullets: [
        'Public: your profile (name, username, photo, bio, counts) and published posts and comments.',
        'Private: your email, messages (visible only to participants), earnings, payout details (shown to you masked) and saved posts.',
        'OJASSS staff: authorised administrators can access data needed for moderation, payouts and support. Every sensitive admin action is recorded in an audit log that admins cannot edit.',
      ] },
      { heading: 'Service providers', paragraphs: ['We use trusted processors to run OJASSS — cloud database, storage and authentication hosting, email delivery, and (on Android) Google Firebase Cloud Messaging for push notifications. They process data only on our instructions.'] },
      { heading: 'Retention', bullets: [
        'Account and content: until you delete them or your account.',
        'Financial records (earnings, withdrawals): retained for the period required by Indian tax and accounting law, even after account deletion, without your profile attached.',
        'Security logs and rate-limit records: kept for a short period and then discarded.',
      ] },
      { heading: 'Your rights', paragraphs: [
        'You can access and correct your profile in Settings, download or delete your content, and request deletion of your account at any time from Settings or ojasss.com/account-deletion. You may also withdraw consent for optional processing (such as push notifications) in your device settings.',
        `To exercise any right or raise a privacy concern, contact ${E.privacy}. Grievances are acknowledged within 24 hours and resolved within 15 days, as required by the IT Rules, 2021.`,
      ] },
      { heading: 'Children', paragraphs: ['OJASSS is not intended for children under 13, and users under 18 must have a parent’s or guardian’s consent. See our Child Safety Standards.'] },
      { heading: 'Changes', paragraphs: ['We will notify you in the app before material changes take effect.'] },
    ],
  },

  terms: {
    title: 'Terms of Service',
    description: 'The rules for using OJASSS on the web and in the Android app.',
    updated: '2026-09-18',
    sections: [
      { heading: 'Agreement', paragraphs: ['By creating an account or using OJASSS you agree to these Terms, the Privacy Policy, the Community Guidelines and, if you earn rewards, the Earnings Terms.'] },
      { heading: 'Eligibility and accounts', bullets: [
        'You must be at least 13 years old. If you are under 18, you need permission from a parent or guardian.',
        'One person, one account. Creating accounts to manipulate engagement or rewards is prohibited.',
        'You are responsible for keeping your credentials secure and for activity on your account.',
      ] },
      { heading: 'Your content', paragraphs: [
        'You own what you post. You grant OJASSS a worldwide, non-exclusive, royalty-free licence to host, display, distribute and promote your content on OJASSS and in OJASSS marketing, for as long as it remains on the platform.',
        'You must have the rights to everything you upload and it must follow the Community Guidelines. We may remove content or restrict accounts that break these Terms.',
      ] },
      { heading: 'Public complaints', paragraphs: ['Complaint posts are your own statements. You are solely responsible for their accuracy. OJASSS acts as an intermediary and does not verify complaints. See the Complaints Disclaimer.'] },
      { heading: 'Rewards', paragraphs: ['Rewards are discretionary, reviewed by OJASSS and governed by the Earnings Terms. Rewards obtained through fraud or artificial engagement will be reversed.'] },
      { heading: 'Prohibited conduct', bullets: [
        'Illegal content, child sexual abuse material, harassment, hate, threats or incitement.',
        'Spam, scams, impersonation, or misleading calls-to-action.',
        'Automated access, scraping, or attempts to bypass security or rate limits.',
        'Buying, selling or faking engagement, or coordinating to game rewards.',
      ] },
      { heading: 'Intermediary status and notices', paragraphs: [`OJASSS is an intermediary under the Information Technology Act, 2000. To report unlawful content or file a grievance, contact our Grievance Officer at ${E.grievance}.`] },
      { heading: 'Termination', paragraphs: ['You can delete your account at any time. We may suspend or terminate accounts that violate these Terms, with notice where appropriate.'] },
      { heading: 'Liability and governing law', paragraphs: ['OJASSS is provided “as is”. To the extent permitted by law, our liability is limited to the amounts you have received from us in the previous 12 months. These Terms are governed by the laws of India.'] },
    ],
  },

  'refund-policy': {
    title: 'Refund Policy',
    description: 'Payments, rewards and refunds on OJASSS.',
    updated: '2026-09-18',
    sections: [
      { heading: 'OJASSS is free to use', paragraphs: ['Creating an account, watching, posting and reacting on OJASSS are free. We do not currently sell paid subscriptions or in-app purchases, so there is nothing to refund for normal use.'] },
      { heading: 'Creator rewards', paragraphs: ['Rewards are credits paid by OJASSS to creators, not purchases. Once a withdrawal is marked Paid with a bank/UPI reference, it cannot be reversed by the creator. If a payout fails at the bank, the amount is returned to your available balance.'] },
      { heading: 'Business services', paragraphs: [`If you arrange a paid promotion or service with OJASSS through a business inquiry, refund terms will be set out in that written agreement. Contact ${E.support} with any payment question.`] },
    ],
  },

  'community-guidelines': {
    title: 'Community Guidelines',
    description: 'What is and isn’t allowed on OJASSS.',
    updated: '2026-09-18',
    sections: [
      { heading: 'Be real', bullets: ['Post content you made or have the right to share.', 'Don’t impersonate people, brands or authorities.', 'Don’t fake engagement: no bots, reaction-for-reaction rings or multiple accounts.'] },
      { heading: 'Be safe', bullets: [
        'Zero tolerance for child sexual abuse material or any sexualisation of minors — accounts are banned and reported to authorities.',
        'No nudity or sexually explicit content.',
        'No graphic violence, threats, self-harm promotion or dangerous challenges.',
        'No terrorism, hate speech or content that targets people based on religion, caste, gender, disability or origin.',
      ] },
      { heading: 'Be respectful', bullets: ['No harassment, bullying, doxxing or sharing other people’s private information.', 'Criticise ideas, not people. Keep comments constructive.'] },
      { heading: 'Be honest', bullets: ['No scams, pyramid schemes, fake jobs or misleading calls-to-action.', 'Don’t post misinformation that could cause real-world harm.', 'Business promotions must be clear about what is being offered.'] },
      { heading: 'Public complaints', bullets: ['Stick to facts you can stand behind.', 'Don’t publish private details (phone numbers, addresses, ID numbers) of individuals.', 'Complaints must concern public or consumer issues, not personal vendettas.'] },
      { heading: 'Enforcement', paragraphs: ['We may remove content, reverse rewards, restrict features, suspend or ban accounts depending on severity and history. Report anything that breaks these rules using the Report option on any post, comment, message or profile.'] },
    ],
  },

  'earnings-terms': {
    title: 'Earnings Terms',
    description: 'How creator rewards, CTA rewards, referrals and withdrawals work.',
    updated: '2026-09-18',
    sections: [
      { heading: 'How rewards are earned', bullets: [
        'Viral reward: at 10 Fires and 10 Shares, a post becomes Viral automatically and appears in One Chance. Any configured reward is granted once per post after review. Premium featured placement is separate and costs ₹10 for 7 days after a manually verified UPI payment.',
        'CTA reward: each unique signed-in member (other than you) who taps your post’s call-to-action button can earn you a small reward, subject to a daily cap per post.',
        'Referral reward: when someone joins with your code within 7 days of signing up, you may earn a referral reward after review.',
        'Bonus: OJASSS may award discretionary bonuses (for example, during campaigns).',
      ] },
      { heading: 'Current values', paragraphs: ['Thresholds and reward amounts are shown on your Earnings page and may change. Changes do not affect rewards already approved.'] },
      { heading: 'Review and approval', paragraphs: ['All rewards are calculated on OJASSS servers, recorded with a unique reference and reviewed before they become available. We may reject or reverse rewards linked to fake accounts, bots, coordinated manipulation, self-referral, removed content or any breach of our guidelines.'] },
      { heading: 'Withdrawals', bullets: [
        'You can withdraw approved earnings above the minimum amount to your UPI ID or Indian bank account.',
        'Only one withdrawal can be in progress at a time; payout details can’t be changed while one is open.',
        'Requests are reviewed, approved and then paid, usually within 3 working days of approval. You’ll receive the bank/UPI transaction reference.',
        'Applicable taxes (such as TDS) may be deducted as required by law; we may request PAN details for compliance.',
      ] },
      { heading: 'Questions', paragraphs: [`Contact ${E.payouts}.`] },
    ],
  },

  'complaints-disclaimer': {
    title: 'Public Complaints Disclaimer',
    description: 'How OJASSS handles public complaint posts and what it does — and does not — do.',
    updated: '2026-09-18',
    sections: [
      { heading: 'Complaints are user allegations', paragraphs: ['Every Public Complaint on OJASSS is written and submitted by a user. It represents that user’s own account and opinion. OJASSS does not investigate or verify the facts in complaints and does not endorse them.'] },
      { heading: 'What OJASSS does', bullets: [
        'Review: complaint posts are checked against our Community Guidelines (for example, to remove private personal information) before publication.',
        'Forwarding: if the complainant asks, OJASSS emails the complaint, unchanged, to the authority they selected from our list of official addresses. We record whether and when it was forwarded.',
        'Status: the post shows its review status, forwarding status and any response the authority provides to us.',
      ] },
      { heading: 'What OJASSS does not do', bullets: [
        'We do not act on behalf of any government body and are not a grievance redressal authority.',
        'We do not guarantee that an authority will respond or take action.',
        'We do not provide legal advice. If a complainant requests legal assistance, we may share information about independent legal-aid options.',
      ] },
      { heading: 'If a complaint is about you', paragraphs: [`If you believe a complaint is false or unlawful, use Report on the post or contact our Grievance Officer at ${E.grievance}. We act on valid legal notices in line with the IT Rules, 2021.`] },
    ],
  },

  'child-safety-standards': {
    title: 'Child Safety Standards',
    description: 'OJASSS’s zero-tolerance standards against child sexual abuse and exploitation (CSAE).',
    updated: '2026-09-18',
    sections: [
      { heading: 'Zero tolerance', paragraphs: ['OJASSS prohibits child sexual abuse material (CSAM) and any content or behaviour that sexualises, grooms, exploits or endangers minors. This includes content that is real, drawn, AI-generated or otherwise simulated.'] },
      { heading: 'Age requirements', paragraphs: ['Users must be at least 13 years old; users under 18 need parental consent. Accounts found to belong to children under 13 are removed.'] },
      { heading: 'How to report', bullets: [
        'In the app or on the web: tap Report on any post, comment, message or profile and choose “Child safety”. These reports are prioritised at the top of our moderation queue.',
        `By email: ${E.safety} (monitored daily).`,
        'If a child is in immediate danger: call 112 (emergency) or Childline 1098, and report online at cybercrime.gov.in.',
      ] },
      { heading: 'Moderation process', bullets: [
        'Child-safety reports are reviewed by trained moderators with the highest priority.',
        'Violating content is removed and the account is banned. Rewards associated with the account are voided.',
        'We preserve relevant records as required by law to support investigations.',
      ] },
      { heading: 'Cooperation with authorities', paragraphs: ['OJASSS reports apparent CSAM to the appropriate Indian authorities, including through the National Cybercrime Reporting Portal, as required by the Protection of Children from Sexual Offences (POCSO) Act, 2012 and the IT Act, 2000, and cooperates with law enforcement requests.'] },
      { heading: 'Safety contact', paragraphs: [`Our designated child-safety point of contact can be reached at ${E.safety}. We respond to child-safety inquiries from authorities and app stores promptly.`] },
    ],
  },
};
