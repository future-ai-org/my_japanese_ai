import json
import math
import re
from collections.abc import Callable
from typing import Any

from .config import FINDING_SEVERITIES, get_settings
from .util import is_number

_NUMBER_IN_TEXT = re.compile(r"-?\d+(?:\.\d+)?")
CANONICAL_METRICS = ("Correctness", "Security", "Maintainability")
_KNOWN_METRIC_LABELS = frozenset(label.lower() for label in CANONICAL_METRICS) | {
    "reliability",
    "performance",
}
_SKIP_METRIC_KEYS = frozenset(
    {"score", "summary", "rationale", "reason", "metrics", "findings", "issues"}
)
_METRIC_SECTION = re.compile(
    r"^[ \t]*[\*\-][ \t]+\*\*"
    r"(?P<label>[^*]+?)"
    r"(?:[ \t]*\((?P<score>[^)]+)\))?"
    r":?\*\*:?[ \t]*"
    r"(?P<body>.*?)(?=^[ \t]*[\*\-][ \t]+\*\*|\Z|^[ \t]*\*\*[A-Za-z])",
    re.MULTILINE | re.DOTALL,
)
_CODE_FENCE = re.compile(
    r"```(?P<lang>[^\n`]*)\n(?P<body>.*?)```",
    re.DOTALL,
)
_RATIONALE_BLOCK = re.compile(
    r"\*\*Rationale:\*\*\s*(.+?)(?=\*\*Relevant Code Snippets:\*\*|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_CAVEAT_SENTENCE = re.compile(
    r"(?:however|while |the code (?:does not|doesn't|lacks)|"
    r"missing |no timeout|does not explicitly|risk)\b[^.]*\.",
    re.IGNORECASE,
)
_JSON_METRIC_OBJECT = re.compile(
    r'"label"\s*:\s*"(?P<label>Correctness|Security|Maintainability)"\s*,\s*'
    r'"score"\s*:\s*(?P<score>-?\d+(?:\.\d+)?)'
    r'(?:\s*,\s*"description"\s*:\s*"(?P<description>(?:\\.|[^"\\])*)"?)?',
    re.IGNORECASE | re.DOTALL,
)
_JSON_NAMED_SCORE = re.compile(
    r'"(?P<label>Correctness|Security|Maintainability)"\s*:\s*(?P<score>-?\d+(?:\.\d+)?)',
    re.IGNORECASE,
)
_SEVERITY_ALIASES = {
    "critical": "critical",
    "error": "critical",
    "fatal": "critical",
    "high": "critical",
    "warning": "warning",
    "warn": "warning",
    "medium": "warning",
    "moderate": "warning",
    "suggestion": "suggestion",
    "info": "suggestion",
    "information": "suggestion",
    "note": "suggestion",
    "low": "suggestion",
    "nit": "suggestion",
}

_METRIC_OBJECT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "score": {"type": "integer"},
        "description": {"type": "string"},
        "snippet": {"type": "string"},
    },
    "required": ["score", "description"],
}

REVIEW_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "score": {"type": "integer"},
        "metrics": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "Correctness": _METRIC_OBJECT_SCHEMA,
                "Security": _METRIC_OBJECT_SCHEMA,
                "Maintainability": _METRIC_OBJECT_SCHEMA,
            },
            "required": ["Correctness", "Security", "Maintainability"],
        },
        "summary": {"type": "string"},
        "rationale": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "warning", "suggestion"],
                    },
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "line": {"type": "integer"},
                    "suggestion": {"type": "string"},
                },
                "required": [
                    "severity",
                    "title",
                    "description",
                    "line",
                    "suggestion",
                ],
            },
        },
    },
    "required": ["score", "metrics", "summary", "rationale", "findings"],
}


def _folded_keys(value: dict[str, Any]) -> dict[str, Any]:
    folded: dict[str, Any] = {}
    for key, item in value.items():
        if isinstance(key, str):
            folded.setdefault(key.lower(), item)
        else:
            folded[key] = item
    return folded


def _is_review_object(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    folded = _folded_keys(value)
    return "score" in folded and "summary" in folded


def _find_review_object(value: Any) -> Any | None:
    if _is_review_object(value):
        return value
    if isinstance(value, dict):
        for nested in value.values():
            found = _find_review_object(nested)
            if found is not None:
                return found
    elif isinstance(value, list):
        for nested in value:
            found = _find_review_object(nested)
            if found is not None:
                return found
    return None


def _parse_numeric_text(text: str) -> int | float | None:
    stripped = text.strip().rstrip("%")
    if "/" in stripped:
        stripped = stripped.split("/", 1)[0].strip()
    if not stripped:
        return None
    try:
        if any(char in stripped for char in ".eE"):
            return float(stripped)
        return int(stripped)
    except ValueError:
        match = _NUMBER_IN_TEXT.search(stripped)
        if match is None:
            return None
        captured = match.group(0)
        return float(captured) if "." in captured else int(captured)


def _coerce_number(value: Any) -> int | float | None:
    if is_number(value):
        return value
    if isinstance(value, str):
        return _parse_numeric_text(value)
    return None


def _coerce_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if is_number(value):
        return str(int(value) if float(value).is_integer() else value)
    return ""


def parse_review_json(text: str) -> Any:
    stripped = text.strip().lstrip("\ufeff")
    if stripped.startswith("```"):
        lines = stripped.split("\n")[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()

    decoder = json.JSONDecoder()
    fallback: Any = None
    try:
        loaded = json.loads(stripped)
    except json.JSONDecodeError:
        loaded = None
    else:
        found = _find_review_object(loaded)
        if found is not None:
            return found
        fallback = loaded

    index = 0
    while True:
        start = stripped.find("{", index)
        if start < 0:
            break
        try:
            obj, _end = decoder.raw_decode(stripped, start)
        except json.JSONDecodeError:
            index = start + 1
            continue
        found = _find_review_object(obj)
        if found is not None:
            return found
        if fallback is None and isinstance(obj, dict):
            fallback = obj
        index = start + 1

    if fallback is not None:
        return fallback
    raise json.JSONDecodeError("No JSON object found.", stripped, 0)


def _unescape_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return value.replace('\\"', '"').replace("\\n", "\n").replace("\\\\", "\\")


def _metric_payload(
    label: str,
    score: Any,
    description: Any = None,
    snippet: Any = None,
) -> dict[str, Any] | None:
    number = _coerce_number(score)
    if not isinstance(label, str) or not label.strip() or number is None:
        return None
    metric: dict[str, Any] = {
        "label": _canonical_metric_label(label),
        "score": number,
    }
    if isinstance(description, str) and description.strip():
        metric["description"] = description.strip()
    if isinstance(snippet, str) and snippet.strip():
        metric["snippet"] = snippet
    return metric


def _metric_from_named_entry(key: str, value: Any) -> dict[str, Any] | None:
    if key.lower() in _SKIP_METRIC_KEYS:
        return None
    if isinstance(value, dict):
        folded = _folded_keys(value)
        return _metric_payload(
            str(folded.get("label", folded.get("name", key))),
            folded.get("score", value),
            folded.get("description"),
            folded.get("snippet"),
        ) or _metric_payload(
            key,
            folded.get("score"),
            folded.get("description"),
            folded.get("snippet"),
        )
    if isinstance(value, str) and _coerce_number(value) is None:
        return None
    return _metric_payload(key, value)


def _coerce_metric(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    folded = _folded_keys(value)
    metric = _metric_payload(
        folded.get("label", folded.get("name"))
        if isinstance(folded.get("label", folded.get("name")), str)
        else "",
        folded.get("score"),
        folded.get("description"),
        folded.get("snippet"),
    )
    if metric is not None:
        return metric
    named: list[dict[str, Any]] = []
    shared_description = folded.get("description")
    for key, item in value.items():
        if not isinstance(key, str):
            continue
        extra = _metric_from_named_entry(key, item)
        if extra is None:
            continue
        if isinstance(shared_description, str) and "description" not in extra:
            extra["description"] = shared_description.strip()
        named.append(extra)
    return named[0] if len(named) == 1 else None


def _coerce_metrics(value: Any) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            metric = _coerce_metric(item)
            if metric is not None:
                metrics.append(metric)
            elif isinstance(item, dict):
                for key, nested in item.items():
                    if not isinstance(key, str):
                        continue
                    extra = _metric_from_named_entry(key, nested)
                    if extra is not None:
                        metrics.append(extra)
        return _ordered_metrics(metrics)
    if isinstance(value, dict):
        known = [
            key
            for key in value
            if isinstance(key, str)
            and _canonical_metric_label(key).lower() in _KNOWN_METRIC_LABELS
        ]
        single = _coerce_metric(value)
        if len(known) >= 2 or (single is None and known):
            for key, item in value.items():
                if not isinstance(key, str):
                    continue
                extra = _metric_from_named_entry(key, item)
                if extra is not None:
                    metrics.append(extra)
            return _ordered_metrics(metrics)
        if single is not None:
            return [single]
    return []


def _ordered_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    extras: list[dict[str, Any]] = []
    for metric in metrics:
        label = _canonical_metric_label(str(metric["label"]))
        key = label.lower()
        current = dict(metric)
        current["label"] = label
        if key in _KNOWN_METRIC_LABELS or label in CANONICAL_METRICS:
            existing = merged.get(key)
            if existing is None:
                merged[key] = current
            else:
                if "description" not in existing and "description" in current:
                    existing["description"] = current["description"]
                if "snippet" not in existing and "snippet" in current:
                    existing["snippet"] = current["snippet"]
        else:
            extras.append(current)
    ordered = [
        merged[label.lower()] for label in CANONICAL_METRICS if label.lower() in merged
    ]
    for metric in merged.values():
        if metric not in ordered:
            ordered.append(metric)
    ordered.extend(extras)
    return ordered[: get_settings().max_metrics]


def _coerce_finding(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    folded = _folded_keys(value)
    severity_raw = folded.get("severity")
    severity = (
        _SEVERITY_ALIASES.get(severity_raw.strip().lower())
        if isinstance(severity_raw, str)
        else "suggestion"
    )
    title = folded.get("title", folded.get("name"))
    description = folded.get("description", folded.get("message"))
    line = _coerce_number(folded.get("line", folded.get("lineno")))
    if line is None:
        line = 1
    if (
        severity not in FINDING_SEVERITIES
        or not isinstance(title, str)
        or not title
        or not isinstance(description, str)
    ):
        return None
    finding: dict[str, Any] = {
        "severity": severity,
        "title": title,
        "description": description,
        "line": line,
    }
    suggestion = folded.get("suggestion")
    if isinstance(suggestion, str):
        finding["suggestion"] = suggestion
    return finding


def coerce_review_payload(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    folded = _folded_keys(value)
    coerced = dict(value)
    score = _coerce_number(folded.get("score"))
    if score is not None:
        coerced["score"] = score
    summary = folded.get("summary")
    coerced["summary"] = summary if isinstance(summary, str) else _coerce_text(summary)
    rationale = folded.get("rationale", folded.get("reason"))
    coerced["rationale"] = rationale if isinstance(rationale, str) else ""
    coerced_metrics = _coerce_metrics(folded.get("metrics"))
    seen = {metric["label"].lower() for metric in coerced_metrics}
    for key, item in value.items():
        if not isinstance(key, str) or key.lower() in _SKIP_METRIC_KEYS:
            continue
        if _canonical_metric_label(key).lower() not in _KNOWN_METRIC_LABELS:
            continue
        extra = _metric_from_named_entry(key, item)
        if extra is None or extra["label"].lower() in seen:
            continue
        coerced_metrics.append(extra)
        seen.add(extra["label"].lower())
    coerced["metrics"] = _ordered_metrics(coerced_metrics)
    if score is None and "score" not in folded and coerced["metrics"]:
        coerced["score"] = sum(metric["score"] for metric in coerced["metrics"]) / len(
            coerced["metrics"]
        )
    findings = folded.get("findings", folded.get("issues"))
    coerced_findings: list[dict[str, Any]] = []
    if isinstance(findings, list):
        for item in findings:
            finding = _coerce_finding(item)
            if finding is not None:
                coerced_findings.append(finding)
    coerced["findings"] = coerced_findings
    return coerced


def _canonical_metric_label(label: str) -> str:
    stripped = label.strip()
    for canonical in CANONICAL_METRICS:
        if canonical.lower() == stripped.lower():
            return canonical
    return stripped


def _metric_scores_from_object(value: dict[str, Any]) -> dict[str, int | float]:
    scores: dict[str, int | float] = {}
    for key, item in value.items():
        if not isinstance(key, str) or key.lower() in _SKIP_METRIC_KEYS:
            continue
        number = _coerce_number(item)
        if number is None:
            continue
        scores[_canonical_metric_label(key)] = number
    labels = [label.lower() for label in scores]
    if not scores:
        return {}
    if any(label in _KNOWN_METRIC_LABELS for label in labels) or len(scores) >= 2:
        return scores
    return {}


def _join_description_parts(value: Any) -> str:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped and _coerce_number(value) is None else ""
    if isinstance(value, list):
        parts = [_join_description_parts(item) for item in value]
        return "\n".join(part for part in parts if part)
    return ""


def _metric_descriptions_from_object(value: dict[str, Any]) -> dict[str, str]:
    descriptions: dict[str, str] = {}
    for key, item in value.items():
        if not isinstance(key, str) or key.lower() in _SKIP_METRIC_KEYS:
            continue
        if not isinstance(item, list):
            continue
        text = _join_description_parts(item)
        if text:
            descriptions[_canonical_metric_label(key)] = text
    return descriptions


def _plain_lines(body: str, separator: str = " ") -> str:
    lines: list[str] = []
    for line in body.splitlines():
        stripped = re.sub(r"^[ \t]*[\*\-][ \t]+", "", line).strip()
        stripped = stripped.replace("**", "").strip()
        if stripped:
            lines.append(stripped)
    return separator.join(lines)


def _huggingface_metric_sections(text: str) -> dict[str, dict[str, Any]]:
    sections: dict[str, dict[str, Any]] = {}
    for match in _METRIC_SECTION.finditer(text):
        label = _canonical_metric_label(
            re.sub(r"\s*\([^)]*\)\s*$", "", match.group("label")).strip(" :")
        )
        if not label:
            continue
        section: dict[str, Any] = {}
        score = _coerce_number(match.group("score") or "")
        if score is not None:
            section["score"] = score
        description = _plain_lines(match.group("body"), "\n")
        if description:
            section["description"] = description
        sections[label] = section
    return sections


def _huggingface_snippets(text: str) -> list[str]:
    snippets: list[str] = []
    for match in _CODE_FENCE.finditer(text):
        language = match.group("lang").strip().lower()
        if language in {"json", "jsonc"}:
            continue
        body = match.group("body").strip()
        if body:
            snippets.append(body)
    return snippets


def _first_caveat(text: str) -> str:
    match = _CAVEAT_SENTENCE.search(text)
    if match is None:
        return ""
    return re.sub(r"\s+", " ", match.group(0)).strip()


def _huggingface_findings(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    settings = get_settings()
    findings: list[dict[str, Any]] = []
    for metric in metrics:
        caveat = _first_caveat(metric.get("description") or "")
        if not caveat:
            continue
        score = metric["score"]
        findings.append(
            {
                "severity": (
                    "warning"
                    if score < settings.finding_warning_score
                    else "suggestion"
                ),
                "title": f"{metric['label']} concern",
                "description": caveat,
                "line": 1,
            }
        )
        if len(findings) >= settings.max_metrics:
            break
    return findings


def _metrics_from_json_text(text: str) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    for match in _JSON_METRIC_OBJECT.finditer(text):
        description = match.group("description")
        if description:
            description = _unescape_json_string(description).strip()
        metric = _metric_payload(
            match.group("label"), match.group("score"), description
        )
        if metric is not None:
            metrics.append(metric)
    for match in _JSON_NAMED_SCORE.finditer(text):
        metric = _metric_payload(match.group("label"), match.group("score"))
        if metric is not None:
            metrics.append(metric)
    return metrics


def _text_for_metric_sections(parsed: Any, text: str) -> str:
    parts = [text]
    if not isinstance(parsed, dict):
        return text
    for key in ("summary", "rationale", "reason"):
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value)
    metrics = parsed.get("metrics")
    if isinstance(metrics, list):
        for item in metrics:
            if isinstance(item, dict) and isinstance(item.get("description"), str):
                parts.append(item["description"])
    return "\n".join(parts)


def _metrics_from_sections(text: str) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []
    for label, section in _huggingface_metric_sections(text).items():
        metric = _metric_payload(
            label,
            section.get("score"),
            section.get("description"),
        )
        if metric is None and isinstance(section.get("description"), str):
            continue
        if metric is not None:
            metrics.append(metric)
        elif "score" in section:
            metrics.append({"label": label, "score": section["score"]})
    return metrics


def _with_recovered_metrics(parsed: dict[str, Any], text: str) -> dict[str, Any]:
    scores = _metric_scores_from_object(parsed)
    score_metrics = [
        metric
        for label, score in scores.items()
        if (metric := _metric_payload(label, score)) is not None
    ]
    recovered = _ordered_metrics(
        [
            *(_coerce_metrics(parsed.get("metrics"))),
            *score_metrics,
            *_metrics_from_sections(_text_for_metric_sections(parsed, text)),
            *_metrics_from_json_text(text),
        ]
    )
    if not recovered:
        return parsed
    result = dict(parsed)
    result["metrics"] = recovered
    if not is_number(result.get("score")):
        result["score"] = sum(metric["score"] for metric in recovered) / len(recovered)
    if not isinstance(result.get("summary"), str):
        result["summary"] = ""
    if not isinstance(result.get("rationale"), str):
        result["rationale"] = ""
    if not isinstance(result.get("findings"), list):
        result["findings"] = []
    return result


def _complete_review_payload(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and is_number(value.get("score"))
        and isinstance(value.get("summary"), str)
        and bool(value["summary"].strip())
        and isinstance(value.get("rationale"), str)
        and isinstance(value.get("metrics"), list)
        and isinstance(value.get("findings"), list)
    )


def parse_huggingface_review(text: str) -> dict[str, Any]:
    parsed: Any = None
    try:
        parsed = coerce_review_payload(parse_review_json(text))
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict):
        parsed = _with_recovered_metrics(parsed, text)
    if _complete_review_payload(parsed):
        return parsed

    scores = _metric_scores_from_object(parsed) if isinstance(parsed, dict) else {}
    sections = _huggingface_metric_sections(text)
    descriptions = (
        _metric_descriptions_from_object(parsed) if isinstance(parsed, dict) else {}
    )
    snippets = _huggingface_snippets(text)
    labels = [
        label
        for label in (*CANONICAL_METRICS, *scores, *sections, *descriptions)
        if label in scores or label in sections or label in descriptions
    ]
    seen: set[str] = set()
    metrics: list[dict[str, Any]] = []
    settings = get_settings()
    unscored = (settings.min_score + settings.max_score) // 2
    for label in labels:
        if label in seen:
            continue
        seen.add(label)
        section = sections.get(label, {})
        score = scores.get(label, section.get("score"))
        description = descriptions.get(label, section.get("description"))
        if score is None:
            if (
                not isinstance(description, str)
                or not description
                or label.lower() not in _KNOWN_METRIC_LABELS
            ):
                continue
            score = unscored
        metric: dict[str, Any] = {"label": label, "score": score}
        if isinstance(description, str) and description:
            metric["description"] = description
        metrics.append(metric)
        if len(metrics) >= settings.max_metrics:
            break
    if not metrics:
        if parsed is not None:
            return parsed
        raise json.JSONDecodeError("No JSON object found.", text, 0)

    if snippets:
        target = min(metrics, key=lambda metric: metric["score"])
        joined = "\n".join(snippets).lower()
        if "security" in joined:
            security = next(
                (metric for metric in metrics if metric["label"] == "Security"),
                None,
            )
            if security is not None:
                target = security
        target["snippet"] = snippets[0]

    average = sum(metric["score"] for metric in metrics) / len(metrics)
    overview = ", ".join(
        f"{metric['label']} {_clamped_score(metric['score'])}" for metric in metrics
    )
    weakest = min(metrics, key=lambda metric: metric["score"])
    caveat = _first_caveat(weakest.get("description") or "")
    summary = f"{overview}."
    if caveat:
        summary = f"{summary} {caveat}"
    rationale_match = _RATIONALE_BLOCK.search(text)
    rationale = _plain_lines(rationale_match.group(1)) if rationale_match else ""
    if not rationale:
        max_score = settings.max_score
        rationale = " ".join(
            (
                f"{metric['label']} "
                f"({_clamped_score(metric['score'])}/{max_score}): "
                f"{metric.get('description', '')}"
            ).strip()
            for metric in metrics
        )
    return {
        "score": average,
        "summary": summary,
        "rationale": rationale,
        "metrics": metrics,
        "findings": _huggingface_findings(metrics),
    }


def _js_round(value: float) -> int:
    return math.floor(value + 0.5)


def _clamped_score(value: float) -> int:
    settings = get_settings()
    return _js_round(max(settings.min_score, min(value, settings.max_score)))


def normalize_review_result(
    value: Any,
    *,
    line_count: int,
    duration_ms: int,
    max_findings: int,
    inference: dict[str, Any],
    create_id: Callable[[], str],
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("The model returned an invalid review.")

    if (
        not is_number(value.get("score"))
        or not isinstance(value.get("summary"), str)
        or not isinstance(value.get("rationale"), str)
        or not isinstance(value.get("metrics"), list)
        or not isinstance(value.get("findings"), list)
    ):
        raise ValueError("The model returned an incomplete review.")

    metrics: list[dict[str, Any]] = []
    for metric in value["metrics"][: get_settings().max_metrics]:
        if (
            not isinstance(metric, dict)
            or not isinstance(metric.get("label"), str)
            or not is_number(metric.get("score"))
        ):
            raise ValueError("The model returned an invalid metric.")
        normalized_metric = {
            "label": metric["label"],
            "score": _clamped_score(metric["score"]),
        }
        if isinstance(metric.get("description"), str):
            normalized_metric["description"] = metric["description"]
        if isinstance(metric.get("snippet"), str):
            normalized_metric["snippet"] = metric["snippet"]
        metrics.append(normalized_metric)

    findings: list[dict[str, Any]] = []
    for index, finding in enumerate(value["findings"][:max_findings]):
        if (
            not isinstance(finding, dict)
            or finding.get("severity") not in FINDING_SEVERITIES
            or not isinstance(finding.get("title"), str)
            or not isinstance(finding.get("description"), str)
            or not is_number(finding.get("line"))
        ):
            raise ValueError("The model returned an invalid finding.")

        normalized = {
            "id": f"review-{index}-{create_id()}",
            "severity": finding["severity"],
            "title": finding["title"],
            "description": finding["description"],
            "line": max(
                1,
                min(_js_round(finding["line"]), max(1, line_count)),
            ),
        }
        if isinstance(finding.get("suggestion"), str) and finding["suggestion"]:
            normalized["suggestion"] = finding["suggestion"]
        findings.append(normalized)

    return {
        "score": _clamped_score(value["score"]),
        "summary": value["summary"],
        "rationale": value["rationale"],
        "metrics": metrics,
        "findings": findings,
        "durationMs": duration_ms,
        "inference": inference,
    }
