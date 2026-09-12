import pytest

from app.services.ml_classifier import MLClassifier


def test_train_and_classify_roundtrip(trained_ml_classifier):
    label, confidence = trained_ml_classifier.classify("gpu memory usage rising on node 7")
    assert label in {"resource_usage", "account_activity"}
    assert 0.0 <= confidence <= 1.0


def test_classify_before_train_raises():
    clf = MLClassifier()
    with pytest.raises(RuntimeError):
        clf.classify("some log line")


def test_train_rejects_mismatched_lengths():
    clf = MLClassifier()
    with pytest.raises(ValueError):
        clf.train(["only one text"], ["label_a", "label_b"])


def test_save_and_load_roundtrip(trained_ml_classifier, tmp_path):
    trained_ml_classifier.save(tmp_path)
    reloaded = MLClassifier.load(tmp_path)

    original_label, _ = trained_ml_classifier.classify("disk io saturation on volume x")
    reloaded_label, _ = reloaded.classify("disk io saturation on volume x")
    assert original_label == reloaded_label
