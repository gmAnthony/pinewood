"use client";

import { useState } from "react";
import { CreateEventForm } from "@/app/create-event-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AuthorizedTopNav() {
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);

  return (
    <nav className="w-full border-b border-zinc-200 bg-white px-6 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">Racer</p>
        <Dialog open={isCreateEventOpen} onOpenChange={setIsCreateEventOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Create Event
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Event</DialogTitle>
              <DialogDescription>
                Create an event with one or more divisions.
              </DialogDescription>
            </DialogHeader>
            <CreateEventForm
              onCreated={() => {
                window.dispatchEvent(new Event("events:refresh"));
                setIsCreateEventOpen(false);
              }}
            />
            <DialogFooter>
              <DialogClose asChild>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  Close
                </button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </nav>
  );
}
