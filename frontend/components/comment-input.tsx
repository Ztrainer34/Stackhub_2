"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export default function CommentInput({
  onSubmit,
}: {
  onSubmit: (content: string) => void;
}) {
  const [textAreaContent, setTextAreaContent] = useState<string | null>(null);

  return (
    <div className="grid w-full gap-2">
      <Textarea
        onChange={(e) => setTextAreaContent(e.target.value)}
        placeholder="Type your thoughts..."
      />
      <Button
        disabled={!textAreaContent}
        onClick={() => onSubmit(textAreaContent!)}
      >
        Post comment
      </Button>
    </div>
  );
}
