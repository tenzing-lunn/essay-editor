// A sample first draft for the landing demo and the "start with a sample" essay. Frankenstein (1818) is public domain and widely assigned.
// The flaws are deliberate, so a check has real things to find:
//   P1 two thesis claims at once, neither arguable ("both are responsible in different ways"; "really about how society treats…")
//   P2 a quotation dropped in without analysis ("This quote is very important and shows…")
//   P3 comma splice ("stopped asking for sympathy, he is making threats"), wrong word ("effected" for "affected"), a sweeping
//      generalization ("Society has always rejected…"), and "which proves" claiming more than the evidence shows
//   P4 drifts off the thesis into biography and AI
//   P5 restates instead of concluding
//   Whole essay: under the prompt's 600-word minimum
export const SAMPLE_ESSAY_TITLE = "Who Is the Real Monster in Frankenstein?";

export const SAMPLE_PROMPT = `In a 600–800 word essay, argue who bears the greater moral responsibility for the tragedy in Mary Shelley's Frankenstein: Victor or the creature. Take a clear position. Support it with at least three quotations from the novel, each cited by chapter, and explain how each quotation supports your claim. MLA format.`;

export const SAMPLE_ESSAY_PARAGRAPHS = [
  `Mary Shelley's Frankenstein is a novel about a scientist who creates life and then abandons it. Ever since it was published in 1818, readers have argued about who is really to blame for everything that goes wrong. Victor Frankenstein builds the creature, but the creature is the one who actually kills people. In this essay I will show that both Victor and the creature are responsible in different ways, and that the novel is really about how society treats people who are different.`,
  `Victor's biggest mistake is that he abandons his creation the moment it comes to life. He spends almost two years working on it, "for the sole purpose of infusing life into an inanimate body" (Shelley ch. 5), and then runs away as soon as it opens its eyes. The creature wakes up alone, with no name, no language and no one to explain the world to him. When the creature finally confronts Victor on the glacier he says, "I ought to be thy Adam, but I am rather the fallen angel, whom thou drivest from joy for no misdeed" (Shelley ch. 10). This quote is very important and shows the creature's feelings about Victor.`,
  `The creature is not innocent either. After the De Lacey family rejects him he decides to take revenge on all of humanity, and especially on Victor. He murders William, frames Justine, and later kills Clerval and Elizabeth. He even tells Victor, "Beware; for I am fearless, and therefore powerful" (Shelley ch. 20). At this point in the novel the creature has stopped asking for sympathy, he is making threats. Society has always rejected what it does not understand, so it is not surprising that the creature turned violent. His crimes effected everyone around Victor, which proves that the creature had become a monster.`,
  `It is also interesting that Mary Shelley wrote the novel when she was only eighteen, after a ghost story contest with Lord Byron and Percy Shelley. Her mother, Mary Wollstonecraft, died shortly after she was born, so Shelley knew what it was like to grow up without a parent. Today people often compare Frankenstein to artificial intelligence, because we are also creating things we might not be able to control. These connections show how relevant the novel still is.`,
  `In conclusion, Victor is responsible for abandoning his creation and the creature is responsible for the murders he commits. The novel shows that both of them are to blame. Frankenstein teaches us that we should be careful about what we create and that we should treat others with kindness, because you never know what someone will become if they are rejected by everyone.`,
];

export const SAMPLE_ESSAY_TEXT = SAMPLE_ESSAY_PARAGRAPHS.join("\n\n");

/** The writing profile the sample ships with, so feedback is calibrated like a real assignment's. */
export const SAMPLE_PROFILE = { kind: "Literary analysis", course: "ENGL 101, first-year undergraduate", citation: "MLA", instructions: "" };
export const SAMPLE_TARGET_WORDS = 700;
