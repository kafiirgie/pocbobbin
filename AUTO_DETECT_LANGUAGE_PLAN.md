# Automatic language-adapter detection plan

## Goal

Select the configured language adapter automatically when a repository does not
provide `behavior.json`, while keeping explicit configuration authoritative and
supporting repositories that contain more than one language.

## Behavior

1. If `behavior.json` exists, use it exactly as today.
2. Otherwise inspect repository manifests and source extensions while ignoring
   dependency/build directories.
3. Detect one or more supported languages. A mixed repository is represented by
   `languages: [...]`; the first language is the primary runtime/test profile.
4. Run static impact analysis once per selected adapter and merge changed
   symbols, edges, paths, and unknowns without duplicates. Cross-language calls
   remain unknown unless an adapter can resolve them.
5. If no known language evidence exists, preserve the legacy Python defaults for
   an empty/legacy Python repository. Detected languages are ordered
   deterministically so mixed repositories do not fail merely because they are
   mixed; explicit configuration remains necessary for unsupported languages or
   a custom primary runtime profile.

## Configuration contract

- Existing `language` remains valid for single-language repositories.
- New `languages` accepts a non-empty array of language names and aliases.
- Explicit `extensions`, test commands, reporters, probes, and test patterns
  continue to override defaults.
- Automatic detection never guesses a test command when the repository has an
  explicit configuration; the primary detected language supplies defaults only.

## Verification

- Unit tests cover manifest/extension detection, explicit-config precedence,
  mixed-language selection, ambiguity, ignored directories, and merged impact.
- Existing Python and single-language adapter tests remain green.
- The CLI is exercised against a TypeScript repository without modifying it.
