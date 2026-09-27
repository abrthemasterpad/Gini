import json
import os
import sys

result = {
    "ok": False,
    "version": None,
    "has_cascade_classifier": False,
    "cascade_file": None,
    "cascade_exists": False,
    "has_gui": False,
    "error": None,
}

try:
    import cv2

    result["version"] = getattr(cv2, "__version__", "unknown")
    result["has_cascade_classifier"] = hasattr(cv2, "CascadeClassifier")
    result["has_gui"] = hasattr(cv2, "imshow")

    data = getattr(cv2, "data", None)
    haar_dir = getattr(data, "haarcascades", "") if data is not None else ""

    if haar_dir:
        cascade_file = os.path.join(
            haar_dir,
            "haarcascade_frontalface_default.xml"
        )
        result["cascade_file"] = cascade_file
        result["cascade_exists"] = os.path.exists(cascade_file)

    result["ok"] = bool(
        result["has_cascade_classifier"] and
        result["cascade_exists"]
    )

except Exception as exc:
    result["error"] = repr(exc)

print(json.dumps(result))
sys.exit(0 if result["ok"] else 3)
