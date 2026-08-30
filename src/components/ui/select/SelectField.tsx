"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { SelectOption } from "@/components/ui/select/types";

type BaseProps = {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  searchable?: boolean;
  disabled?: boolean;
  error?: string;
  emptyLabel?: string;
  className?: string;
};

export function SingleSelect({ label, placeholder = "選択してください", options, value, onChange, searchable = false, clearable = false, disabled = false, error, emptyLabel = "候補がありません", className = "" }: BaseProps & { value: string; onChange: (value: string) => void; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const filtered = useFilteredOptions(options, query);

  useDismiss(rootRef, () => setOpen(false));

  const choose = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  };

  return (
    <SelectShell className={className} error={error} label={label}>
      <div className="relative" ref={rootRef}>
        <button aria-expanded={open} className="task-input flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => handleTriggerKey(event, setOpen)} type="button">
          <span className={`min-w-0 truncate text-sm font-medium ${selected ? "text-[#302D30]" : "text-[#9A9296]"}`}>{selected?.label ?? placeholder}</span>
          <span className="flex shrink-0 items-center gap-2">
            {clearable && value ? <span aria-label="選択を解除" className="grid h-5 w-5 place-items-center rounded-none text-[#9A9296] hover:bg-[#FFF0F3] hover:text-[#EC6F8B]" onClick={(event) => { event.stopPropagation(); onChange(""); }} role="button" tabIndex={-1}><X className="h-3.5 w-3.5" /></span> : null}
            <ChevronDown className={`h-4 w-4 text-[#EC6F8B] transition ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        {open ? <OptionPopover emptyLabel={emptyLabel} filtered={filtered} onChoose={choose} query={query} searchable={searchable} selectedValues={value ? [value] : []} setQuery={setQuery} /> : null}
      </div>
    </SelectShell>
  );
}

export function MultiSelect({ label, placeholder = "選択してください", options, values, onChange, searchable = true, disabled = false, error, emptyLabel = "候補がありません", className = "" }: BaseProps & { values: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedOptions = values.map((value) => options.find((option) => option.value === value)).filter((option): option is SelectOption => Boolean(option));
  const filtered = useFilteredOptions(options, query);

  useDismiss(rootRef, () => setOpen(false));

  const toggle = (nextValue: string) => {
    onChange(values.includes(nextValue) ? values.filter((value) => value !== nextValue) : [...values, nextValue]);
  };

  return (
    <SelectShell className={className} error={error} label={label}>
      <div className="relative" ref={rootRef}>
        <button aria-expanded={open} className="task-input flex min-h-11 items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => handleTriggerKey(event, setOpen)} type="button">
          <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {selectedOptions.length ? selectedOptions.map((option) => (
              <span className="inline-flex max-w-48 items-center gap-1 rounded-none bg-white px-2 py-1 text-xs font-medium text-[#D94F6E] ring-1 ring-[#F7CAD2]" key={option.value}>
                <span className="truncate">{option.label}</span>
                <span aria-label={`${option.label}を解除`} className="grid h-4 w-4 place-items-center rounded-none hover:bg-[#FFF0F3]" onClick={(event) => { event.stopPropagation(); toggle(option.value); }} role="button" tabIndex={-1}><X className="h-3 w-3" /></span>
              </span>
            )) : <span className="truncate text-sm font-medium text-[#9A9296]">{placeholder}</span>}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-[#EC6F8B] transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? <OptionPopover emptyLabel={emptyLabel} filtered={filtered} multi onChoose={toggle} query={query} searchable={searchable} selectedValues={values} setQuery={setQuery} /> : null}
      </div>
    </SelectShell>
  );
}

export function SearchSelect(props: Omit<Parameters<typeof SingleSelect>[0], "searchable">) {
  return <SingleSelect {...props} searchable />;
}

function SelectShell({ label, error, className, children }: { label?: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`grid gap-2 text-sm font-medium text-[#655D62] ${className ?? ""}`}>
      {label ? <span>{label}</span> : null}
      {children}
      {error ? <p className="text-xs font-medium text-[#D94F6E]">{error}</p> : null}
    </div>
  );
}

function OptionPopover({ filtered, selectedValues, onChoose, searchable, query, setQuery, multi = false, emptyLabel }: { filtered: SelectOption[]; selectedValues: string[]; onChoose: (value: string) => void; searchable: boolean; query: string; setQuery: (query: string) => void; multi?: boolean; emptyLabel: string }) {
  return (
    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-none border border-[#F0E7E9] bg-white shadow-[0_16px_36px_rgba(72,48,55,0.14)]">
      {searchable ? (
        <label className="flex h-10 items-center gap-2 border-b border-[#F0E7E9] px-3 text-[#8A8186]">
          <Search className="h-4 w-4" />
          <input autoFocus className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[#302D30] outline-none placeholder:text-[#AAA]" placeholder="検索" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      ) : null}
      <div className="max-h-72 overflow-auto p-1">
        {filtered.length ? filtered.map((option) => {
          const selected = selectedValues.includes(option.value);
          return (
            <button className={`flex min-h-10 w-full items-center gap-3 rounded-none px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "bg-[#FFF0F3] text-[#D94F6E]" : "text-[#50494D] hover:bg-[#FFFBFC]"}`} disabled={option.disabled} key={option.value} onClick={() => onChoose(option.value)} type="button">
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-none border ${selected ? "border-[#EC6F8B] bg-[#EC6F8B] text-white" : "border-[#E3D7DA] bg-white text-transparent"}`}>{multi || selected ? <Check className="h-3.5 w-3.5" /> : null}</span>
              {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.description ? <span className="block truncate text-xs font-semibold text-[#8A8186]">{option.description}</span> : null}
              </span>
            </button>
          );
        }) : <p className="px-3 py-4 text-sm font-medium text-[#8A8186]">{emptyLabel}</p>}
      </div>
    </div>
  );
}

function useFilteredOptions(options: SelectOption[], query: string): SelectOption[] {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => [option.label, option.description, option.value].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [options, query]);
}

function useDismiss(ref: React.RefObject<HTMLDivElement | null>, onDismiss: () => void) {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss, ref]);
}

function handleTriggerKey(event: KeyboardEvent<HTMLButtonElement>, setOpen: (value: boolean) => void) {
  if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    setOpen(true);
  }
}
