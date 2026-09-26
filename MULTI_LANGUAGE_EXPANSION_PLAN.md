# Multi-Language Expansion Plan

Status: implementation in progress. The language configuration, Tree-sitter adapters, common
report parsers, and command-probe harness are implemented on this branch; real compiler/toolchain
fixtures and report/viewer integration remain release gates.

Base branch: `feat/multi-language-support`

## Objective

Expand the Behavior Review engine beyond Python, TypeScript, and JavaScript with two controlled language groups:

1. **Group 2:** Java, C#, and Go.
2. **Group 3:** C++, C, Rust, and PHP.
3. **Group 4:** Kotlin, Ruby, Swift, Dart, and Bash.

The product must continue to report verified evidence, not guesses. Every adapter must preserve the shared concepts: changed symbols, resolved impact paths, unknown edges, paired base/head execution, inconclusive setup failures, and human decisions.

Current progress:

- [x] Language registry and safe defaults for all twelve expansion languages.
- [x] Explicit adapter registry for Python plus all configured Tree-sitter languages.
- [x] Tree-sitter symbol/call extraction and fixtures for Java, C#, Go, C++, C, Rust, PHP, Kotlin, Ruby, Swift, Dart, and Bash.
- [x] Cross-file import fixtures for Java, C#, and Go.
- [x] JUnit/TRX, Go JSON, CTest, Cargo, and PHPUnit result parsers.
- [x] Generic command probe harness for compiled-language repositories.
- [x] Report parsers for RSpec JSON, Swift text, Dart JSON, and shell test output.
- [ ] Real compiler/toolchain fixtures for every language in a matching CI environment.
- [ ] Canonical report/viewer integration and final demo evidence.

## Important boundary

“Supported” means that a language has all of these pieces:

- source parser and symbol extractor
- import/module/include resolver
- caller and impact graph builder
- test command and result parser
- probe harness or documented repository-specific probe command
- real fixture coverage for changed output and exception behavior
- visible unknown/inconclusive handling

A parser-only integration is not full language support.

## Architecture before adding languages

### 1. Freeze the shared contract

Do not create language-specific report schemas. Keep `app/schemas.py` authoritative and add only shared fields if A approves them.

The adapter boundary should conceptually provide:

```text
analyze(pair, config) -> changed symbols, impact paths, unknowns
run_tests(checkout, config) -> structured test result
run_probe(checkout, config) -> structured base/head observation
```

Each adapter identifies its language, extensions, parser, resolver, test runner, and probe runner through configuration.

### 2. Separate static analysis from execution

Static analysis may resolve a path, but only a real process result can provide behavior evidence. Missing imports, build errors, setup failures, timeouts, and nondeterministic runs remain `inconclusive`.

### 3. Use Tree-sitter only as the syntax layer

Tree-sitter can provide syntax nodes. Resolution rules remain language-specific, especially for packages, namespaces, modules, generated code, macros, reflection, and dynamic dispatch.

## Group 2 — Java, C#, and Go

Implement these adapters first because they have strong module boundaries, mature test tools, and relatively explicit call/import syntax.

### Java

- Extensions: `.java`
- Syntax: classes, interfaces, methods, constructors, calls, imports, packages
- Resolution: package declarations, source roots, imports, static imports, nested classes
- Test runners: Maven Surefire or Gradle test reports; do not rely only on console text
- Probe strategy: a committed Java probe executed through the configured build tool
- Unknown cases: reflection, generated sources, dependency calls outside the checkout, overloaded calls that cannot be resolved

Acceptance fixture:

```text
src/main/java/.../Discount.java:apply
src/main/java/.../Invoice.java:total -> Discount.apply
src/test/java/.../InvoiceTest.java
```

Required evidence:

- changed method detected
- caller path resolved
- JUnit result is parsed from real process output
- probe can show same output, changed output, and thrown exception

### C#

- Extensions: `.cs`
- Syntax: namespaces, classes, records, methods, properties, delegates, calls, using directives
- Resolution: namespaces, project references, solution/project roots, partial classes
- Test runners: `dotnet test` with TRX or another structured logger
- Probe strategy: a committed .NET probe project or configured executable
- Unknown cases: reflection, source generators, dynamic calls, NuGet/decompiled dependencies, ambiguous overloads

Acceptance fixture:

```text
src/Discount.cs:Apply
src/Invoice.cs:Total -> Discount.Apply
tests/InvoiceTests.cs
```

Required evidence:

- changed method/property detected
- caller path resolved across namespaces
- test counts come from structured output
- build/setup failure is `inconclusive`, never a behavior bug

### Go

- Extensions: `.go`
- Syntax: functions, methods, interfaces, structs, selectors, goroutines, imports
- Resolution: package directories, module path from `go.mod`, aliases, methods on receivers
- Test runner: `go test -json ./...`
- Probe strategy: a committed Go test or executable with machine-readable output
- Unknown cases: interface dispatch, generated code, build tags, cgo, reflection, function values

Acceptance fixture:

```text
discount/discount.go:Apply
invoice/invoice.go:Total -> discount.Apply
invoice/invoice_test.go
```

Required evidence:

- changed function/method detected
- cross-package caller path resolved
- `go test -json` is parsed
- interface/dynamic dispatch appears as `Unknown` when unresolved

## Group 3 — C++, C, Rust, and PHP

Add this group after Group 2 has a stable adapter interface. These languages require more build-system and resolution controls.

### C++

- Extensions: `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hh`, `.hxx`
- Resolution: include paths, namespaces, overloads, templates, headers, translation units
- Test runners: CTest or the repository’s configured test command
- Probe strategy: compiled probe executable with frozen source/build inputs
- Unknown cases: macros, templates, generated headers, function pointers, virtual dispatch, linker-selected symbols

### C

- Extensions: `.c`, `.h`
- Resolution: includes, translation units, declarations versus definitions, function pointers
- Test runners: CTest or configured project command
- Probe strategy: compiled executable; never infer behavior from source alone
- Unknown cases: macros, conditional compilation, indirect calls, platform-specific compilation

### Rust

- Extensions: `.rs`
- Resolution: crates, modules, `use`, `mod`, traits, impl blocks, macros, feature flags
- Test runner: `cargo test` with structured or machine-readable output where available
- Probe strategy: committed Rust binary/test probe using the repository’s Cargo configuration
- Unknown cases: macro-generated code, trait dispatch, proc macros, feature-specific code, build scripts

### PHP

- Extensions: `.php`
- Resolution: namespaces, `use`, Composer PSR-4 autoloading, classes, traits, interfaces, dynamic calls
- Test runner: PHPUnit or the repository’s configured command with structured output
- Probe strategy: committed PHP probe using the repository’s Composer/autoload setup
- Unknown cases: `eval`, dynamic includes, magic methods, reflection, framework-generated bindings

## Delivery sequence

### Slice A — Adapter contract

1. Define the internal adapter interface without changing the public report schema.
2. Move language selection and extension handling behind that interface.
3. Add a registry so unsupported languages fail clearly before analysis.
4. Keep Python, TypeScript, and JavaScript tests unchanged.

Gate: existing focused tests stay green and unsupported languages return a setup/configuration error.

### Slice B — Group 2 implementation

1. Add Java parser/resolver and Maven/Gradle test result support.
2. Add C# parser/resolver and `dotnet test` result support.
3. Add Go parser/resolver and `go test -json` support.
4. Add one real fixture per language.
5. Add same-output, changed-output, exception, setup-failure, timeout, and unknown-dispatch tests.

Gate: each language produces a real changed symbol, a caller path, and paired process evidence.

### Slice C — Group 3 implementation

1. Add C/C++ only after include and build-root configuration is explicit.
2. Add Rust with Cargo workspace and feature handling.
3. Add PHP with Composer/autoload handling.
4. Add fixture and real process tests for each language.

Gate: unresolved macro/template/trait/dynamic edges remain visible as unknowns; no adapter reports a false safe result.

### Slice D — Report and viewer integration

1. Add language and adapter metadata to the canonical report consumer.
2. Show parser/runtime versions, commands, hashes, unknowns, and limits.
3. Keep visitor decisions session-only and never present them as approvals.
4. Mark fixtures clearly and exclude them from final demo evidence.

Gate: a non-fixture report renders every supported language without hiding unknown or inconclusive states.

### Slice E — Release and documentation

Document for each language:

- supported extensions and versions
- setup/install requirements
- configured test and probe commands
- resolver limitations
- dynamic/generated/reflection cases
- what counts as real evidence
- what remains unknown or inconclusive

Do not advertise a language as supported until its fixture and process-output gates pass.

## Recommended configuration shape

Keep commands as argv arrays, never shell strings:

```json
{
  "language": "go",
  "extensions": [".go"],
  "tests_dir": ".",
  "test_command": ["go", "test", "-json", "./..."],
  "test_report": "go-test-json",
  "probe_runner": ["go", "run", "{probe}"],
  "test_file_patterns": ["*_test.go"],
  "max_hops": 2
}
```

Each language may add adapter-specific configuration only after the shared fields are stable and documented.

## Risks and controls

| Risk | Control |
|---|---|
| Parser finds syntax but misses callers | Emit `Unknown`; add indirect-dispatch fixtures |
| Build tool output is mistaken for a passing test | Require structured result parsing |
| Different machines resolve dependencies differently | Record commands, versions, lockfiles, and setup failures |
| C/C++ headers or generated code are missing | Mark analysis/process result inconclusive |
| Dynamic behavior is treated as unchanged | Never convert unresolved edges into no impact |
| Seven new languages make the branch unreviewable | Merge one adapter at a time with focused commits |
| Shared schema conflicts across lanes | A owns schema changes; B owns runner changes; C owns report/viewer changes |

## Final recommendation

Implement Group 2 first: Java, C#, and Go. Only begin Group 3 after the adapter interface, structured runner model, and report/viewer integration are stable. This gives broad practical coverage without claiming that static analysis can fully understand every language feature.
