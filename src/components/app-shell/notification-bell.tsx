"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { markAllReadAction, markReadAction } from "@/lib/actions/notifications";
import { formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell({
  items,
  unread,
}: {
  items: NotificationItem[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleMarkAll() {
    startTransition(async () => {
      await markAllReadAction();
      router.refresh();
    });
  }

  function handleOpen(id: string) {
    startTransition(async () => {
      await markReadAction(id);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="ghost" size="icon" />}
        className="relative size-9"
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications, none unread"
        }
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAll}
              disabled={pending}
            >
              <Check className="size-3.5" aria-hidden="true" />
              Mark all read
            </Button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Approvals and updates will show up here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[22rem]">
            <ul className="divide-y">
              {items.map((item) => {
                const unreadItem = !item.readAt;
                const content = (
                  <>
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          unreadItem ? "bg-primary" : "bg-transparent",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm leading-snug",
                            unreadItem ? "font-medium" : "text-muted-foreground",
                          )}
                        >
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                            {item.body}
                          </p>
                        )}
                        <p className="text-muted-foreground/70 mt-1 text-[11px]">
                          {formatRelative(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </>
                );

                return (
                  <li key={item.id}>
                    {item.linkUrl ? (
                      <Link
                        href={item.linkUrl}
                        onClick={() => {
                          setOpen(false);
                          if (unreadItem) handleOpen(item.id);
                        }}
                        className="hover:bg-accent block px-3 py-2.5 transition-colors"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => unreadItem && handleOpen(item.id)}
                        className="hover:bg-accent block w-full px-3 py-2.5 text-left transition-colors"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
