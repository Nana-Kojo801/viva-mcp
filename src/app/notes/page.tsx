import { PageTransition } from "@/components/PageTransition";
import type { Metadata } from "next";
import { Notes } from "@/components/Notes";

export const metadata: Metadata = { title: "Add notes · Viva" };

export default function NotesPage() {
  return (
    <PageTransition>
      <Notes />
    </PageTransition>
  );
}
