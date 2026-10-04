'use client';

import { useState } from 'react';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ChatInput } from '@/components/assistant/chat-input';

export default function LifecycleRegression() {
  const [suggested, setSuggested] = useState<string>();
  const [submitted, setSubmitted] = useState('');
  return (
    <main className="mx-auto max-w-3xl p-6">
      <ThemeToggle />
      <button onClick={() => setSuggested('R1 suggested prompt')}>Set synthetic prompt</button>
      <ChatInput initialText={suggested} onSend={setSubmitted} onStop={() => {}} busy={false} />
      <p data-testid="submitted">{submitted}</p>
    </main>
  );
}
