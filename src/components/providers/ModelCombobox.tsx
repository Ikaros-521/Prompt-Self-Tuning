import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ChevronDown, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  loading?: boolean;
  onRefresh?: () => void;
  refreshTitle?: string;
}

/**
 * 模型选择 Combobox：
 * - 支持手动输入任意值（兼容端点未返回列表的情况）
 * - 有 options 时支持下拉，并按输入内容实时过滤检索
 * - 键盘可达：↑/↓ 导航、Enter 选中、Esc 关闭
 */
export function ModelCombobox({
  value,
  onChange,
  options,
  placeholder,
  loading,
  onRefresh,
  refreshTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, value]);

  useEffect(() => {
    setActiveIndex(0);
  }, [value, options]);

  // 点击组件外部关闭下拉
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      if (!open) setOpen(true);
      else if (filtered.length)
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (open && filtered.length) setActiveIndex((i) => Math.max(i - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (open && filtered[activeIndex]) {
        select(filtered[activeIndex]);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative flex gap-1.5">
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => options.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="font-mono text-xs pr-7"
          autoComplete="off"
        />
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
            {filtered.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {options.length === 0
                  ? "暂无列表，请先点击右侧 ↻ 获取"
                  : "无匹配模型"}
              </div>
            ) : (
              filtered.map((o, i) => (
                <button
                  type="button"
                  key={o}
                  // preventDefault 避免点击导致输入框失焦
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(o);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs outline-none",
                    i === activeIndex && "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="truncate">{o}</span>
                  {value === o && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {onRefresh && (
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          type="button"
          title={refreshTitle}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span aria-hidden>↻</span>
          )}
        </Button>
      )}
    </div>
  );
}
