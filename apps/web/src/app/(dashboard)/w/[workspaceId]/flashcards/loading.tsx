import { FlashcardSetListSkeleton } from '@/components/flashcard/flashcard-set-list';

export default function FlashcardsLoading() {
  return (
    <div className="space-y-6">
      <FlashcardSetListSkeleton />
    </div>
  );
}
