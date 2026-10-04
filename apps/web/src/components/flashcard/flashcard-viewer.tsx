'use client';

import { useState, useCallback, useEffect } from 'react';
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
 * - Click-to-flip card with CSS transition
 * - Keyboard navigation (arrow keys, space to flip)
 * - Shuffle mode
 * - Progress indicator
 */
export function FlashcardViewer({ cards, title }: FlashcardViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyCards, setStudyCards] = useState(cards);

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

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowRight':
          goNext();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          flip();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, flip]);

  if (totalCards === 0) {
    return (
      <Card className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">No flashcards in this set.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{title}</span>
          <span>
            {currentIndex + 1} / {totalCards}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / totalCards) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div
        className="mx-auto w-full max-w-2xl cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={flip}
        role="button"
        tabIndex={0}
        aria-label={isFlipped ? 'Click to show question' : 'Click to show answer'}
      >
        <div
          className={`relative transition-transform duration-500 [transform-style:preserve-3d] ${
            isFlipped ? '[transform:rotateY(180deg)]' : ''
          }`}
          style={{ minHeight: '280px' }}
        >
          {/* Front face */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border bg-card p-8 shadow-sm [backface-visibility:hidden]">
            <span className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Question
            </span>
            <p className="text-center text-lg font-medium leading-relaxed">{currentCard.front}</p>
            <span className="mt-6 text-xs text-muted-foreground">
              Click or press Space to reveal answer
            </span>
          </div>

          {/* Back face */}
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border bg-card p-8 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Answer
            </span>
            <p className="text-center text-lg leading-relaxed">{currentCard.back}</p>
            <span className="mt-6 text-xs text-muted-foreground">
              Click or press Space to show question
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={currentIndex === 0}
          aria-label="Previous card"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={restart} aria-label="Restart from beginning">
          <RotateCcw className="mr-1 h-4 w-4" />
          Restart
        </Button>
        <Button variant="outline" size="sm" onClick={shuffle} aria-label="Shuffle cards">
          <Shuffle className="mr-1 h-4 w-4" />
          Shuffle
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goNext}
          disabled={currentIndex === totalCards - 1}
          aria-label="Next card"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-xs text-muted-foreground">
        Use arrow keys to navigate, Space or Enter to flip
      </p>
    </div>
  );
}
