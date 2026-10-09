'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UploadDocumentDialog } from '@/components/document/upload-document-dialog';

export function UploadDocumentButton({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={triggerRef} onClick={() => setOpen(true)} className="w-full sm:w-auto">
        <Upload className="mr-2 size-4" aria-hidden="true" />
        Upload notes
      </Button>
      <UploadDocumentDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
