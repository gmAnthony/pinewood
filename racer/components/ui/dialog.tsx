"use client";

import {
  createContext,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  cloneElement,
  useContext,
  useMemo,
} from "react";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ open, onOpenChange }), [open, onOpenChange]);
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>;
}) {
  const context = useContext(DialogContext);
  if (!context) {
    return children;
  }

  const onClick: MouseEventHandler<HTMLElement> = (event) => {
    children.props.onClick?.(event);
    context.onOpenChange(true);
  };

  if (asChild) {
    return cloneElement(children, {
      onClick,
    });
  }

  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}

export function DialogContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(DialogContext);
  if (!context || !context.open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => context.onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
        <div
          className={`w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{children}</h2>;
}

export function DialogDescription({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{children}</p>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

export function DialogClose({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: ReactElement<{ onClick?: MouseEventHandler<HTMLElement> }>;
}) {
  const context = useContext(DialogContext);
  if (!context) {
    return children;
  }

  const onClick: MouseEventHandler<HTMLElement> = (event) => {
    children.props.onClick?.(event);
    context.onOpenChange(false);
  };

  if (asChild) {
    return cloneElement(children, {
      onClick,
    });
  }

  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}
