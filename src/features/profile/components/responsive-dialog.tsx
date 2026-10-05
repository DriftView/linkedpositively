"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * A bottom sheet on phones, a centred dialog on larger screens. `footer`
 * stays pinned below the scrolling body.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const mobile = useIsMobile();

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh] rounded-t-3xl">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle className="font-heading text-lg">{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", className)}>{children}</div>
          {footer ? (
            <div className="border-t bg-popover px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 rounded-3xl p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-5", className)}>{children}</div>
        {footer ? <div className="border-t px-6 py-4">{footer}</div> : null}
      </DialogContent>
    </Dialog>
  );
}
