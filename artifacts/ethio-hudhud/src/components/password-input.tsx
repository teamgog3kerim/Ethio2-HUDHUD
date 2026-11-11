import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useApp } from "@/lib/app";
import { cn } from "@/lib/utils";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
};

export function PasswordInput({ className, wrapperClassName, ...inputProps }: PasswordInputProps) {
  const { t } = useApp();
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative mt-1.5", wrapperClassName)} dir="ltr">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={cn(className, "pe-12")}
      />
      <button
        type="button"
        className="absolute end-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={visible ? t("إخفاء كلمة المرور", "Hide password") : t("إظهار كلمة المرور", "Show password")}
        aria-pressed={visible}
        data-testid={inputProps.id ? `toggle-${inputProps.id}` : undefined}
        onClick={() => setVisible(current => !current)}
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
