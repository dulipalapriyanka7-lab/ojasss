import type { PostCard, PublicSettings } from '@/api/types';

export type OneChanceCategoryAccess = NonNullable<PublicSettings['one_chance.category_access']>;

export const defaultOneChanceCategoryAccess: OneChanceCategoryAccess = {
  entry: ['entertainment'],
  voting: ['entertainment'],
};

export function allowsOneChance(post: PostCard, settings?: PublicSettings, voting = false) {
  const category = post.source_category ?? post.category;
  const access = settings?.['one_chance.category_access'] ?? defaultOneChanceCategoryAccess;
  const availability = settings?.['categories.config']?.[category];
  return post.kind === 'video' && access.entry.includes(category)
    && availability?.enabled !== false && !availability?.deleted
    && (!voting || access.voting.includes(category));
}
