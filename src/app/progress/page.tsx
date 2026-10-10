import { PageTransition } from "@/components/PageTransition";
import type { Metadata } from "next";
import { ProgressView } from "@/components/ProgressView";

export const metadata: Metadata = { title: "Progress · Viva" };

export default function ProgressPage() {
  return (
    <PageTransition>
      <ProgressView />
    </PageTransition>
  );
}
