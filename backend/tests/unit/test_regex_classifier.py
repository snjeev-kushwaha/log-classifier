from app.services.regex_classifier import RegexClassifier


def test_matches_security_alert():
    clf = RegexClassifier()
    label = clf.classify("Multiple login failures occurred on user 9052 account")
    assert label == "security_alert"


def test_matches_resource_usage():
    clf = RegexClassifier()
    label = clf.classify("[instance: bf8a4] Total memory: 64172 MB, used: 512.00 MB")
    assert label == "resource_usage"


def test_matches_workflow_error():
    clf = RegexClassifier()
    label = clf.classify("Escalation rule execution failed for ticket ID 9807 - undefined escalation level.")
    assert label == "workflow_error"


def test_no_match_returns_none():
    clf = RegexClassifier()
    label = clf.classify("User clicked the export button on the dashboard")
    assert label is None


def test_is_case_insensitive():
    clf = RegexClassifier()
    label = clf.classify("MULTIPLE LOGIN FAILURES on account 42")
    assert label == "security_alert"


def test_custom_rule_can_be_added():
    clf = RegexClassifier(rules=[])
    clf.add_rule("deploy_event", r"deployment (started|completed)")
    assert clf.classify("deployment completed for service payments-api") == "deploy_event"
    assert clf.classify("unrelated log line") is None
