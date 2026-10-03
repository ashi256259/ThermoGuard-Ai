from typing import Dict, Any, Tuple, Optional

class ConfidenceInterpreter:
    """
    Confidence Interpretation Module for ThermoGuard AI.
    Interprets Random Forest multi-class probabilities into structured confidence metrics:
    - Confidence Band: HIGH (>=0.75), MEDIUM (>=0.50), LOW (<0.50)
    - Confidence Margin: Probability gap between predicted top class and second highest class
    - Confidence Quality: STRONG, MODERATE, or WEAK
    - Interpretation Notice: Explicitly prevents conflating model probability with real-world sensor accuracy
    """

    THRESHOLDS = {
        "band_high": 0.75,
        "band_medium": 0.50,
        "margin_strong": 0.35,
        "margin_moderate": 0.15
    }

    INTERPRETATION_NOTICE = (
        "Model confidence represents the highest multi-class probability assigned by the "
        "trained Random Forest decision tree ensemble. It measures classifier certainty based "
        "on input feature vectors and does NOT represent verified real-world ground-truth accuracy."
    )

    @classmethod
    def interpret_confidence(
        cls,
        predicted_class: str,
        class_probabilities: Dict[str, float],
        has_full_context: bool = True
    ) -> Dict[str, Any]:
        """
        Interprets model probabilities into confidence band, margin, and quality rating.
        """
        probs = class_probabilities or {predicted_class: 1.0}
        sorted_probs = sorted(probs.items(), key=lambda x: x[1], reverse=True)
        
        top_prob = sorted_probs[0][1] if sorted_probs else 0.5
        second_prob = sorted_probs[1][1] if len(sorted_probs) > 1 else 0.0
        margin = round(top_prob - second_prob, 4)

        # 1. Determine Categorical Confidence Band
        if top_prob >= cls.THRESHOLDS["band_high"]:
            band = "HIGH"
        elif top_prob >= cls.THRESHOLDS["band_medium"]:
            band = "MEDIUM"
        else:
            band = "LOW"

        # 2. Determine Confidence Quality Rating
        # High quality requires both adequate probability and clear separation margin
        if top_prob >= 0.70 and margin >= cls.THRESHOLDS["margin_strong"] and has_full_context:
            quality = "STRONG"
            quality_reason = (
                f"Clear decision separation (margin: +{round(margin * 100, 1)}% over runner-up {sorted_probs[1][0]}) "
                f"with verified geospatial and temporal context."
            )
        elif top_prob >= 0.50 and margin >= cls.THRESHOLDS["margin_moderate"]:
            quality = "MODERATE"
            runner_up_name = sorted_probs[1][0] if len(sorted_probs) > 1 else "alternative"
            quality_reason = (
                f"Moderate probability separation (+{round(margin * 100, 1)}% over {runner_up_name}); "
                f"classification consistent with primary contextual signals."
            )
        else:
            quality = "WEAK"
            runner_up_name = sorted_probs[1][0] if len(sorted_probs) > 1 else "alternative"
            quality_reason = (
                f"Narrow margin separation (+{round(margin * 100, 1)}% over {runner_up_name}) "
                f"or incomplete contextual confirmation suggests class ambiguity."
            )

        return {
            "confidence": round(top_prob, 4),
            "confidence_band": band,
            "confidence_margin": margin,
            "confidence_quality": quality,
            "quality_reason": quality_reason,
            "interpretation_notice": cls.INTERPRETATION_NOTICE,
            "runner_up_class": sorted_probs[1][0] if len(sorted_probs) > 1 else None,
            "runner_up_probability": round(second_prob, 4) if len(sorted_probs) > 1 else 0.0
        }
