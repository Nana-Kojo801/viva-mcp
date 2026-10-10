import { PageTransition } from "@/components/PageTransition";
import { Quiz } from "@/components/Quiz";

// Static, like the other screens, so it is prefetched and opens instantly. Quiz reads ?deck= in the browser.
export default function QuizPage() {
  return (
    <PageTransition>
      <Quiz />
    </PageTransition>
  );
}
