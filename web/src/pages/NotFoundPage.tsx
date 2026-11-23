import { Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { useSeo } from '@/lib/seo';

export default function NotFoundPage() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <div className="flex min-h-[70svh] items-center justify-center px-4">
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The link may be broken or the page may have moved."
        action={<><ButtonLink to="/">Go home</ButtonLink><ButtonLink to="/" variant="secondary">Home</ButtonLink></>}
      />
    </div>
  );
}
