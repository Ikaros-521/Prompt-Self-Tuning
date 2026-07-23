import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  prompt: string;
  className?: string;
}

export function PromptPreview({ prompt, className }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={cn("relative h-full overflow-hidden", className)}>
      {prompt ? (
        <>
          <pre className="h-full overflow-auto scrollbar-thin whitespace-pre-wrap break-words p-3 pr-10 font-mono text-xs leading-relaxed">
            {prompt}
          </pre>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-1.5 top-1.5"
            onClick={handleCopy}
            title={t("common.copy")}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {t("optimize.noPrompt")}
        </div>
      )}
    </div>
  );
}
