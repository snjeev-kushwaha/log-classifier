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
                    r"(multiple login failures|potential security breach|unauthorized access|"
                    r"authentication failed|failed login|access denied|logon denied|"
                    r"invalid password|invalid credentials|brute force|permission denied|"
                    r"forbidden|sql injection|xss|unauthorized|invalid api key|"
                    r"token expired|jwt|signature verification|unauthenticated|"
                    r"failed password|auth failure|tls|cross-site|csrf|"
                    r"ip ban|blacklisted|bad credential|credential stuffing|privilege escalation|"
                    r"invalid signature|accessdenied|not authorized|mtls|certificate|"
                    r"untrusted client|account locked|failed mfa|authorization code|"
                    r"waf alert|rbac|directory traversal|log4shell|jndi|spring security|"
                    r"pam audit|revocation trigger|rate limit threshold|session hijack|"
                    r"vault audit|keycloak|cors origin|hmac|sudo audit|fail2ban|malicious)",
                    re.IGNORECASE,
                ),
            ),
            RegexRule(
                label="resource_usage",
                pattern=re.compile(
                    r"(phys_ram=\d+MB|used_ram=\d+MB|total memory:\s*\d+\s*MB|"
                    r"out of memory|outofmemoryerror|\boom\b|cannot allocate memory|"
                    r"disk full|no space left on device|tablespace full|quota exceeded|"
                    r"buffer pool full|maxmemory|circuitbreakingexception|data too large|"
                    r"watermark exceeded|cpu throttle|thread pool|"
                    r"queue capacity|heap space|memory limit exceeded|swap space exhausted|"
                    r"connection slots are reserved|provisionedthroughputexceeded|memory allocation|"
                    r"high cpu|fd limit reached|too many open files|too many connections|wal.*full|"
                    r"exhausted|oom-killer|kill process|cpu throttling|disk space critical|"
                    r"garbage collection|full gc|socket buffer full|"
                    r"memorypressure|diskpressure|high load average|backpressure threshold exceeded|"
                    r"insufficientinstancecapacity|cudaerrorlaunchoutofresources)",
                    re.IGNORECASE,
                ),
            ),
            RegexRule(
                label="workflow_error",
                pattern=re.compile(
                    r"(escalation rule execution failed|task assignment for team.*could not complete|"
                    r"deadlock|duplicate key|violates.*constraint|does not exist|table.*crashed|"
                    r"lock wait|timeout|connection refused|connection reset|connection closed|"
                    r"connection pool|operationalerror|databaseerror|integrityerror|transientexception|"
                    r"databaseexception|syntax error|internal server error|failed to parse|"
                    r"socketexception|e11000|executiontimeoutexception|clusterdown|snapshot too old|"
                    r"node.*marked down|heartbeat|read timeout|write timeout|packet corruption|"
                    r"page corruption|unreachable|terminating connection|aborted connection|"
                    r"nullpointerexception|broken pipe|checksum error|checkpoint record|"
                    r"prisma.*timed out|gorm.*deadline exceeded|statement timeout|retry error|"
                    r"rebuild stalled|decompression checksum error|replication lag|seconds_behind_master|"
                    r"serialize|slow query|tns:|transaction cancelled|cannot do operations|metadata consistency|"
                    r"unexpected end of file|handshake error|bad gateway|gateway time-out|dns lookup failure|"
                    r"crashloopbackoff|link down|service catalog sync failed|consul.*quorum|vault sealed|"
                    r"argocd sync failed|terraform.*lock|503 service unavailable|cgroup.*failed|"
                    r"sidecar injection failed|rollback triggered|clock drift|divergence|stream corruption|"
                    r"lagging.*consensus|phase desynchronization|anomaly detector|proof verification|"
                    r"unrecognized token stream|hsm)",
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
