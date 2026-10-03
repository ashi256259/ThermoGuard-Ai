from abc import ABC, abstractmethod
from typing import Dict, Tuple, List

class BaseThermalSourcePredictor(ABC):
    """
    Abstract interface for tabular ML inference engines (Random Forest, XGBoost).
    """

    @abstractmethod
    def predict(self, feature_vector: Dict[str, float]) -> Tuple[str, float, Dict[str, float]]:
        """
        Input: Normalized 11-feature dictionary
        Output:
          - predicted_class: str
          - confidence: float (0.0 to 1.0)
          - class_probabilities: Dict[str, float]
        """
        pass
