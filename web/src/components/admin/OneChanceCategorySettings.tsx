import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { admin } from '@/api/admin';
import type { Category, PublicSettings } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { CATEGORIES } from '@/lib/constants';
import type { OneChanceCategoryAccess } from '@/lib/oneChanceCategories';

export function OneChanceCategorySettings({ access, categories }: {
  access: OneChanceCategoryAccess;
  categories?: PublicSettings['categories.config'];
}) {
  const [draft, setDraft] = useState(access);
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => admin.updateSetting('one_chance.category_access', draft, 'Updated One Chance category access', true),
    onSuccess: async () => {
      await Promise.all(['public-settings', 'feed', 'post', 'competition', 'leaderboard', 'viral-entry-notice', 'one-chance'].map(key =>
        qc.invalidateQueries({ queryKey: [key] })));
      await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success('Category access saved');
    },
    onError: error => toast.error(error),
  });

  const toggle = (category: Category, permission: keyof OneChanceCategoryAccess, checked: boolean) => {
    setDraft(current => ({
      ...current,
      [permission]: checked ? [...current[permission], category] : current[permission].filter(value => value !== category),
      ...(permission === 'entry' && !checked ? { voting: current.voting.filter(value => value !== category) } : {}),
    }));
  };

  return (
    <Card as="section" className="mb-4 space-y-3 p-3 sm:p-4">
      <div>
        <h2 className="text-sm font-semibold">One Chance category access</h2>
        <p className="mt-1 text-xs text-fg-3">Choose which categories can enter One Chance and receive votes. Every category can still reach Viral.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem] items-center gap-x-2 text-xs">
        <span className="font-semibold">Category</span><span className="text-center font-semibold">One Chance</span><span className="text-center font-semibold">Votes</span>
        {CATEGORIES.filter(category => category.value !== 'one_chance').map(({ value, label }) => {
          const name = categories?.[value]?.label ?? label;
          const entry = draft.entry.includes(value);
          return (
            <div key={value} className="col-span-3 grid grid-cols-subgrid items-center border-t border-line">
              <span className="min-w-0 break-words py-2">{name}</span>
              <label className="grid min-h-11 cursor-pointer place-items-center">
                <input type="checkbox" aria-label={`One Chance for ${name}`} checked={entry} disabled={save.isPending}
                  onChange={event => toggle(value, 'entry', event.target.checked)} />
              </label>
              <label className="grid min-h-11 place-items-center">
                <input type="checkbox" aria-label={`Votes for ${name}`} checked={draft.voting.includes(value)} disabled={!entry || save.isPending}
                  onChange={event => toggle(value, 'voting', event.target.checked)} />
              </label>
            </div>
          );
        })}
      </div>
      <Button size="sm" loading={save.isPending} disabled={JSON.stringify(draft) === JSON.stringify(access)}
        onClick={() => save.mutate()}>Save category access</Button>
    </Card>
  );
}
