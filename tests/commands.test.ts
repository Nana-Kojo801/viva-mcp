import { describe, expect, it } from "vitest";
import { matchCommand } from "../src/lib/client/voice";

describe("matchCommand", () => {
  it.each([
    ["Skip", "skip"],
    ["skip this one.", "skip"],
    ["Repeat the question", "repeat"],
    ["say that again", "repeat"],
    ["I don't know", "dont-know"],
    ["I dont know.", "dont-know"],
    ["Stop", "stop"],
    ["that's enough", "stop"],
    ["study ahead", "study-ahead"],
    ["Give me a hint", "hint"],
    ["another hint please", "hint"],
    ["clue", "hint"],
    ["Explain it differently", "explain"],
    ["I don't get it", "explain"],
    ["next question", "next"],
    ["continue", "next"],
  ])("%s -> %s", (input, expected) => {
    expect(matchCommand(input)).toBe(expected);
  });

  it("treats real answers as answers", () => {
    expect(matchCommand("prices stop rising when supply meets demand")).toBeNull();
    expect(matchCommand("I don't know exactly but it's where curves cross")).toBeNull();
    expect(matchCommand("skipping production lowers supply")).toBeNull();
  });
});
