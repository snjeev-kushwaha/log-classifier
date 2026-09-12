"""
Layer 1 of the hybrid pipeline: fast, deterministic pattern matching.

Rules are ordered - the first matching pattern wins. Keep this list curated
and reviewed; it is the cheapest and fastest path in the system, so pulling
patterns out of the ML/LLM traffic and into here directly reduces cost.
"""
import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RegexRule:
    label: str
    pattern: re.Pattern


class RegexClassifier:
    def __init__(self, rules: Optional[list[RegexRule]] = None):
        self.rules: list[RegexRule] = rules or self._default_rules()

    @staticmethod
    def _default_rules() -> list[RegexRule]:
        return [
            RegexRule(
                label="security_alert",
                pattern=re.compile(
                    r"(multiple login failures|potential security breach|unauthorized access)",
                    re.IGNORECASE,
                ),
            ),
            RegexRule(
                label="resource_usage",
                pattern=re.compile(
                    r"(phys_ram=\d+MB|used_ram=\d+MB|total memory:\s*\d+\s*MB)",
                    re.IGNORECASE,
                ),
            ),
            RegexRule(
                label="workflow_error",
                pattern=re.compile(
                    r"(escalation rule execution failed|task assignment for team.*could not complete)",
                    re.IGNORECASE,
                ),
            ),
        ]

    def classify(self, text: str) -> Optional[str]:
        """Return the matched label, or None if no rule fires."""
        for rule in self.rules:
            if rule.pattern.search(text):
                return rule.label
        return None

    def add_rule(self, label: str, pattern: str) -> None:
        self.rules.append(RegexRule(label=label, pattern=re.compile(pattern, re.IGNORECASE)))
