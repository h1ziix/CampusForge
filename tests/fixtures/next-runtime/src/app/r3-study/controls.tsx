'use client';

import { useState } from 'react';

// Surrounding controls expose browser defaults without replacing the production viewer.
export function StudyFixtureControls() {
  const [actions, setActions] = useState(0);
  const [submissions, setSubmissions] = useState(0);

  return (
    <div className="mb-6 space-y-3 rounded-lg border p-4">
      <button type="button" onClick={() => setActions((value) => value + 1)}>
        Outside action
      </button>
      <output aria-label="Outside actions">{actions}</output>
      <a className="block underline" href="#study-destination">
        Outside link
      </a>
      <label className="block">
        Outside input
        <input className="ml-2 border" aria-label="Outside input" />
      </label>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Editable notes"
        className="min-h-8 border p-2"
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmissions((value) => value + 1);
        }}
      >
        <label>
          Search cards
          <input className="ml-2 border" aria-label="Search cards" />
        </label>
        <button type="submit">Submit search</button>
        <output aria-label="Search submissions">{submissions}</output>
      </form>
    </div>
  );
}
