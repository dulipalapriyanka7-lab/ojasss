import { useSeo } from '@/lib/seo';
import { date } from '@/lib/format';
import { LEGAL_DOCS } from './content';
import { PublicLayout } from './PublicLayout';

export default function LegalPage({ slug }: { slug: string }) {
  const doc = LEGAL_DOCS[slug];
  useSeo({ title: doc.title, description: doc.description, path: `/${slug}` });
  return (
    <PublicLayout>
      <article className="max-w-[72ch]">
        <h1 className="text-3xl font-bold sm:text-4xl">{doc.title}</h1>
        <p className="mt-3 text-lg text-fg-2">{doc.description}</p>
        <p className="mt-2 text-sm text-fg-3">Last updated {date(doc.updated)}</p>
        <div className="mt-10 space-y-10">
          {doc.sections.map((s) => (
            <section key={s.heading} aria-labelledby={`h-${s.heading}`}>
              <h2 id={`h-${s.heading}`} className="text-xl font-semibold">{s.heading}</h2>
              {s.paragraphs?.map((p) => <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-fg-2">{p}</p>)}
              {s.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-fg-2 marker:text-brand">
                  {s.bullets.map((b) => <li key={b.slice(0, 40)}>{b}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </PublicLayout>
  );
}
