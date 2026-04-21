/**
 * Build static JSON artifacts for the website from:
 * - `federal-constitution/*.md` (current files + embedded header table metadata)
 * - Git history (`git log` / `git show`) for per-article version snapshots
 *
 * Why Git at build time?
 * The corpus is intentionally authored as a Git-shaped legal dataset: each amendment is a
 * commit. We materialize that history into JSON so the frontend can be a plain static site.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the repository root (one level above the `app/` folder).
 * Using `import.meta.url` keeps this correct regardless of which directory the
 * script is invoked from (e.g. `node app/scripts/generate-data.mjs` from repo
 * root, or `node scripts/generate-data.mjs` from inside `app/`).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

/** @typedef {{ outDir: string, articleLimit?: number }} CliOptions */

/**
 * @typedef {object} ArticleHeaderMeta
 * @property {string|null} title
 * @property {string|null} firstAdded
 * @property {string|null} lastUpdated
 * @property {string|null} sourceUrl
 * @property {Array<{ number: number, url: string }>} amendments
 */

/**
 * Parsed amendment metadata extracted from repository commit subjects.
 * `amendmentNumber === 0` means the original 1973 text baseline commit.
 *
 * @typedef {object} ParsedAmendmentSubject
 * @property {number|null} amendmentNumber
 * @property {string|null} amendmentLabel
 * @property {string|null} assentDate
 * @property {string|null} signer
 */

/**
 * @typedef {object} AmendmentIndexEntry
 * @property {string} commit
 * @property {string} authoredAt
 * @property {string} author
 * @property {string} subject
 * @property {number|null} amendmentNumber
 * @property {string|null} amendmentLabel
 * @property {string|null} assentDate
 * @property {string|null} signer
 * @property {string|null} summaryPath
 */

/**
 * @typedef {object} ArticleVersion
 * @property {string} commit
 * @property {string} authoredAt
 * @property {string} author
 * @property {string} subject
 * @property {number|null} amendmentNumber
 * @property {string|null} amendmentLabel
 * @property {string|null} assentDate
 * @property {string|null} signer
 * @property {string} content
 */

/**
 * Git `log` output is formatted as a record stream so we don't need to guess how to split
 * multi-line subjects. `%x1f` separates fields; `%x1e` terminates records.
 */
const GIT_RECORD_SEP = "\x1e";
const GIT_FIELD_SEP = "\x1f";

/** Maps commit subject ordinals ("Eighteenth") to numeric amendment numbers (18). */
const ORDINAL_TO_NUMBER = new Map([
  ["First", 1],
  ["Second", 2],
  ["Third", 3],
  ["Fourth", 4],
  ["Fifth", 5],
  ["Sixth", 6],
  ["Seventh", 7],
  ["Eighth", 8],
  ["Ninth", 9],
  ["Tenth", 10],
  ["Eleventh", 11],
  ["Twelfth", 12],
  ["Thirteenth", 13],
  ["Fourteenth", 14],
  ["Fifteenth", 15],
  ["Sixteenth", 16],
  ["Seventeenth", 17],
  ["Eighteenth", 18],
  ["Nineteenth", 19],
  ["Twentieth", 20],
  ["Twenty-first", 21],
  ["Twenty-second", 22],
  ["Twenty-third", 23],
  ["Twenty-fourth", 24],
  ["Twenty-fifth", 25],
  ["Twenty-sixth", 26],
  ["Twenty-seventh", 27],
]);

/**
 * Lowercase slug from summary filenames (e.g. "twenty-first") -> amendment number.
 * Built once so we don't repeatedly scan `ORDINAL_TO_NUMBER` keys.
 *
 * @type {Map<string, number>}
 */
const SLUG_TO_AMENDMENT_NUMBER = (() => {
  const m = new Map();
  for (const [ordinal, n] of ORDINAL_TO_NUMBER) {
    m.set(ordinal.toLowerCase().replaceAll(" ", "-"), n);
  }
  return m;
})();

// --- Small filesystem helpers -------------------------------------------------

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {string} filePath
 * @param {unknown} data
 */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/**
 * @param {string} dirPath
 * @param {string} label Human-readable name for error messages
 */
function assertDirExists(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} not found or not a directory: ${dirPath}`);
  }
}

// --- Git helpers --------------------------------------------------------------

/**
 * Run `git` and return stdout as a string.
 *
 * We use `spawnSync` (not `execFileSync`) so we can reliably control stdio. In particular,
 * `git show missing-path` writes a `fatal: ...` message to stderr; for expected failures we
 * discard stderr to keep the build output clean.
 *
 * @param {string[]} args
 * @param {{ okStatuses?: number[], maxBufferBytes?: number }} [opts]
 * @returns {{ ok: true, stdout: string } | { ok: false, stderr: string, status: number|null }}
 */
function runGit(args, opts = {}) {
  const okStatuses = opts.okStatuses ?? [0];
  const maxBufferBytes = opts.maxBufferBytes ?? 200 * 1024 * 1024;

  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: maxBufferBytes,
    windowsHide: true,
    // Run git from the repo root so paths in log/show are resolved correctly
    // regardless of which directory the script was invoked from.
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const status = result.status;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (result.error) {
    return { ok: false, stderr: String(result.error), status: status ?? null };
  }

  if (status == null || !okStatuses.includes(status)) {
    return { ok: false, stderr: stderr.trim() || `git failed (${status})`, status };
  }

  return { ok: true, stdout };
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function gitOrThrow(args) {
  const r = runGit(args);
  if (!r.ok) {
    throw new Error(r.stderr);
  }
  return r.stdout;
}

/**
 * `git show <commit>:<path>` when the path doesn't exist at that commit is an expected case
 * here: `git log --follow` can include pre-history from renames/splits where the blob isn't
 * present at the earliest commit in the simplified history.
 *
 * @param {string} commit
 * @param {string} repoRelPath
 * @returns {string|null}
 */
function tryGitShowPath(commit, repoRelPath) {
  const r = runGit(["show", `${commit}:${repoRelPath}`], { okStatuses: [0, 128] });
  if (!r.ok) return null;
  return r.stdout;
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
function splitGitRecords(raw) {
  return raw
    .split(GIT_RECORD_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

// --- CLI ----------------------------------------------------------------------

/**
 * Supports:
 * - `--out <dir>` (default: `public/data`)
 * - `--limit <n>` or `--limit=<n>` or a bare integer (useful when `npm` eats flags)
 *
 * @param {string[]} argv
 * @returns {CliOptions}
 */
function parseCliArgs(argv) {
  /** @type {CliOptions} */
  const out = { outDir: "public/data", articleLimit: undefined };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    const limitEq = a.match(/^--limit=(\d+)$/);
    if (limitEq) {
      out.articleLimit = Number(limitEq[1]);
      continue;
    }

    // `npm run` historically mishandles some `--flag` forms; bare integers remain a pragmatic escape hatch.
    if (/^\d+$/.test(a) && out.articleLimit === undefined) {
      out.articleLimit = Number(a);
      continue;
    }

    if (a === "--out") {
      const v = argv[i + 1];
      if (!v) throw new Error("--out requires a directory argument");
      out.outDir = v;
      i++;
      continue;
    }

    if (a === "--limit") {
      const v = argv[i + 1];
      if (!v) throw new Error("--limit requires a number");
      out.articleLimit = Number(v);
      i++;
      continue;
    }
  }

  return out;
}

/**
 * @param {number|undefined} n
 * @returns {number|undefined}
 */
function normalizeNonNegativeInt(n) {
  if (n === undefined) return undefined;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

// --- Parsing: commit subjects -------------------------------------------------

/**
 * Commit subjects in this repo are intentionally regular:
 * - `Original Constitution YYYY-MM-DD <Signer>`
 * - `<Ordinal> Amendment YYYY-MM-DD <Signer>`
 *
 * @param {string} subject
 * @returns {ParsedAmendmentSubject | null}
 */
function parseAmendmentSubject(subject) {
  if (subject.startsWith("Original Constitution")) {
    const rest = subject.slice("Original Constitution".length).trim();
    const m = rest.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    return {
      amendmentNumber: 0,
      amendmentLabel: "Original Constitution",
      assentDate: m?.[1] ?? null,
      signer: m?.[2] ?? null,
    };
  }

  const m = subject.match(
    /^(?<ordinal>.+?) Amendment (?<date>\d{4}-\d{2}-\d{2}) (?<signer>.+)$/
  );
  if (!m?.groups) return null;

  const ordinal = m.groups.ordinal;
  const num = ORDINAL_TO_NUMBER.get(ordinal) ?? null;
  return {
    amendmentNumber: num,
    amendmentLabel: `${ordinal} Amendment`,
    assentDate: m.groups.date,
    signer: m.groups.signer,
  };
}

// --- Parsing: article header table --------------------------------------------

/**
 * Each article begins with a Markdown pipe-table of metadata. We only parse the contiguous
 * table at the top of the file (stops at the first blank line).
 *
 * @param {string} md
 * @returns {ArticleHeaderMeta}
 */
function parseMdHeaderTable(md) {
  const lines = md.split(/\r?\n/);
  /** @type {Array<[string, string]>} */
  const pairs = [];

  for (const line of lines) {
    if (!line.trim()) break;
    if (!line.trim().startsWith("|")) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;

    const key = cells[0];
    const value = cells[1];
    if (!key || !value) continue;

    // Skip separator row variants; filenames differ slightly across articles.
    if (/^-+$/.test(key) || /^-+$/.test(value)) continue;

    pairs.push([key, value]);
  }

  /** @type {ArticleHeaderMeta} */
  const meta = {
    title: null,
    firstAdded: null,
    lastUpdated: null,
    sourceUrl: null,
    amendments: [],
  };

  for (const [k, v] of pairs) {
    if (k === "Title") meta.title = v;
    else if (k === "First Added") meta.firstAdded = v;
    else if (k === "Last Updated") meta.lastUpdated = v;
    else if (k === "Source") meta.sourceUrl = v;
    else {
      const am = k.match(/^Amendment\s+(\d+)$/);
      if (am) meta.amendments.push({ number: Number(am[1]), url: v });
    }
  }

  return meta;
}

/**
 * @param {string} filename
 * @returns {{ id: string, number: number, suffix: string|null } | null}
 */
function parseArticleFilename(filename) {
  const m = filename.match(/^article-(\d{3})(?:-([A-Z]))?\.md$/);
  if (!m) return null;

  const padded = m[1];
  const suffix = m[2] ? m[2].toLowerCase() : null;
  const id = suffix ? `article-${padded}-${suffix}` : `article-${padded}`;

  return { id, number: Number(padded), suffix };
}

// --- Amendment summaries index ------------------------------------------------

/**
 * Summary files are loosely named; we match a trailing `-<ordinal>-amendment.md` slug and map
 * it to a numeric amendment id. Original constitution is special-cased by filename substring.
 *
 * @param {string} summariesDir
 * @returns {Map<number, { path: string, filename: string }>}
 */
function buildSummaryFileIndex(summariesDir) {
  const files = fs.readdirSync(summariesDir).filter((f) => f.endsWith(".md"));
  /** @type {Map<number, { path: string, filename: string }>} */
  const byAmendmentNumber = new Map();

  for (const f of files) {
    const lower = f.toLowerCase();

    if (lower.includes("original-constitution")) {
      byAmendmentNumber.set(0, { path: `federal-ammendment-summaries/${f}`, filename: f });
      continue;
    }

    const m = lower.match(
      /-(first|second|third|fourth|fifth|sixth|seventh|eighth|eigth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|twenty-second|twenty-third|twenty-fourth|twenty-fifth|twenty-sixth|twenty-seventh)-amendment\.md$/
    );
    if (!m) continue;

    const n = SLUG_TO_AMENDMENT_NUMBER.get(m[1]);
    if (!n) continue;

    byAmendmentNumber.set(n, { path: `federal-ammendment-summaries/${f}`, filename: f });
  }

  return byAmendmentNumber;
}

/**
 * @param {number|null} amendmentNumber
 * @param {Map<number, { path: string, filename: string }>} summaryIndex
 * @returns {string|null}
 */
function resolveSummaryPath(amendmentNumber, summaryIndex) {
  if (amendmentNumber == null) return null;
  return summaryIndex.get(amendmentNumber)?.path ?? null;
}

// --- Git -> domain objects ----------------------------------------------------

/**
 * @returns {{ amendments: AmendmentIndexEntry[], byCommit: Map<string, AmendmentIndexEntry> }}
 */
function loadAmendmentIndexFromGit() {
  const raw = gitOrThrow([
    "log",
    "--reverse",
    `--format=%H${GIT_FIELD_SEP}%aI${GIT_FIELD_SEP}%s${GIT_FIELD_SEP}%an${GIT_RECORD_SEP}`,
  ]);

  /** @type {AmendmentIndexEntry[]} */
  const amendments = [];
  /** @type {Map<string, AmendmentIndexEntry>} */
  const byCommit = new Map();

  for (const record of splitGitRecords(raw)) {
    const [hash, authoredIso, subject, authorName] = record.split(GIT_FIELD_SEP);
    const parsed = parseAmendmentSubject(subject);

    /** @type {AmendmentIndexEntry} */
    const entry = {
      commit: hash,
      authoredAt: authoredIso,
      author: authorName,
      subject,
      amendmentNumber: parsed?.amendmentNumber ?? null,
      amendmentLabel: parsed?.amendmentLabel ?? null,
      assentDate: parsed?.assentDate ?? null,
      signer: parsed?.signer ?? null,
      summaryPath: null,
    };

    amendments.push(entry);
    byCommit.set(hash, entry);
  }

  return { amendments, byCommit };
}

/**
 * @param {string} repoRelPath
 * @returns {Array<{ commit: string, authoredAt: string, author: string, subject: string }>}
 */
function listCommitsTouchingFile(repoRelPath) {
  const raw = gitOrThrow([
    "log",
    "--follow",
    `--format=%H${GIT_FIELD_SEP}%aI${GIT_FIELD_SEP}%an${GIT_FIELD_SEP}%s${GIT_RECORD_SEP}`,
    "--",
    repoRelPath,
  ]);

  // `git log` returns newest-first; we reverse to chronological order for reader UX.
  return splitGitRecords(raw).map((record) => {
    const [hash, authoredIso, authorName, subject] = record.split(GIT_FIELD_SEP);
    return { commit: hash, authoredAt: authoredIso, author: authorName, subject };
  }).reverse();
}

/**
 * @param {AmendmentIndexEntry|null|undefined} amendment
 * @param {{ commit: string, authoredAt: string, author: string, subject: string }} commitRow
 * @param {string} content
 * @returns {ArticleVersion}
 */
function toArticleVersion(amendment, commitRow, content) {
  return {
    commit: commitRow.commit,
    authoredAt: commitRow.authoredAt,
    author: commitRow.author,
    subject: commitRow.subject,
    amendmentNumber: amendment?.amendmentNumber ?? null,
    amendmentLabel: amendment?.amendmentLabel ?? null,
    assentDate: amendment?.assentDate ?? null,
    signer: amendment?.signer ?? null,
    content,
  };
}

/**
 * @param {ArticleVersion[]} versions
 * @returns {Array<{ commit: string, assentDate: string|null, amendmentNumber: number|null, amendmentLabel: string|null }>}
 */
function toPublicVersionIndex(versions) {
  return versions.map((v) => ({
    commit: v.commit,
    assentDate: v.assentDate,
    amendmentNumber: v.amendmentNumber,
    amendmentLabel: v.amendmentLabel,
  }));
}

/**
 * @param {{ id: string, number: number, suffix: string|null, path: string }} articleIds
 * @param {ArticleHeaderMeta} header
 * @param {ArticleVersion[]} versions
 */
function buildArticlesJsonRow(articleIds, header, versions) {
  return {
    id: articleIds.id,
    number: articleIds.number,
    suffix: articleIds.suffix,
    path: articleIds.path,
    title: header.title,
    firstAdded: header.firstAdded,
    lastUpdated: header.lastUpdated,
    amendments: header.amendments,
    versions: toPublicVersionIndex(versions),
  };
}

// --- Main ---------------------------------------------------------------------

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const articleLimit = normalizeNonNegativeInt(args.articleLimit);

  const repoRoot = REPO_ROOT;
  // Source corpus always lives in the repo root, not inside `app/`.
  const constitutionDir = path.join(repoRoot, "federal-constitution");
  const summariesDir = path.join(repoRoot, "federal-ammendment-summaries");
  // Output goes into `app/public/data` so Astro picks it up as a static asset.
  // `args.outDir` is a relative default ("public/data"); resolve it from
  // the `app/` folder, not from `process.cwd()`, so it lands in the right place.
  const appDir = path.resolve(__dirname, "..");
  const outDir = path.isAbsolute(args.outDir)
    ? args.outDir
    : path.join(appDir, args.outDir);
  const outArticlesDir = path.join(outDir, "articles");

  assertDirExists(constitutionDir, "federal-constitution");
  assertDirExists(summariesDir, "federal-ammendment-summaries");

  ensureDir(outDir);
  ensureDir(outArticlesDir);

  const { amendments, byCommit } = loadAmendmentIndexFromGit();
  const summaryIndex = buildSummaryFileIndex(summariesDir);

  /** @type {AmendmentIndexEntry[]} */
  const amendmentsOut = amendments.map((a) => ({
    ...a,
    summaryPath: resolveSummaryPath(a.amendmentNumber, summaryIndex),
  }));

  writeJson(path.join(outDir, "amendments.json"), {
    generatedAt: new Date().toISOString(),
    amendments: amendmentsOut,
  });

  const articleFiles = fs
    .readdirSync(constitutionDir)
    .filter((f) => f.endsWith(".md") && f.startsWith("article-"))
    .sort((a, b) => a.localeCompare(b));

  const limitedFiles =
    articleLimit !== undefined ? articleFiles.slice(0, articleLimit) : articleFiles;

  /** @type {ReturnType<typeof buildArticlesJsonRow>[]} */
  const articlesIndex = [];

  for (const filename of limitedFiles) {
    const parsed = parseArticleFilename(filename);
    if (!parsed) continue;

    const relPath = `federal-constitution/${filename}`;
    const md = fs.readFileSync(path.join(constitutionDir, filename), "utf8");
    const header = parseMdHeaderTable(md);

    /** @type {ArticleVersion[]} */
    const versions = [];

    for (const c of listCommitsTouchingFile(relPath)) {
      const amendment = byCommit.get(c.commit);
      const content = tryGitShowPath(c.commit, relPath);
      if (content == null) continue;

      versions.push(toArticleVersion(amendment, c, content));
    }

    const articleOut = {
      id: parsed.id,
      number: parsed.number,
      suffix: parsed.suffix,
      path: relPath,
      meta: header,
      versions,
    };

    writeJson(path.join(outArticlesDir, `${parsed.id}.json`), articleOut);
    articlesIndex.push(
      buildArticlesJsonRow(
        { id: parsed.id, number: parsed.number, suffix: parsed.suffix, path: relPath },
        header,
        versions
      )
    );
  }

  writeJson(path.join(outDir, "articles.json"), {
    generatedAt: new Date().toISOString(),
    count: articlesIndex.length,
    articles: articlesIndex,
  });

  console.log(
    `Generated ${articlesIndex.length} article JSON files into ${path.relative(repoRoot, outDir)}`
  );
}

main();
