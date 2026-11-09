# AI-writing detector

The AI-sounding writing check now has a local detector at its core: a model trained on human and AI-written essays that runs in the browser, free, with no API key. The Claude wording check still runs on top and can raise a sentence; either signal can flag on its own.

## How detectors work (research, Nov 2026)

- **GPTZero** started with perplexity and burstiness from a GPT-2 model, and moved to a supervised deep classifier in 2023. Its technical report ([arXiv 2602.13042](https://arxiv.org/abs/2602.13042)) describes a hierarchical multi-task model (document label human / mixed / AI, plus a per-sentence head) trained on about 28.5M documents, with adversarial and paraphrase augmentation. It reports essay AUC 0.999 at under 1% false positives. Its own lightweight model, XGBoost on about 20 mined features, gets about 90% precision and recall.
- **Zero-shot methods** score text with an open model's token probabilities: perplexity, DetectGPT, and Binoculars ([arXiv 2401.12070](https://arxiv.org/abs/2401.12070)), which uses the ratio of perplexity to cross-perplexity between two models. Binoculars is strong on its own benchmarks, but GPTZero measured it at 0.835 AUC on essays from current models. These methods need token log-probabilities, which the Claude API doesn't expose, and running a 7B model pair isn't practical in a Vercel function or a browser.
- **Stylometry and lexical models** use word and n-gram usage, punctuation, rhythm, and the "excess vocabulary" models overuse (Kobak et al. 2024, [arXiv 2406.07016](https://arxiv.org/abs/2406.07016)). They are cheap, transparent, and strong in-domain, but they transfer less well to new generators.

Matching GPTZero needs its data and a neural model. This detector is the practical tier: a trained linear model whose every flag can be explained.

## The algorithm (`lib/ai-detector.ts`)

1. **Normalize** each sentence: straight quotes, one dash form, and citations, bracket references and URLs removed.
2. **Window**: score each sentence together with its neighbours in the same paragraph, one either side, as GPTZero's sentence head does.
3. **Sentence model**: logistic regression over
   - word and punctuation unigrams and bigrams, as window counts divided by √tokens (12,000 strongest weights kept), and
   - 18 style rates: sentence length and its variation across the window, word length, comma, semicolon, colon, paren, question, exclamation and quote rates, excess-vocabulary rate, transition openers, long words, digits, "the" and "and" rates, and type-token ratio.
4. **Essay model**: logistic regression over the sentence logits (mean, spread, share above zero) plus whole-essay rhythm (sentence- and paragraph-length variation) and excess-vocabulary rate. It is fit on out-of-fold sentence logits.
5. **Thresholds are set on human essays only.** A sentence is "possible" above the 97th percentile of human sentences and "likely" above the 99.5th. An essay is "AI" above the 99.5th percentile of human essays and "possibly AI-assisted" above the 98th.
6. **Evidence**: the highest-weighted AI-leaning words in a flagged sentence, stock vocabulary first, are quoted back and underlined.

These are deliberately left out. The training corpus's human essays are formal, so these features would teach "casual = AI" or, for dashes, the opposite of current models:
- contractions and first- and second-person pronouns (rates and n-grams)
- dashes (2023 models rarely used them; current ones use them constantly)

## Data and results

- **Training data:** the Ghostbuster essay corpus ([vivek3141/ghostbuster-data](https://github.com/vivek3141/ghostbuster-data)): 1,000 human college essays, plus 6,000 AI essays from GPT-3.5 (five prompt variants) and Claude (2023). 20 essays with chat preambles were dropped.
- **Splits:** by prompt, so a human essay and the AI essays written to the same prompt never straddle train and test.

| Test | Essay AUC | AI essays caught | Human essays called AI | Human essays called at least "possibly" |
|---|---|---|---|---|
| Held-out prompts, all generators (1,050 essays) | 0.997 | 96.7% | 2.0% (3 of 149) | 4.0% |
| Unseen generator: trained without Claude, tested on Claude (at the earlier 1% / 5% essay thresholds) | 0.961 | 61% (80% at least "possibly") | 1.3% | 5.4% |
| 8 essays from a 2026 model (4 assistant voice, 4 imitating a student) | — | 1 of 8 (2 of 8 at least "possibly") | — | — |

Sentence-level AUC is 0.96 on held-out prompts. About 3% of human sentences and 76% of AI sentences get flagged.

**Limits, plainly:**
- The model has only seen 2023-era AI text. It catches classic assistant prose, but it misses most current-model essays, and it misses nearly all AI text prompted to sound like a student.
- The Claude wording check is what covers current models. Its blend with the detector (either can flag) is not calibrated, because calibrating it needs labeled current-model essays scored through the API.
- The human false-positive figures come from about 150 test essays, so they are rough.

## Retraining

```bash
# 1. Features, computed by the app's own code so training and the browser match exactly
node --experimental-strip-types scripts/ai-detector/features.ts <ghostbuster>/essay features.jsonl [<extra dir> <label 0|1> ...]
# 2. Train and write lib/ai-detector-model.ts (about 7 minutes on an M2); --holdout <source> reports transfer to an unseen generator
python3 scripts/ai-detector/train.py features.jsonl lib/ai-detector-model.ts --C 0.5
```

The biggest gain available is adding current-model essays (Claude 5.x, GPT-5.x, Gemini), both default and "write like a student", together with real student essays on the same prompts. Pass them to `features.ts` as extra labelled folders.
