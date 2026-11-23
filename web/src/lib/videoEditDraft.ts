import type { VideoEdit } from './videoEdit';

export type VideoEditDraft = {
  file: File;
  edit: VideoEdit;
  origin: '' | 'copy_paste' | 'new_content';
  episode: boolean;
  seriesTitle: string;
  seriesGenre: string;
  episodeNumber: number;
};

async function withDraftStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open('ojasss-editor', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('drafts');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('drafts', mode);
      const request = work(transaction.objectStore('drafts'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export function readVideoEditDraft(userId: string): Promise<VideoEditDraft | undefined> {
  return withDraftStore('readonly', store => store.get(userId));
}

export function saveVideoEditDraft(userId: string, draft: VideoEditDraft) {
  return withDraftStore('readwrite', store => store.put(draft, userId));
}

export function removeVideoEditDraft(userId: string) {
  return withDraftStore('readwrite', store => store.delete(userId));
}
