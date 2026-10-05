import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input.tsx";

/**
 * A passphrase field that can show what is typed. Masked entry is error-prone on a phone and a
 * mistyped passphrase here cannot be recovered, so the option to display it is always offered
 * (NIST SP 800-63B: "offer an option to display the password"). Paste stays allowed.
 */
export default function PassphraseInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`h-11 pr-12 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-pressed={visible}
        aria-label={t("keyUnlock.passphrase.show")}
        title={t(visible ? "keyUnlock.passphrase.hide" : "keyUnlock.passphrase.show")}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
