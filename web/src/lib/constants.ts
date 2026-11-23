import { Laptop, Gamepad2, Heart, BookOpen, GraduationCap, Ghost, Music2, Sparkles, Briefcase, Clapperboard, Megaphone, Newspaper, Store, type LucideIcon } from 'lucide-react';
import type { Category, ReportReason } from '@/api/types';
import { WORLD_LANGUAGES } from './regionData';
export { COUNTRIES } from './regionData';

export const CATEGORIES: Array<{ value: Category; label: string; icon: LucideIcon; description: string }> = [
  { value: 'one_chance', label: 'One Chance', icon: Sparkles, description: 'Share your talent and opportunities' },
  { value: 'entertainment', label: 'Entertainment', icon: Clapperboard, description: 'Comedy, music, dance, lifestyle' },
  { value: 'technology', label: 'Technology', icon: Laptop, description: 'Ideas, innovation and useful technology' },
  { value: 'education', label: 'Education', icon: BookOpen, description: 'Skills, lessons and new perspectives' },
  { value: 'gaming', label: 'Gaming', icon: Gamepad2, description: 'Games, highlights and communities' },
  { value: 'lifestyle', label: 'Lifestyle', icon: Heart, description: 'Everyday inspiration and experiences' },
  { value: 'horror_stories', label: 'Horror Stories', icon: Ghost, description: 'Suspense and scary stories' },
  { value: 'music_dance', label: 'Music and Dance', icon: Music2, description: 'Performances, music and dance' },
  { value: 'world_education', label: 'World Education', icon: GraduationCap, description: 'Learn and discover the world' },
  { value: 'business_promotion', label: 'Business Promotion', icon: Store, description: 'Products, shops and services' },
  { value: 'part_time_jobs', label: 'Part Time · 48hrs', icon: Briefcase, description: 'Gigs, openings and hiring' },
  { value: 'full_time_jobs', label: 'Full Time Jobs', icon: Briefcase, description: 'Careers and full-time opportunities' },
  { value: 'news', label: 'News Reporter · 48hrs', icon: Newspaper, description: 'Local and community updates' },
  { value: 'public_complaint', label: 'Public Complaint', icon: Megaphone, description: 'Raise a civic or consumer issue' },
];

export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? c;

const LOCAL_LANGUAGE_NAMES: Array<{ value: string; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी · Hindi' },
  { value: 'bn', label: 'বাংলা · Bengali' },
  { value: 'te', label: 'తెలుగు · Telugu' },
  { value: 'mr', label: 'मराठी · Marathi' },
  { value: 'ta', label: 'தமிழ் · Tamil' },
  { value: 'ur', label: 'اردو · Urdu' },
  { value: 'gu', label: 'ગુજરાતી · Gujarati' },
  { value: 'kn', label: 'ಕನ್ನಡ · Kannada' },
  { value: 'ml', label: 'മലയാളം · Malayalam' },
  { value: 'or', label: 'ଓଡ଼ିଆ · Odia' },
  { value: 'pa', label: 'ਪੰਜਾਬੀ · Punjabi' },
  { value: 'as', label: 'অসমীয়া · Assamese' },
];

export const LANGUAGES = WORLD_LANGUAGES.map(l=>({value:l.value,label:LOCAL_LANGUAGE_NAMES.find(n=>n.value===l.value)?.label??l.label}));
export const languageLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label.split(' · ').pop() ?? v;

export const COMPLAINT_SUBCATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'civic_infrastructure', label: 'Roads, water & civic infrastructure' },
  { value: 'corruption', label: 'Corruption / bribery' },
  { value: 'consumer_rights', label: 'Consumer rights' },
  { value: 'public_safety', label: 'Public safety' },
  { value: 'health', label: 'Health services' },
  { value: 'education', label: 'Education' },
  { value: 'environment', label: 'Environment & sanitation' },
  { value: 'other', label: 'Other' },
];

export const REPORT_REASONS: Array<{ value: ReportReason; label: string; description: string }> = [
  { value: 'spam', label: 'Spam', description: 'Scams, fake engagement, repetitive promotion' },
  { value: 'harassment', label: 'Harassment or bullying', description: 'Targeting or intimidating someone' },
  { value: 'illegal', label: 'Illegal content', description: 'Content that breaks the law' },
  { value: 'child_safety', label: 'Child safety', description: 'Anything that endangers or sexualises minors' },
  { value: 'copyright', label: 'Copyright', description: 'Uses my work without permission' },
  { value: 'misinformation', label: 'Misinformation', description: 'False or misleading claims' },
  { value: 'adult', label: 'Adult content', description: 'Nudity or sexual content' },
  { value: 'violence', label: 'Violence', description: 'Graphic violence or threats' },
  { value: 'other', label: 'Other', description: 'Something else' },
];

export const INQUIRY_TYPES = [
  { value: 'gst_consultant', label: 'GST Consultant' },
  { value: 'investor', label: 'Investor' },
  { value: 'business_promotion', label: 'Business Promotion' },
  { value: 'other', label: 'Other' },
] as const;
