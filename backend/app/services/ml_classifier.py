"""
Layer 2 of the hybrid pipeline: BERT embeddings + LogisticRegression.

Used when a pattern is too variable for regex but has enough labeled
examples to train a reliable classical classifier. Sentence embeddings
(BERT-family) turn text into fixed-length vectors; LogisticRegression on
top gives calibrated class probabilities cheaply and fast at inference time.

If sentence-transformers is not installed/available, falls back to a
TF-IDF vectorizer so the service still degrades gracefully in constrained
environments (e.g. CI, or an embedding-model download failure).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

logger = logging.getLogger(__name__)


class _TfidfEmbedder:
    """Fallback embedder used when sentence-transformers is unavailable."""

    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=2000, ngram_range=(1, 2))
        self._fitted = False

    def fit(self, texts: list[str]) -> None:
        self.vectorizer.fit(texts)
        self._fitted = True

    def encode(self, texts: list[str]) -> np.ndarray:
        if not self._fitted:
            self.fit(texts)
        return self.vectorizer.transform(texts).toarray()


class MLClassifier:
    """
    Wraps an embedding model + LogisticRegression head.

    classify() returns (label, confidence). Confidence is the predicted
    class probability from LogisticRegression - use this against
    settings.ml_confidence_threshold to decide whether to escalate to LLM
    or a human review queue.
    """

    def __init__(self, embedding_model_name: str = "all-MiniLM-L6-v2"):
        self.embedder = self._load_embedder(embedding_model_name)
        self.classifier: Optional[LogisticRegression] = None
        self.classes_: list[str] = []

    @staticmethod
    def _load_embedder(model_name: str):
        try:
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(model_name)

            class _STWrapper:
                def encode(self, texts):
                    return model.encode(texts, show_progress_bar=False)

            return _STWrapper()
        except Exception as exc:  # pragma: no cover - environment dependent
            logger.warning("sentence-transformers unavailable (%s); falling back to TF-IDF", exc)
            return _TfidfEmbedder()

    def train(self, texts: list[str], labels: list[str]) -> None:
        if len(texts) != len(labels):
            raise ValueError("texts and labels must be the same length")
        if isinstance(self.embedder, _TfidfEmbedder):
            self.embedder.fit(texts)
        X = self.embedder.encode(texts)
        # C=5.0: with typical production-sized datasets (hundreds+ examples
        # per class) the default regularization is fine. On very small
        # datasets (e.g. tests, or a brand-new class with few labels)
        # slightly less regularization gives more decisive probabilities;
        # tune per-deployment via a config value if this matters at scale.
        self.classifier = LogisticRegression(max_iter=1000, C=5.0)
        self.classifier.fit(X, labels)
        self.classes_ = list(self.classifier.classes_)

    def classify(self, text: str) -> tuple[str, float]:
        if self.classifier is None:
            raise RuntimeError("MLClassifier has not been trained or loaded yet")
        X = self.embedder.encode([text])
        probs = self.classifier.predict_proba(X)[0]
        best_idx = int(np.argmax(probs))
        return self.classes_[best_idx], float(probs[best_idx])

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.classifier, path / "classifier.joblib")
        if isinstance(self.embedder, _TfidfEmbedder):
            joblib.dump(self.embedder.vectorizer, path / "tfidf_vectorizer.joblib")

    @classmethod
    def load(cls, path: str | Path, embedding_model_name: str = "all-MiniLM-L6-v2") -> "MLClassifier":
        path = Path(path)
        instance = cls(embedding_model_name=embedding_model_name)
        instance.classifier = joblib.load(path / "classifier.joblib")
        instance.classes_ = list(instance.classifier.classes_)
        vec_path = path / "tfidf_vectorizer.joblib"
        if vec_path.exists() and isinstance(instance.embedder, _TfidfEmbedder):
            instance.embedder.vectorizer = joblib.load(vec_path)
            instance.embedder._fitted = True
        return instance
