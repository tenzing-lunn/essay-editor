"""Train the local AI-writing detector from features.ts output and write lib/ai-detector-model.ts.

Usage: python3 scripts/ai-detector/train.py <features.jsonl> <out model .ts> [--holdout claude] [--C 0.5]

Sentence model: logistic regression over a sentence and its paragraph neighbours (n-gram counts / sqrt(tokens) + style rates).
Essay model: logistic regression over the sentence logits' mean, spread and share above zero plus whole-essay rhythm,
fit on out-of-fold sentence logits so it learns from scores like the ones it will see on new essays.
Thresholds are set on held-out human essays so a human writer is rarely flagged.
"""
import argparse, json, sys, time, zlib
from array import array
import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

# Register is not authorship: the corpus's human essays are formal, so contractions and I/you would teach "casual = AI".
# Those rates and every n-gram containing a contraction or a first/second-person pronoun are left out.
# Dashes too: the corpus's 2023 models almost never used them, so it teaches "dash = human", the opposite of current models.
NUMERIC = ["sentWords", "logSentWords", "windowLenCv", "wordLen", "commaRate", "semicolonRate", "colonRate", "parenRate", "questionRate",
           "exclaimRate", "quoteRate", "excessRate", "transitionShare", "longWordRate", "digitRate", "theRate", "andRate", "ttr"]
DOC = ["meanLogit", "sdLogit", "shareAbove", "sentLenCv", "paraLenCv", "excessRate"]
REGISTER = {"i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "you", "your", "yours", "yourself"}


def register(gram):
    return any(t in REGISTER or t == "—" or ("'" in t and not t.endswith("'s")) or t in ("it's", "that's", "there's", "here's", "what's", "he's", "she's", "let's", "who's")
               for t in gram.split(" "))

ap = argparse.ArgumentParser()
ap.add_argument("features"); ap.add_argument("out")
ap.add_argument("--holdout", default="", help="train without this source and report how well the model transfers to it")
ap.add_argument("--C", type=float, default=0.5)
ap.add_argument("--min-df", type=int, default=8)
ap.add_argument("--keep", type=int, default=12000, help="n-gram weights kept in the shipped model")
args = ap.parse_args()

docs = [json.loads(l) for l in open(args.features)]
for d in docs:
    if args.holdout and d["source"] == args.holdout:
        d["split"] = "holdout"
print(f"{len(docs)} essays", {s: sum(d['split'] == s for d in docs) for s in ['train', 'val', 'test', 'holdout', 'probe']}, file=sys.stderr)

# Vocabulary: n-grams in at least min-df training essays.
df = {}
for d in docs:
    if d["split"] != "train":
        continue
    for g in {g for s in d["sentences"] for g in s["grams"]}:
        df[g] = df.get(g, 0) + 1
vocab = {g: i for i, g in enumerate(sorted(g for g, n in df.items() if n >= args.min_df and not register(g)))}
V = len(vocab)
print(f"vocabulary {V}", file=sys.stderr)


def windows(ds):
    """Sparse window matrix, numeric window features, labels and essay index per sentence."""
    rows, cols, vals, num, y, owner = array('i'), array('i'), array('f'), [], [], []
    r = 0
    for k, d in enumerate(ds):
        sents = d["sentences"]
        for s in sents:
            scale = 1 / np.sqrt(max(1, s["tokens"]))
            acc = {}
            for j in s["win"]:
                for g, c in sents[j]["grams"].items():
                    i = vocab.get(g)
                    if i is not None:
                        acc[i] = acc.get(i, 0) + c
            for i, c in acc.items():
                rows.append(r); cols.append(i); vals.append(c * scale)
            num.append([s["num"][n] for n in NUMERIC]); y.append(d["label"]); owner.append(k)
            r += 1
    X = sparse.csr_matrix((np.frombuffer(vals, dtype=np.float32), (np.frombuffer(rows, dtype=np.int32), np.frombuffer(cols, dtype=np.int32))), shape=(r, V), dtype=np.float32)
    return X, np.array(num, dtype=np.float64), np.array(y), np.array(owner)


def by(split):
    return [d for d in docs if d["split"] == split]


t = time.time()
train, val, test = by("train"), by("val"), by("test")


def fit(X, y, C):
    m = LogisticRegression(C=C, class_weight="balanced", max_iter=3000, solver="liblinear")
    m.fit(X, y)
    return m


def doc_features(ds, logits, owner):
    out = []
    for k, d in enumerate(ds):
        l = logits[owner == k]
        out.append([l.mean(), l.std(), (l > 0).mean()] + [d["doc"][n] for n in DOC[3:]])
    return np.array(out)


def tpr_at(y, p, fpr):
    thr = np.quantile(p[y == 0], 1 - fpr)
    return (p[y == 1] > thr).mean(), thr


# Out-of-fold sentence logits on train+val essays, for the essay model and the thresholds.
fit_docs = train + val
groups = np.array([zlib.crc32((d["id"] if d["source"] == "claude" else d["id"].split("/")[-1]).encode()) % 5 for d in fit_docs])
Xf, Nf, yf, of = windows(fit_docs)
mu, sd = Nf.mean(0), Nf.std(0) + 1e-9
def full(X, N): return sparse.hstack([X, sparse.csr_matrix((N - mu) / sd)]).tocsr()
print(f"windows {Xf.shape} nnz {Xf.nnz} in {time.time() - t:.0f}s", file=sys.stderr)
Ff = full(Xf, Nf)
oof = np.zeros(len(yf))
for k in range(5):
    test_rows = np.isin(of, np.where(groups == k)[0])
    oof[test_rows] = fit(Ff[~test_rows], yf[~test_rows], args.C).decision_function(Ff[test_rows])
    print(f"fold {k} done {time.time() - t:.0f}s", file=sys.stderr)
print(f"out-of-fold sentence AUC {roc_auc_score(yf, oof):.4f}", file=sys.stderr)

# The shipped sentence model: all train+val essays, then keep the strongest n-gram weights.
model = fit(Ff, yf, args.C)
w = model.coef_[0].copy()
ng = w[:V]
if args.keep < V:
    cut = np.sort(np.abs(ng))[-args.keep]
    ng[np.abs(ng) < cut] = 0
w[:V] = ng
bias = float(model.intercept_[0])

Dof = doc_features(fit_docs, oof, of)
ydf = np.array([d["label"] for d in fit_docs])
dmu, dsd = Dof.mean(0), Dof.std(0) + 1e-9
doc_model = LogisticRegression(C=1.0, class_weight="balanced", max_iter=2000).fit((Dof - dmu) / dsd, ydf)
p_oof = doc_model.predict_proba((Dof - dmu) / dsd)[:, 1]

# Thresholds from human writing only: sentence flags at ~3% / 0.5% of human sentences, essay verdicts at 0.5% / 2% of human essays.
# A false accusation costs a student far more than a missed one costs anyone, so the essay verdicts sit at the strict end.
human_sent = oof[yf == 0]
human_doc = p_oof[ydf == 0]
thresholds = {
    "sentencePossible": float(np.quantile(human_sent, 0.97)),
    "sentenceLikely": float(np.quantile(human_sent, 0.995)),
    "docAi": float(np.quantile(human_doc, 0.995)),
    "docMixed": float(np.quantile(human_doc, 0.98)),
}


def score(ds):
    X, N, y, o = windows(ds)
    logits = full(X, N) @ w + bias
    D = doc_features(ds, logits, o)
    p = doc_model.predict_proba((D - dmu) / dsd)[:, 1]
    return logits, y, p, np.array([d["label"] for d in ds]), np.array([d["source"] for d in ds])


def report(name, ds):
    if not ds:
        return
    logits, ys, p, yd, src = score(ds)
    line = {"set": name, "essays": len(ds)}
    if len(set(yd)) == 2:
        line["essayAUC"] = round(roc_auc_score(yd, p), 4)
        line["sentenceAUC"] = round(roc_auc_score(ys, logits), 4)
    line["humanFlaggedAI"] = round(float((p[yd == 0] >= thresholds["docAi"]).mean()), 4) if (yd == 0).any() else None
    line["humanFlaggedMixedOrAI"] = round(float((p[yd == 0] >= thresholds["docMixed"]).mean()), 4) if (yd == 0).any() else None
    line["aiCaught"] = round(float((p[yd == 1] >= thresholds["docAi"]).mean()), 4) if (yd == 1).any() else None
    line["aiCaughtMixedOrAI"] = round(float((p[yd == 1] >= thresholds["docMixed"]).mean()), 4) if (yd == 1).any() else None
    line["humanSentencesFlagged"] = round(float((logits[ys == 0] >= thresholds["sentencePossible"]).mean()), 4) if (ys == 0).any() else None
    line["aiSentencesFlagged"] = round(float((logits[ys == 1] >= thresholds["sentencePossible"]).mean()), 4) if (ys == 1).any() else None
    if (yd == 1).any():
        line["aiCaughtBySource"] = {s: round(float((p[(yd == 1) & (src == s)] >= thresholds["docAi"]).mean()), 3) for s in sorted(set(src[yd == 1]))}
    print(json.dumps(line))
    return p


report("test", test)
human_test = [d for d in test if d["label"] == 0]
report("holdout", by("holdout") + human_test if by("holdout") else [])
probe = by("probe")
if probe:
    p = report("probe", probe)
    for d, pp in zip(probe, p):
        print(f"  probe {d['id']}: {pp:.3f}", file=sys.stderr)

nz = {g: round(float(w[i]), 4) for g, i in vocab.items() if w[i] != 0}
out = {
    "version": time.strftime("%Y-%m-%d") + (f"-no-{args.holdout}" if args.holdout else ""),
    "ngrams": nz,
    "numeric": {"names": NUMERIC, "mean": mu.round(6).tolist(), "std": sd.round(6).tolist(), "weights": w[V:].round(5).tolist()},
    "bias": round(bias, 5),
    "doc": {"names": DOC, "mean": dmu.round(6).tolist(), "std": dsd.round(6).tolist(), "weights": doc_model.coef_[0].round(5).tolist(), "bias": round(float(doc_model.intercept_[0]), 5)},
    "thresholds": {k: round(v, 5) for k, v in thresholds.items()},
}
with open(args.out, "w") as f:
    f.write("// Generated by scripts/ai-detector/train.py from the Ghostbuster essay corpus (human college essays vs GPT-3.5 and Claude essays). Do not edit.\n")
    f.write('import type { DetectorModel } from "./ai-detector.ts";\n\n')
    f.write("export const DETECTOR_MODEL: DetectorModel = " + json.dumps(out, separators=(",", ":")) + ";\n")
print(f"wrote {args.out}: {len(nz)} n-grams, top AI {sorted(nz, key=nz.get)[-15:]}, top human {sorted(nz, key=nz.get)[:15]}", file=sys.stderr)
print("numeric", dict(zip(NUMERIC, w[V:].round(3))), file=sys.stderr)
print("doc", dict(zip(DOC, doc_model.coef_[0].round(3))), "thresholds", thresholds, file=sys.stderr)
