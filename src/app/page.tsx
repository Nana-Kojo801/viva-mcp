import { Quiz } from "@/components/Quiz";

export default async function QuizPage({ searchParams }: { searchParams: Promise<{ deck?: string }> }) {
  const { deck } = await searchParams;
  return <Quiz initialDeck={typeof deck === "string" ? deck : undefined} />;
}
