"""Tree-sitter impact adapter for the configured non-Python languages.

This adapter intentionally resolves only direct, statically visible calls.
Anything that could reach a changed symbol but cannot be resolved is emitted as
``Unknown``. It never treats a missing edge as proof of no impact.
"""

from __future__ import annotations

import fnmatch
import re
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from app.config import BehaviorConfig
from app.schemas import (
    ChangedSymbol,
    ChangeTag,
    Edge,
    Hop,
    ImpactPath,
    ImpactResult,
    Revision,
    RevisionPair,
    SymbolRef,
    Unknown,
)

MODULE = "<module>"
SKIP_DIRS = {".git", ".venv", "__pycache__", "node_modules", "dist", "build", "coverage"}
FUNCTION_TYPES = {
    "function_declaration",
    "generator_function_declaration",
    "method_definition",
    "abstract_method_signature",
    "method_declaration",
    "constructor_declaration",
    "function_definition",
    "function_item",
    "function_declaration",
    "local_function_statement",
    "function_item",
    "method",
    "singleton_method",
}
CLASS_TYPES = {
    "class_declaration",
    "abstract_class_declaration",
    "interface_declaration",
    "enum_declaration",
    "struct_declaration",
    "record_declaration",
    "class_specifier",
    "struct_specifier",
    "union_specifier",
    "impl_item",
    "trait_item",
    "class_definition",
    "class",
    "module",
}
VARIABLE_TYPES = {
    "lexical_declaration",
    "variable_declaration",
    "short_var_declaration",
    "var_declaration",
    "const_declaration",
}
IMPORT_TYPES = {
    "import_statement",
    "import_declaration",
    "using_directive",
    "using_declaration",
    "preproc_include",
    "use_declaration",
    "namespace_use_declaration",
}
CALL_TYPES = {
    "call_expression",
    "new_expression",
    "await_expression",
    "method_invocation",
    "invocation_expression",
    "function_call_expression",
    "member_call_expression",
    "call",
    "command",
    "method_call",
}


@dataclass(frozen=True)
class SymbolDef:
    line: int
    signature: str
    body: str
    imports: str = ""


@dataclass(frozen=True)
class ImportSpec:
    local: str
    imported: str
    source: str
    namespace: bool = False


@dataclass(frozen=True)
class CallRef:
    caller: str
    callee: str
    line: int


@dataclass
class Module:
    path: str
    text: str
    symbols: dict[str, SymbolDef] = field(default_factory=dict)
    imports: list[ImportSpec] = field(default_factory=list)
    bindings: dict[str, SymbolRef] = field(default_factory=dict)
    namespaces: dict[str, str] = field(default_factory=dict)
    calls: list[CallRef] = field(default_factory=list)
    error: str | None = None


def _text(node) -> str:
    return node.text.decode("utf-8", errors="replace") if node is not None else ""


def _field(node, name: str):
    return node.child_by_field_name(name) if node is not None else None


def _line(node) -> int:
    return int(node.start_point[0]) + 1


def _name(node) -> str:
    named = _field(node, "name")
    if named is not None:
        value = _text(named).strip()
        if value:
            return value
    declarator = _field(node, "declarator")
    if declarator is not None:
        value = _declarator_name(declarator)
        if value:
            return value
    for child in node.named_children:
        if child.type in {"identifier", "property_identifier", "type_identifier", "name", "simple_identifier"}:
            return _text(child).strip()
    if node.type in {"create_function", "function_signature", "method_signature"}:
        for child in node.named_children:
            if child.type in {"object_reference", "simple_identifier", "identifier"}:
                value = _text(child).strip()
                if value:
                    return value
    return ""


def _declarator_name(node) -> str:
    """Find the callable name inside C/C++ declarator nesting."""

    if node.type in {"identifier", "field_identifier", "property_identifier", "type_identifier", "name"}:
        return _text(node).strip()
    named = _field(node, "declarator") or _field(node, "name")
    if named is not None and (value := _declarator_name(named)):
        return value
    for child in node.named_children:
        if value := _declarator_name(child):
            return value
    return ""


def _signature(node) -> str:
    parts = []
    for field in ("type_parameters", "parameters", "method_parameters", "return_type", "result", "declarator"):
        value = _field(node, field)
        if value is not None:
            parts.append(_text(value).strip())
    return " ".join(parts)


def _body(node) -> str:
    body = _field(node, "body")
    return _text(body).strip() if body is not None else _text(node).strip()


def _source_spec(text: str) -> str | None:
    match = re.search(r"\bfrom\s*[\"']([^\"']+)[\"']", text)
    if match:
        return match.group(1)
    match = re.search(r"^\s*import\s*[\"']([^\"']+)[\"']", text)
    return match.group(1) if match else None


def _parse_imports(text: str) -> list[tuple[str, str, bool]]:
    """Return ``(local, imported, namespace)`` from one import statement."""

    source_match = re.search(r"\bfrom\s*[\"']([^\"']+)[\"']", text)
    clause = text[: source_match.start()] if source_match else text
    clause = re.sub(r"^\s*import\s+", "", clause).strip()
    result: list[tuple[str, str, bool]] = []
    namespace = re.search(r"\*\s+as\s+([A-Za-z_$][\w$]*)", clause)
    if namespace:
        result.append((namespace.group(1), "*", True))
    named = re.search(r"\{(.*?)\}", clause, flags=re.DOTALL)
    if named:
        for item in named.group(1).split(","):
            item = item.strip()
            if not item:
                continue
            parts = re.split(r"\s+as\s+", item, maxsplit=1)
            imported = parts[0].strip()
            local = parts[-1].strip()
            if imported and local:
                result.append((local, imported, False))
    default = re.match(r"([A-Za-z_$][\w$]*)", clause)
    if default and not named and not namespace:
        result.append((default.group(1), "default", False))
    return result


def _parse_language_imports(text: str, language: str) -> list[tuple[str, str, str, bool]]:
    """Return ``(local, imported, source, namespace)`` for common imports.

    Resolution is deliberately conservative. A syntactically visible import
    is not treated as resolved until it maps to a module in this checkout.
    """

    stripped = text.strip()
    if language in {"typescript", "javascript"}:
        source = _source_spec(text)
        return [(local, imported, source, namespace) for local, imported, namespace in _parse_imports(text) if source]
    if language == "java":
        match = re.search(r"\bimport\s+(?P<static>static\s+)?(?P<qualified>[\w.]+)\s*;", text)
        if not match:
            return []
        qualified = match.group("qualified")
        parts = qualified.split(".")
        local = parts[-1]
        if match.group("static"):
            source = ".".join(parts[:-1]) if len(parts) > 1 else qualified
            return [(local, local, source, False)]
        return [(local, local, qualified, True)]
    if language == "csharp":
        match = re.search(r"\busing\s+(?:[\w]+\s*=\s*)?([\w.]+)\s*;", text)
        if not match:
            return []
        source = match.group(1)
        local = source.rsplit(".", 1)[-1]
        return [(local, "*", source, True)]
    if language == "go":
        result = []
        for match in re.finditer(r'(?:(?P<alias>[\w_.]+)\s+)?"(?P<source>[^"\n]+)"', text):
            source = match.group("source")
            alias = match.group("alias")
            local = None if alias in {None, "import"} else alias
            local = local or source.rstrip("/").rsplit("/", 1)[-1]
            if local != ".":
                result.append((local, "*", source, True))
        return result
    if language in {"cpp", "c"}:
        match = re.search(r"#\s*include\s*[<\"]([^>\"]+)[>\"]", text)
        if not match:
            return []
        source = match.group(1)
        local = PurePosixPath(source).stem
        return [(local, "*", source, True)]
    if language == "rust":
        match = re.search(r"\buse\s+([^;]+);", text)
        if not match:
            return []
        clause = match.group(1).strip()
        if "::{" in clause and clause.endswith("}"):
            prefix, names = clause.split("::{", 1)
            for name in names[:-1].split(","):
                local = name.strip().split(" as ")[-1].strip()
                if local:
                    return [(local, local, prefix, False)]
        parts = clause.split("::")
        local = parts[-1].split(" as ")[-1].strip()
        source = "::".join(parts[:-1]) if len(parts) > 1 else clause
        return [(local, local, source, False)]
    if language == "php":
        match = re.search(r"\buse\s+([A-Za-z_\\][\w\\]*)\s*;", text)
        if not match:
            return []
        source = match.group(1).replace("\\", "/")
        local = source.rsplit("/", 1)[-1]
        return [(local, local, source, True)]
    if stripped.startswith("import"):
        source = _source_spec(text)
        return [(source.rsplit("/", 1)[-1], "*", source, True)] if source else []
    return []


def _call_callee(node) -> str:
    function = _field(node, "function") or _field(node, "constructor")
    name = _field(node, "name") or _field(node, "method")
    receiver = _field(node, "object") or _field(node, "receiver")
    if function is not None:
        return _text(function).strip()
    if name is not None:
        member = _text(name).strip()
        if receiver is not None:
            return f"{_text(receiver).strip()}.{member}"
        return member
    if node.named_children:
        first = node.named_children[0]
        if first.type in {"identifier", "simple_identifier", "word", "command_name", "name"}:
            return _text(first).strip()
    return ""


def _collect(module: Module, root, language: str) -> None:
    """Collect definitions, imports, and direct calls from a syntax tree."""

    def visit(node, current: str | None = None, class_prefix: str | None = None, inside_function: bool = False) -> None:
        node_type = node.type
        if language == "dart" and node_type in {"program", "class_body"}:
            children = list(node.named_children)
            index = 0
            while index < len(children):
                child = children[index]
                if child.type in {"function_signature", "method_signature"} and index + 1 < len(children) and children[index + 1].type == "function_body":
                    name = _name(child)
                    if name:
                        symbol = f"{class_prefix}.{name}" if class_prefix else name
                        body = children[index + 1]
                        module.symbols[symbol] = SymbolDef(_line(child), _signature(child), _text(body).strip())
                        visit(body, symbol, class_prefix, True)
                    index += 2
                    continue
                visit(child, current, class_prefix, inside_function)
                index += 1
            return
        if node_type in IMPORT_TYPES or node_type in {"preproc_def", "include_expression"}:
            for local, imported, source, namespace in _parse_language_imports(_text(node), language):
                module.imports.append(ImportSpec(local, imported, source, namespace))
            return

        if node_type == "export_statement":
            declaration = _field(node, "declaration")
            if declaration is not None:
                visit(declaration, current, class_prefix, inside_function)
            else:
                source = _source_spec(_text(node))
                if source:
                    for local, imported, namespace in _parse_imports(_text(node)):
                        module.imports.append(ImportSpec(local, imported, source, namespace))
            return

        if node_type in CLASS_TYPES:
            name = _name(node)
            if name:
                symbol = f"{class_prefix}.{name}" if class_prefix else name
                module.symbols[symbol] = SymbolDef(_line(node), _signature(node), _body(node))
                body = _field(node, "body") or _field(node, "declaration_list") or _field(node, "class_body")
                if body is not None:
                    if language == "dart":
                        visit(body, current, symbol, inside_function)
                    else:
                        for child in body.named_children:
                            visit(child, current, symbol, inside_function)
                else:
                    for child in node.named_children:
                        visit(child, current, symbol, inside_function)
                return

        if node_type in FUNCTION_TYPES:
            name = _name(node)
            if name:
                symbol = f"{class_prefix}.{name}" if class_prefix else name
                module.symbols[symbol] = SymbolDef(_line(node), _signature(node), _body(node))
                body = _field(node, "body")
                if body is not None:
                    visit(body, symbol, class_prefix, True)
                else:
                    for child in node.named_children:
                        visit(child, symbol, class_prefix, True)
                return

        if node_type in VARIABLE_TYPES and not inside_function:
            for child in node.named_children:
                if child.type not in {"variable_declarator", "short_var_declaration", "var_spec", "const_spec"}:
                    continue
                name = _name(child)
                if name:
                    symbol = f"{class_prefix}.{name}" if class_prefix else name
                    module.symbols[symbol] = SymbolDef(_line(child), "", _text(_field(child, "value")).strip())

        if node_type in CALL_TYPES:
            callee = _call_callee(node)
            if callee:
                module.calls.append(CallRef(current or MODULE, callee, _line(node)))
        if language == "dart" and node_type == "return_statement":
            children = list(node.named_children)
            if len(children) >= 2 and children[0].type in {"identifier", "simple_identifier"} and children[1].type == "selector":
                module.calls.append(CallRef(current or MODULE, _text(children[0]).strip(), _line(node)))

        for child in node.named_children:
            visit(child, current, class_prefix, inside_function)

    visit(root)


def _is_included(path: str, config: BehaviorConfig) -> bool:
    if not any(path.endswith(extension) for extension in config.extensions):
        return False
    if not config.changed_file_filter:
        return True
    return any(fnmatch.fnmatch(path, pattern) for pattern in config.changed_file_filter)


def _load_codebase(root: Path, config: BehaviorConfig) -> dict[str, Module]:
    modules: dict[str, Module] = {}
    if not root.exists():
        return modules
    for path in root.rglob("*"):
        if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
            continue
        relative = path.relative_to(root).as_posix()
        if not _is_included(relative, config):
            continue
        module = Module(relative, "")
        try:
            module.text = path.read_text(encoding="utf-8")
            from tree_sitter import Parser
            from tree_sitter_language_pack import get_language

            language_name = config.language
            if path.suffix == ".tsx" or path.suffix == ".jsx":
                language_name = "tsx"
            if language_name == "csharp":
                language_name = "csharp"
            parser = Parser(get_language(language_name))
            tree = parser.parse(module.text.encode("utf-8"))
            if tree.root_node.has_error:
                module.error = "syntax error"
            else:
                _collect(module, tree.root_node, config.language)
        except UnicodeDecodeError as exc:
            module.error = f"could not decode source: {exc}"
        except ImportError as exc:
            raise RuntimeError("Tree-sitter support is not installed; run pip install -e '.[multilang]'") from exc
        modules[relative] = module
    return modules


def _suffix_match(path: str, candidates: list[str], modules: dict[str, Module]) -> str | None:
    for candidate in candidates:
        if candidate in modules:
            return candidate
    matches = [path for path in modules if any(path.endswith(candidate) for candidate in candidates)]
    if not matches:
        packages = [candidate.strip("/") for candidate in candidates]
        matches = [
            module_path for module_path in modules
            if any(PurePosixPath(module_path).parent.as_posix().endswith(package) for package in packages if package)
        ]
    return sorted(matches, key=len)[0] if len(matches) == 1 else None


def _resolve_import(source_path: str, specifier: str, modules: dict[str, Module], config: BehaviorConfig) -> str | None:
    raw_specifier = specifier.replace("\\", "/")
    raw = PurePosixPath(raw_specifier)
    candidates: list[str] = []

    if raw_specifier.startswith("."):
        raw = PurePosixPath(source_path).parent / raw_specifier
        candidates.extend([raw.as_posix(), raw.as_posix().lstrip("./")])
    elif config.language in {"typescript", "javascript"}:
        return None
    elif config.language == "java":
        candidates.append(raw_specifier.replace(".", "/"))
    elif config.language == "csharp":
        candidates.append(raw_specifier.replace(".", "/"))
    elif config.language == "go":
        package = raw_specifier.rstrip("/").rsplit("/", 1)[-1]
        candidates.extend([package, f"{package}/{package}"])
    elif config.language == "rust":
        parts = [part for part in raw_specifier.split("::") if part not in {"crate", "self", "super"}]
        candidates.append("/".join(parts))
    elif config.language == "php":
        candidates.append(raw_specifier.replace("/", "/"))
    else:
        candidates.append(raw_specifier)

    expanded: list[str] = []
    for candidate in candidates:
        candidate = candidate.strip("/")
        expanded.append(candidate)
        for extension in config.extensions:
            expanded.append(f"{candidate}{extension}")
            expanded.append(f"{candidate}/index{extension}")
            expanded.append(f"{candidate}/mod{extension}")
    if raw.suffix in {".js", ".jsx", ".ts", ".tsx"}:
        expanded.extend(f"{raw.with_suffix('').as_posix()}{extension}" for extension in config.extensions)
    return _suffix_match("", list(dict.fromkeys(expanded)), modules)


def _bind_imports(modules: dict[str, Module], config: BehaviorConfig) -> None:
    for module in modules.values():
        for item in module.imports:
            target_path = _resolve_import(module.path, item.source, modules, config)
            if target_path is None:
                continue
            if item.namespace:
                module.namespaces[item.local] = target_path
                if item.imported == "*":
                    target = modules.get(target_path)
                    if target:
                        for symbol in target.symbols:
                            leaf = symbol.rsplit(".", 1)[-1]
                            if leaf != MODULE:
                                module.bindings.setdefault(leaf, SymbolRef(path=target_path, symbol=symbol))
                        if config.language == "csharp":
                            for symbol in target.symbols:
                                if "." not in symbol:
                                    module.namespaces.setdefault(symbol, target_path)
            else:
                module.bindings[item.local] = SymbolRef(path=target_path, symbol=item.imported)


def _callee_parts(callee: str) -> tuple[str, str | None]:
    match = re.fullmatch(r"([A-Za-z_$][\w$]*)\s*(?:\.|::|->)\s*([A-Za-z_$][\w$]*)", callee)
    return (match.group(1), match.group(2)) if match else (callee, None)


# Languages where a bare `f()` inside a method means `this.f()`. In PHP, TS/JS and Rust a bare
# call names a free function, so resolving it to a sibling method would draw an edge that doesn't exist.
IMPLICIT_RECEIVER_LANGUAGES = {"java", "csharp", "kotlin", "swift", "dart", "cpp", "ruby"}
SELF_RECEIVERS = {"this", "self", "base", "super", "$this", "static"}


def _resolve_call(module: Module, call: CallRef, modules: dict[str, Module], language: str) -> tuple[SymbolRef | None, str]:
    name, member = _callee_parts(call.callee)
    if member and name in module.namespaces:
        target_path = module.namespaces[name]
        target = modules.get(target_path)
        if target and member in target.symbols:
            return SymbolRef(path=target_path, symbol=member), ""
        if target:
            candidates = [symbol for symbol in target.symbols if symbol.rsplit(".", 1)[-1] == member]
            if len(candidates) == 1:
                return SymbolRef(path=target_path, symbol=candidates[0]), ""
        return None, "dynamic member access"

    if not member and name in module.bindings:
        return module.bindings[name], ""
    if not member and name in module.symbols:
        return SymbolRef(path=module.path, symbol=name), ""

    owner = call.caller.rsplit(".", 1)[0] if "." in call.caller else None
    if not member and owner and language in IMPLICIT_RECEIVER_LANGUAGES and f"{owner}.{name}" in module.symbols:
        return SymbolRef(path=module.path, symbol=f"{owner}.{name}"), ""

    if member and name in SELF_RECEIVERS:
        candidate = f"{owner}.{member}" if owner else member
        if candidate in module.symbols:
            return SymbolRef(path=module.path, symbol=candidate), ""
    return None, "dynamic member access" if member else "unresolved reference"


def _changed_by_name(changed: list[ChangedSymbol]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for symbol in changed:
        if symbol.symbol != MODULE:
            result[symbol.symbol.rsplit(".", 1)[-1]].append(symbol.key)
    return dict(result)


def _scan(modules: dict[str, Module], revision: Revision, changed_by_name: dict[str, list[str]], language: str) -> tuple[dict[tuple[str, str], Edge], list[Unknown]]:
    edges: dict[tuple[str, str], Edge] = {}
    unknowns: list[Unknown] = []
    for module in modules.values():
        if module.error:
            if changed_by_name:
                unknowns.append(Unknown(path=module.path, line=1, symbol=MODULE, expression="", reason=f"could not parse on {revision.value}: {module.error}"))
            continue
        for call in module.calls:
            callee, reason = _resolve_call(module, call, modules, language)
            caller = SymbolRef(path=module.path, symbol=call.caller)
            if callee is not None and callee.key != caller.key:
                key = (caller.key, callee.key)
                existing = edges.get(key)
                if existing is None or call.line < existing.line:
                    edges[key] = Edge(caller=caller, callee=callee, line=call.line, revisions=[revision])
            else:
                name, member = _callee_parts(call.callee)
                leaf = member or name
                if leaf in changed_by_name:
                    unknowns.append(Unknown(path=module.path, line=call.line, symbol=call.caller, expression=call.callee, reason=reason, may_reach=changed_by_name[leaf]))
    return edges, unknowns


def _merge_edges(base: dict[tuple[str, str], Edge], head: dict[tuple[str, str], Edge]) -> list[Edge]:
    merged = dict(base)
    for key, edge in head.items():
        if key in merged:
            merged[key].revisions.append(Revision.HEAD)
            merged[key].line = edge.line
        else:
            merged[key] = edge
    return sorted(merged.values(), key=lambda edge: (edge.callee.key, edge.caller.key))


def _is_test(ref: SymbolRef, config: BehaviorConfig) -> bool:
    path = PurePosixPath(ref.path)
    tests_dir = PurePosixPath(config.tests_dir)
    try:
        path.relative_to(tests_dir)
        return True
    except ValueError:
        pass
    return any(fnmatch.fnmatch(path.name, pattern) for pattern in config.test_file_patterns)


def _impact_paths(changed: list[ChangedSymbol], edges: list[Edge], changed_files: list[str], max_hops: int, config: BehaviorConfig) -> list[ImpactPath]:
    callers_of: dict[str, list[Edge]] = defaultdict(list)
    for edge in edges:
        callers_of[edge.callee.key].append(edge)
    touched = set(changed_files)
    paths: list[ImpactPath] = []
    for symbol in changed:
        stack = [[Hop(path=symbol.path, symbol=symbol.symbol, line=symbol.head_line or symbol.base_line or 0)]]
        while stack:
            chain = stack.pop()
            for edge in callers_of.get(chain[0].key, []):
                if any(hop.key == edge.caller.key for hop in chain):
                    continue
                hops = [Hop(path=edge.caller.path, symbol=edge.caller.symbol, line=edge.line), *chain]
                first = hops[0]
                paths.append(ImpactPath(hops=hops, outside_diff=first.path not in touched, is_test=_is_test(first, config)))
                if len(hops) - 1 < max_hops:
                    stack.append(hops)
    return sorted(paths, key=lambda path: (not path.outside_diff, path.is_test, len(path.hops), path.render()))


def _edges_on_paths(edges: list[Edge], paths: list[ImpactPath]) -> list[Edge]:
    used = {(a.key, b.key) for path in paths for a, b in zip(path.hops, path.hops[1:])}
    return [edge for edge in edges if (edge.caller.key, edge.callee.key) in used]


def _dedupe_unknowns(unknowns: list[Unknown]) -> list[Unknown]:
    seen: dict[tuple[str, int, str, str], Unknown] = {}
    for unknown in unknowns:
        seen.setdefault((unknown.path, unknown.line, unknown.expression, unknown.reason), unknown)
    return sorted(seen.values(), key=lambda unknown: (unknown.path, unknown.line))


def _tags(before: SymbolDef | None, after: SymbolDef | None) -> list[ChangeTag]:
    if before is None:
        return [ChangeTag.ADDED]
    if after is None:
        return [ChangeTag.REMOVED]
    tags: list[ChangeTag] = []
    if before.signature != after.signature:
        tags.append(ChangeTag.SIGNATURE_CHANGED)
    if before.body != after.body:
        tags.append(ChangeTag.BODY_CHANGED)
    if before.imports != after.imports:
        tags.append(ChangeTag.IMPORTS_CHANGED)
    return tags


def _diff(base: dict[str, Module], head: dict[str, Module], changed_files: list[str], config: BehaviorConfig) -> list[ChangedSymbol]:
    changed: list[ChangedSymbol] = []
    for path in changed_files:
        if not _is_included(path, config):
            continue
        before = base.get(path)
        after = head.get(path)
        if (before and before.error) or (after and after.error):
            continue
        old = before.symbols if before else {}
        new = after.symbols if after else {}
        for symbol in sorted(old.keys() | new.keys()):
            if tags := _tags(old.get(symbol), new.get(symbol)):
                changed.append(ChangedSymbol(
                    path=path,
                    symbol=symbol,
                    tags=tags,
                    base_line=old[symbol].line if symbol in old else None,
                    head_line=new[symbol].line if symbol in new else None,
                ))
    return changed


def analyze(pair: RevisionPair, max_hops: int, config: BehaviorConfig) -> ImpactResult:
    """Analyze a TypeScript/JavaScript revision pair through Tree-sitter."""

    base = _load_codebase(Path(pair.base_path), config)
    head = _load_codebase(Path(pair.head_path), config)
    _bind_imports(base, config)
    _bind_imports(head, config)
    changed = _diff(base, head, pair.revisions.changed_files, config)
    changed_by_name = _changed_by_name(changed)
    base_edges, base_unknowns = _scan(base, Revision.BASE, changed_by_name, config.language)
    head_edges, head_unknowns = _scan(head, Revision.HEAD, changed_by_name, config.language)
    edges = _merge_edges(base_edges, head_edges)
    paths = _impact_paths(changed, edges, pair.revisions.changed_files, max_hops, config)
    return ImpactResult(
        changed_symbols=changed,
        edges=_edges_on_paths(edges, paths),
        paths=paths,
        unknowns=_dedupe_unknowns(base_unknowns + head_unknowns),
        max_hops=max_hops,
    )


__all__ = ["analyze"]
