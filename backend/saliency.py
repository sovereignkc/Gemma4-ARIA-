# saliency.py — Adaptive Saliency Cropping for disaster scene analysis
#
# Pipeline: raw frame bytes → top-N salient patches as JPEG bytes
#
# Score = 0.5 * motion_score + 0.3 * variance_score + 0.2 * center_bias
#
# Used by /live/analyze to send only information-dense regions to SmolVLM2.
# Finds: floodwater texture, debris, structural damage, fire edges, people.

from __future__ import annotations
import io
import numpy as np
import cv2
from typing import Optional

# Minimum patch area fraction of total image to bother sending
_MIN_AREA_FRAC = 0.02
# Minimum patch dimension in pixels
_MIN_DIM = 64
# Padding added around each detected region
_PAD = 16


def _decode(frame_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(frame_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return img


def _encode(patch: np.ndarray, quality: int = 85) -> bytes:
    ok, buf = cv2.imencode(".jpg", patch, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Failed to encode patch as JPEG")
    return bytes(buf)


def _variance_saliency(gray: np.ndarray) -> np.ndarray:
    """Local variance via difference-of-Gaussians — finds texture-rich regions."""
    blur = cv2.GaussianBlur(gray, (15, 15), 0)
    score = cv2.absdiff(gray, blur).astype(np.float32)
    return score / (score.max() + 1e-6)


def _motion_saliency(gray: np.ndarray, prev_gray: Optional[np.ndarray]) -> np.ndarray:
    """Frame difference as motion map. Returns zeros when no previous frame."""
    if prev_gray is None or prev_gray.shape != gray.shape:
        return np.zeros_like(gray, dtype=np.float32)
    diff = cv2.absdiff(gray, prev_gray).astype(np.float32)
    return diff / (diff.max() + 1e-6)


def _center_bias(h: int, w: int) -> np.ndarray:
    """Gaussian centered on frame — slightly prefer centre regions."""
    cx, cy = w / 2, h / 2
    x = np.linspace(0, w, w)
    y = np.linspace(0, h, h)
    xx, yy = np.meshgrid(x, y)
    sigma_x, sigma_y = w * 0.5, h * 0.5
    bias = np.exp(-((xx - cx) ** 2 / (2 * sigma_x ** 2) + (yy - cy) ** 2 / (2 * sigma_y ** 2)))
    return bias.astype(np.float32)


def _score_map(
    gray: np.ndarray,
    prev_gray: Optional[np.ndarray],
    w_motion: float = 0.5,
    w_variance: float = 0.3,
    w_center: float = 0.2,
) -> np.ndarray:
    h, w = gray.shape
    motion = _motion_saliency(gray, prev_gray)
    variance = _variance_saliency(gray)
    center = _center_bias(h, w)

    # Resize all to same shape (should already match, but guard)
    if motion.shape != gray.shape:
        motion = cv2.resize(motion, (w, h))
    if variance.shape != gray.shape:
        variance = cv2.resize(variance, (w, h))

    combined = w_motion * motion + w_variance * variance + w_center * center
    return combined


def _extract_top_regions(score_map: np.ndarray, n: int = 3) -> list[tuple[int, int, int, int]]:
    """Find bounding boxes of top-N highest-scoring connected regions."""
    h, w = score_map.shape
    min_area = int(h * w * _MIN_AREA_FRAC)

    # Threshold at 40th percentile of non-zero scores
    nonzero = score_map[score_map > 0]
    if len(nonzero) == 0:
        return [(0, 0, w, h)]  # fallback: full frame
    thresh_val = float(np.percentile(nonzero, 40))

    binary = (score_map > thresh_val).astype(np.uint8) * 255
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes = []
    for c in contours:
        x, y, bw, bh = cv2.boundingRect(c)
        if bw * bh >= min_area and bw >= _MIN_DIM and bh >= _MIN_DIM:
            # Weight box score by mean score inside it
            region_score = float(score_map[y:y + bh, x:x + bw].mean())
            boxes.append((region_score, x, y, bw, bh))

    # Sort by score descending, take top n
    boxes.sort(key=lambda t: t[0], reverse=True)
    result = []
    for _, x, y, bw, bh in boxes[:n]:
        # Pad and clamp
        x1 = max(0, x - _PAD)
        y1 = max(0, y - _PAD)
        x2 = min(score_map.shape[1], x + bw + _PAD)
        y2 = min(score_map.shape[0], y + bh + _PAD)
        result.append((x1, y1, x2, y2))

    # Always return at least one region
    if not result:
        result.append((0, 0, w, h))
    return result


def extract_salient_patches(
    frame_bytes: bytes,
    prev_frame_bytes: Optional[bytes] = None,
    n_patches: int = 3,
) -> list[bytes]:
    """
    Main entry point. Given current frame (and optional previous frame),
    return top-N salient patches as JPEG bytes, ordered by saliency score.
    """
    img = _decode(frame_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    prev_gray: Optional[np.ndarray] = None
    if prev_frame_bytes:
        try:
            prev_img = _decode(prev_frame_bytes)
            prev_gray = cv2.cvtColor(prev_img, cv2.COLOR_BGR2GRAY)
            # Match size if camera resolution changed
            if prev_gray.shape != gray.shape:
                prev_gray = cv2.resize(prev_gray, (gray.shape[1], gray.shape[0]))
        except Exception:
            prev_gray = None

    score = _score_map(gray, prev_gray)
    regions = _extract_top_regions(score, n=n_patches)
    patches = []
    for x1, y1, x2, y2 in regions:
        patch = img[y1:y2, x1:x2]
        patches.append(_encode(patch))
    return patches


def draw_debug_overlay(frame_bytes: bytes, prev_frame_bytes: Optional[bytes] = None) -> bytes:
    """Return the frame with saliency boxes drawn — useful for debugging."""
    img = _decode(frame_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    prev_gray = None
    if prev_frame_bytes:
        try:
            prev_gray = cv2.cvtColor(_decode(prev_frame_bytes), cv2.COLOR_BGR2GRAY)
        except Exception:
            pass

    score = _score_map(gray, prev_gray)
    regions = _extract_top_regions(score, n=3)
    colors = [(0, 255, 255), (0, 200, 255), (0, 150, 255)]
    for i, (x1, y1, x2, y2) in enumerate(regions):
        cv2.rectangle(img, (x1, y1), (x2, y2), colors[i % len(colors)], 2)
        cv2.putText(img, f"P{i+1}", (x1 + 4, y1 + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, colors[i % len(colors)], 1)
    return _encode(img, quality=80)
