import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = ComponentProps<typeof Input> & {
  containerClassName?: string;
};

export function SearchInput({
  className,
  containerClassName,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn("relative w-full max-w-md", containerClassName)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("ps-10", className)} {...props} />
    </div>
  );
}
