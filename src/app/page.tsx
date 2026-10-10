import { PageTransition } from "@/components/PageTransition";
import { Quiz } from "@/components/Quiz";

export default async function QuizPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  return (
    <PageTransition>
      <Quiz initialDeck={typeof deck === "string" ? deck : undefined} />
    </PageTransition>
  );
}
