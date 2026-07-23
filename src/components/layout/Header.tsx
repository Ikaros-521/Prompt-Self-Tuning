import { useTranslation } from "react-i18next";
import { Moon, Sun, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore } from "@/store/useAppStore";
import { setLanguage, LANGUAGES } from "@/i18n/config";

export function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useAppStore();
  const lang = i18n.language?.startsWith("zh") ? "zh" : "en";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <div className="flex items-center gap-2.5">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt="logo"
          className="h-7 w-7"
        />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{t("app.title")}</span>
          <span className="text-[11px] text-muted-foreground">
            {t("app.tagline")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={lang} onValueChange={(v) => setLanguage(v as "zh" | "en")}>
          <SelectTrigger className="h-8 w-[120px]">
            <Languages className="mr-1 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={t("theme.toggle")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("theme.toggle")}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
