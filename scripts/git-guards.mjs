#!/usr/bin/env node
// Garde-fous git du projet (mêmes règles que le backend), utilisés par les hooks .githooks et la CI.
//
// Usage :
//   node scripts/git-guards.mjs branch [NOM]               # branche courante si omis
//   node scripts/git-guards.mjs commit-msg FICHIER         # hook commit-msg
//   node scripts/git-guards.mjs files-limit [--base REF] [--max N] [--include-staged]
//   node scripts/git-guards.mjs protect                    # refuse un commit direct sur main

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MAX_FILES_PER_BRANCH = 20;
export const MAX_SUBJECT_LENGTH = 100;
export const TYPES = ["feat", "fix", "chore", "ci", "docs", "test", "refactor", "perf", "build"];
const PROTECTED_BRANCHES = new Set(["main"]);

const KEBAB = "[a-z0-9]+(?:-[a-z0-9]+)*";
const BRANCH_RE = new RegExp(`^(?:${TYPES.join("|")})/${KEBAB}$`);
const SUBJECT_RE = new RegExp(`^(?:${TYPES.join("|")})\\(${KEBAB}\\): \\S.*$`);
const MERGE_RE = /^(?:Merge|Revert) /;

const BRANCH_HELP =
  "Format attendu : <type>/<cas-d-usage> en kebab-case, ex. feat/admin-services. " +
  `Types : ${TYPES.join(", ")}.`;
const COMMIT_HELP =
  "Format attendu : <type>(<cas-d-usage>): <tâche effectuée>, " +
  "ex. feat(admin-services): liste des services. " +
  `Types : ${TYPES.join(", ")}. Sujet ≤ ${MAX_SUBJECT_LENGTH} caractères.`;

/** @returns {string | null} message d'erreur, ou null si le nom est valide */
export function validateBranchName(name) {
  if (PROTECTED_BRANCHES.has(name) || BRANCH_RE.test(name)) return null;
  return `Nom de branche invalide : '${name}'. ${BRANCH_HELP}`;
}

/** Valide la première ligne utile (les commentaires git « # » sont ignorés). */
export function validateCommitMessage(message) {
  const lines = message.split(/\r?\n/).filter((line) => !line.startsWith("#"));
  const subject = (lines[0] ?? "").trimEnd();
  if (MERGE_RE.test(subject)) return null;
  if ([...subject].length > MAX_SUBJECT_LENGTH) {
    return `Sujet trop long (${[...subject].length} caractères). ${COMMIT_HELP}`;
  }
  if (!SUBJECT_RE.test(subject)) return `Message de commit invalide : '${subject}'. ${COMMIT_HELP}`;
  if (lines.length > 1 && lines[1].trim()) {
    return (
      "Le sujet doit être suivi d'une ligne vide avant le corps du message " +
      "(sinon git fusionne le corps dans le sujet)."
    );
  }
  return null;
}

/** @param {Set<string>} files */
export function checkFileLimit(files, limit = MAX_FILES_PER_BRANCH) {
  if (files.size <= limit) return null;
  const listing = [...files].sort().map((f) => `  - ${f}`).join("\n");
  return (
    `${files.size} fichiers modifiés sur cette branche (limite : ${limit}).\n` +
    `Découpez le travail en plusieurs branches.\n${listing}`
  );
}

// ------------------------------------------------------------------ git I/O
function git(...args) {
  // Binaire git appelé sans shell, arguments en liste.
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function currentBranch() {
  return git("rev-parse", "--abbrev-ref", "HEAD");
}

function resolveBase(preferred) {
  const candidates = preferred ? [preferred] : ["origin/main", "main"];
  for (const ref of candidates) {
    try {
      git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
      return ref;
    } catch {
      // référence suivante
    }
  }
  throw new Error(`Référence de base introuvable parmi : ${candidates.join(", ")}`);
}

function changedFiles(base, includeStaged) {
  const mergeBase = git("merge-base", base, "HEAD");
  const files = new Set(git("diff", "--name-only", mergeBase, "HEAD").split("\n"));
  if (includeStaged) {
    for (const f of git("diff", "--name-only", "--cached", mergeBase).split("\n")) files.add(f);
  }
  files.delete("");
  return files;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function main(argv) {
  const [command, ...args] = argv;
  let error = null;
  if (command === "branch") {
    error = validateBranchName(args[0] ?? currentBranch());
  } else if (command === "commit-msg") {
    error = validateCommitMessage(readFileSync(args[0], "utf8"));
  } else if (command === "protect") {
    const branch = currentBranch();
    if (PROTECTED_BRANCHES.has(branch)) {
      error = `Commit direct sur '${branch}' interdit : créez une branche <type>/<cas-d-usage>.`;
    }
  } else if (command === "files-limit") {
    if (PROTECTED_BRANCHES.has(currentBranch())) return 0;
    const max = Number(option(args, "--max") ?? MAX_FILES_PER_BRANCH);
    const files = changedFiles(resolveBase(option(args, "--base")), args.includes("--include-staged"));
    error = checkFileLimit(files, max);
  } else {
    error = "Commande inconnue : branch | commit-msg | files-limit | protect";
  }
  if (error) {
    console.error(`✖ ${error}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
