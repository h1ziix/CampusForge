'use client';

import { useState, useCallback, useId, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { FlashcardCardRow } from '@/server/queries/flashcard';

interface FlashcardViewerProps {
  cards: FlashcardCardRow[];
  title: string;
}

/**
 * CampusForge flashcard study viewer.
 *
 * Features:
 * - Native button activation to reveal the answer
 * - Arrow navigation while the study card is focused
 * - Shuffle mode
 * - Progress indicator
 */
export function FlashcardViewer({ cards, title }: FlashcardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyCards, setStudyCards] = useState(cards);
  const contentId = useId();
  const hintId = useId();

  const currentCard = studyCards[currentIndex];
  const totalCards = studyCards.length;

  const goNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, totalCards]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const flip = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  const restart = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  const shuffle = useCallback(() => {
    const shuffled = [...studyCards].sort(() => Math.random() - 0.5);
    setStudyCards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [studyCards]);

  // Shortcuts belong to this card only. Enter/Space keep their native button
  // activation; surrounding buttons, links and editable fields are untouched.
  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
    }
  }

  if (totalCards === 0) {
    return (
      <Card role="status" className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No flashcards in this set.</p>
      </Card>
    );
  }

  return (
    <section aria-label="Flashcard study" className="flex min-w-0 flex-col gap-6">
      {/* Progress bar */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{title}</span>
          <span role="status" aria-label="Card position" className="shrink-0">
            {currentIndex + 1} / {totalCards}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Study progress"
          aria-valuemin={0}
          aria-valuemax={totalCards}
          aria-valuenow={currentIndex + 1}
          aria-valuetext={`Card ${currentIndex + 1} of ${totalCards}`}
          className="h-1.5 w-full rounded-full bg-muted"
        >
          <div
            className="h-1.5 rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{
              width: `${((currentIndex + 1) / totalCards) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <button
        type="button"
        className="mx-auto flex min-h-[280px] w-full max-w-2xl cursor-pointer flex-col items-center justify-center rounded-xl border bg-card px-5 py-8 text-card-foreground shadow-sm transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none sm:px-8"
        onClick={flip}
        onKeyDown={handleCardKeyDown}
        aria-keyshortcuts="ArrowLeft ArrowRight"
        aria-label={isFlipped ? 'Click to show question' : 'Click to show answer'}
        aria-describedby={`${contentId} ${hintId}`}
      >
        <span
          id={contentId}
          aria-live="polite"
          aria-atomic="true"
          className="flex w-full min-w-0 flex-col items-center gap-3"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isFlipped ? 'Answer' : 'Question'}
          </span>
          <span className="w-full whitespace-pre-wrap break-words text-center text-lg font-medium leading-relaxed [overflow-wrap:anywhere]">
            {isFlipped ? currentCard.back : currentCard.front}
          </span>
        </span>
        <span className="mt-6 text-xs text-muted-foreground">
          {isFlipped
            ? 'Click or press Enter or Space to show question'
            : 'Click or press Enter or Space to reveal answer'}
        </span>
      </button>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="Previous card"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={restart}
          aria-label="Restart from beginning"
        >
          <RotateCcw aria-hidden="true" className="mr-1 h-4 w-4" />
          Restart
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={shuffle}
          aria-label="Shuffle cards"
        >
          <Shuffle aria-hidden="true" className="mr-1 h-4 w-4" />
          Shuffle
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 min-w-11"
          onClick={goNext}
          disabled={currentIndex === totalCards - 1}
          aria-label="Next card"
        >
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </div>

      {/* Keyboard hint */}
      <p id={hintId} className="text-center text-xs text-muted-foreground">
        Focus the card: use arrow keys to navigate, Space or Enter to flip
      </p>
    </section>
  );
}
