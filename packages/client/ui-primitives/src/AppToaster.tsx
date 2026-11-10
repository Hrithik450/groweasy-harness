
import { Toaster as SonnerToaster } from "sonner";
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export function AppToaster() {
  return (
    <SonnerToaster
      position="top-right"
      theme="light"
      duration={3500}
      gap={8}
      visibleToasts={3}
      offset={{ top: 16, right: 16 }}
      icons={{
        success: (
          <CheckCircle2
            size={14}
            className="text-emerald-600 shrink-0 mt-0.5 stroke-[2]"
          />
        ),
        error: (
          <AlertCircle
            size={14}
            className="text-rose-600 shrink-0 mt-0.5 stroke-[2]"
          />
        ),
        info: (
          <Info
            size={14}
            className="text-[#1E3B33] shrink-0 mt-0.5 stroke-[2]"
          />
        ),
        warning: (
          <AlertTriangle
            size={14}
            className="text-amber-500 shrink-0 mt-0.5 stroke-[2]"
          />
        ),
        loading: (
          <Loader2
            size={14}
            className="text-[#1E3B33] shrink-0 mt-0.5 animate-spin"
          />
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group font-sans !rounded-lg !border !border-gray-200/90 !bg-white/95 !backdrop-blur-md !shadow-lg !shadow-gray-950/5 !text-gray-900 select-none",
          title:
            "!text-[13px] !font-medium !text-gray-900 !leading-snug !tracking-tight",
          description:
            "!text-xs !text-gray-500 !leading-relaxed !font-normal !mt-0.5",
          actionButton:
            "!px-3 !py-1.5 !rounded-lg !text-xs !font-medium !bg-[#1E3B33] !text-white hover:!bg-[#152B25] !transition-all !cursor-pointer",
          cancelButton:
            "!px-3 !py-1.5 !rounded-lg !text-xs !font-medium !bg-gray-100 !text-gray-700 hover:!bg-gray-200 !transition-all !cursor-pointer",
          success: "!border-emerald-500/25 !bg-white",
          error: "!border-rose-500/25 !bg-white",
          info: "!border-[#1E3B33]/20 !bg-white",
          warning: "!border-amber-500/25 !bg-white",
        },
      }}
    />
  );
}
