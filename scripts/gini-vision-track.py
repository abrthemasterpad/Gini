import argparse
import os
import subprocess
import sys
import time

try:
    import cv2
    import numpy as np
except ImportError:
    print("Missing Python dependency: OpenCV.")
    print("Run: powershell -ExecutionPolicy Bypass -File .\\scripts\\gini-vision-setup.ps1")
    sys.exit(2)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def load_env_file():
    env_path = os.path.join(ROOT, ".env")
    if not os.path.exists(env_path):
        return

    with open(env_path, "r", encoding="utf-8-sig") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")

            if key and key not in os.environ:
                os.environ[key] = value


load_env_file()


def read_exact(pipe, size):
    chunks = []
    remaining = size

    while remaining > 0:
        data = pipe.read(remaining)
        if not data:
            return None
        chunks.append(data)
        remaining -= len(data)

    return b"".join(chunks)


def choose_target(faces, previous_center, width, height):
    if len(faces) == 0:
        return None

    candidates = []

    for (x, y, w, h) in faces:
        cx = x + w / 2.0
        cy = y + h / 2.0
        area = w * h
        candidates.append((x, y, w, h, cx, cy, area))

    if previous_center is None:
        return max(candidates, key=lambda item: item[6])

    px, py = previous_center
    diag = max(1.0, (width ** 2 + height ** 2) ** 0.5)

    ranked = []
    for item in candidates:
        _, _, _, _, cx, cy, area = item
        distance = (((cx - px) ** 2 + (cy - py) ** 2) ** 0.5) / diag
        ranked.append((distance, -area, item))

    ranked.sort(key=lambda item: (item[0], item[1]))

    if ranked[0][0] <= 0.30:
        return ranked[0][2]

    return max(candidates, key=lambda item: item[6])


def direction_for_target(target, width, height, deadzone_x, deadzone_y):
    if target is None:
        return None, 0.0, 0.0

    _, _, _, _, cx, cy, _ = target

    ex = (cx - width / 2.0) / (width / 2.0)
    ey = (cy - height / 2.0) / (height / 2.0)

    x_over = abs(ex) - deadzone_x
    y_over = abs(ey) - deadzone_y

    if x_over <= 0 and y_over <= 0:
        return None, ex, ey

    if x_over >= y_over:
        return ("right" if ex > 0 else "left"), ex, ey

    return ("down" if ey > 0 else "up"), ex, ey


def start_ffmpeg(source, width, height, fps):
    vf = f"scale={width}:{height},fps={fps}"

    cmd = [
        "ffmpeg.exe",
        "-hide_banner",
        "-loglevel", "error"
    ]

    if source.lower().startswith("rtsp://"):
        cmd += ["-rtsp_transport", "tcp"]

    cmd += [
        "-i", source,
        "-an",
        "-vf", vf,
        "-pix_fmt", "bgr24",
        "-f", "rawvideo",
        "pipe:1"
    ]

    return subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.DEVNULL,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )


def start_ptz_bridge(pulse_ms):
    script = os.path.join(ROOT, "scripts", "gini-vision-ptz-bridge.js")

    if not os.path.exists(script):
        raise RuntimeError("Missing PTZ bridge: " + script)

    return subprocess.Popen(
        ["node.exe", script, "--pulse-ms", str(pulse_ms)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
        bufsize=1,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )


def wait_for_bridge_ready(bridge, timeout=10.0):
    deadline = time.time() + timeout

    while time.time() < deadline:
        line = bridge.stdout.readline()

        if not line:
            if bridge.poll() is not None:
                return False
            time.sleep(0.05)
            continue

        text = line.strip()
        print("[PTZ]", text)

        if text == "READY":
            return True

    return False


def main():
    parser = argparse.ArgumentParser(description="Gini Vision v0.5 face-centering tracker")
    parser.add_argument(
        "--source",
        default=os.environ.get("GINI_VISION_SOURCE", "rtsp://127.0.0.1:8554/gini")
    )
    parser.add_argument("--width", type=int, default=int(os.environ.get("GINI_VISION_WIDTH", "640")))
    parser.add_argument("--height", type=int, default=int(os.environ.get("GINI_VISION_HEIGHT", "360")))
    parser.add_argument("--fps", type=float, default=float(os.environ.get("GINI_VISION_FPS", "4")))
    parser.add_argument("--deadzone-x", type=float, default=float(os.environ.get("GINI_VISION_DEADZONE_X", "0.13")))
    parser.add_argument("--deadzone-y", type=float, default=float(os.environ.get("GINI_VISION_DEADZONE_Y", "0.16")))
    parser.add_argument("--stable-frames", type=int, default=int(os.environ.get("GINI_VISION_STABLE_FRAMES", "3")))
    parser.add_argument("--cooldown-ms", type=int, default=int(os.environ.get("GINI_VISION_COOLDOWN_MS", "750")))
    parser.add_argument("--pulse-ms", type=int, default=int(os.environ.get("GINI_VISION_PULSE_MS", "250")))
    parser.add_argument("--live", action="store_true", help="Actually move Gini. Default is dry-run.")
    parser.add_argument("--preview", action="store_true", help="Show a local preview window.")
    args = parser.parse_args()

    if args.width < 160 or args.height < 90:
        raise SystemExit("Frame size is too small.")

    version = getattr(cv2, "__version__", "unknown")

    if not hasattr(cv2, "CascadeClassifier"):
        raise SystemExit(
            "Installed OpenCV " + version +
            " does not provide CascadeClassifier. "
            "Run: powershell -ExecutionPolicy Bypass -File .\\scripts\\gini-vision-setup.ps1"
        )

    data = getattr(cv2, "data", None)
    haar_dir = getattr(data, "haarcascades", "") if data is not None else ""

    if not haar_dir:
        raise SystemExit(
            "Installed OpenCV " + version +
            " does not expose Haar cascade data. "
            "Run the Gini vision setup repair."
        )

    cascade_path = os.path.join(
        haar_dir,
        "haarcascade_frontalface_default.xml"
    )

    if not os.path.exists(cascade_path):
        raise SystemExit(
            "Face cascade file is missing: " + cascade_path +
            ". Run the Gini vision setup repair."
        )

    detector = cv2.CascadeClassifier(cascade_path)

    if detector.empty():
        raise SystemExit("OpenCV face cascade exists but could not be loaded.")

    print("=" * 58)
    print("GINI VISION v0.5 - FACE PRESENCE / CENTERING")
    print("=" * 58)
    print("Mode:", "LIVE PTZ" if args.live else "DRY RUN - motors disabled")
    print("Source:", args.source)
    print("Processing:", f"{args.width}x{args.height} @ {args.fps:g} FPS")
    print("Dead zone:", args.deadzone_x, args.deadzone_y)
    print("Stable frames:", args.stable_frames)
    print("PTZ pulse:", args.pulse_ms, "ms")
    print("Frames are not recorded.")
    print("")

    ffmpeg = start_ffmpeg(args.source, args.width, args.height, args.fps)
    bridge = None

    if args.live:
        bridge = start_ptz_bridge(args.pulse_ms)

        if not wait_for_bridge_ready(bridge):
            ffmpeg.terminate()
            raise SystemExit("Native PTZ bridge did not become ready.")

    frame_bytes = args.width * args.height * 3
    previous_center = None
    stable_direction = None
    stable_count = 0
    last_move_at = 0.0
    last_seen_at = 0.0
    last_status_at = 0.0

    try:
        while True:
            raw = read_exact(ffmpeg.stdout, frame_bytes)

            if raw is None:
                stderr = ffmpeg.stderr.read().decode("utf-8", errors="replace")
                raise RuntimeError("Video stream ended. " + stderr[-800:])

            frame = np.frombuffer(raw, dtype=np.uint8).reshape((args.height, args.width, 3)).copy()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.equalizeHist(gray)

            faces = detector.detectMultiScale(
                gray,
                scaleFactor=1.15,
                minNeighbors=5,
                minSize=(48, 48)
            )

            target = choose_target(faces, previous_center, args.width, args.height)

            if target is None:
                if time.time() - last_seen_at > 1.5:
                    previous_center = None
                    stable_direction = None
                    stable_count = 0

                if time.time() - last_status_at > 2.0:
                    print("PRESENCE: no face")
                    last_status_at = time.time()

                if args.preview:
                    cv2.rectangle(
                        frame,
                        (
                            int(args.width * (0.5 - args.deadzone_x / 2)),
                            int(args.height * (0.5 - args.deadzone_y / 2))
                        ),
                        (
                            int(args.width * (0.5 + args.deadzone_x / 2)),
                            int(args.height * (0.5 + args.deadzone_y / 2))
                        ),
                        (255, 255, 255),
                        1
                    )
                    cv2.imshow("Gini Vision v0.5", frame)
                    if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                        break

                continue

            x, y, w, h, cx, cy, _ = target
            previous_center = (cx, cy)
            last_seen_at = time.time()

            direction, ex, ey = direction_for_target(
                target,
                args.width,
                args.height,
                args.deadzone_x,
                args.deadzone_y
            )

            if direction == stable_direction:
                stable_count += 1
            else:
                stable_direction = direction
                stable_count = 1

            now = time.time()
            can_move = (
                direction is not None
                and stable_count >= args.stable_frames
                and (now - last_move_at) * 1000.0 >= args.cooldown_ms
            )

            if can_move:
                print(
                    "FACE center=({:.2f},{:.2f}) error=({:+.2f},{:+.2f}) -> {}".format(
                        cx / args.width,
                        cy / args.height,
                        ex,
                        ey,
                        direction.upper()
                    )
                )

                if bridge is not None:
                    bridge.stdin.write(direction + "\n")
                    bridge.stdin.flush()
                else:
                    print("DRY RUN: would move", direction.upper())

                last_move_at = now
                stable_count = 0
            elif direction is None and now - last_status_at > 1.5:
                print(
                    "FACE centered at ({:.2f},{:.2f})".format(
                        cx / args.width,
                        cy / args.height
                    )
                )
                last_status_at = now

            if args.preview:
                cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 255, 255), 2)
                cv2.circle(frame, (int(cx), int(cy)), 4, (255, 255, 255), -1)

                dz_left = int(args.width * (0.5 - args.deadzone_x))
                dz_right = int(args.width * (0.5 + args.deadzone_x))
                dz_top = int(args.height * (0.5 - args.deadzone_y))
                dz_bottom = int(args.height * (0.5 + args.deadzone_y))

                cv2.rectangle(
                    frame,
                    (dz_left, dz_top),
                    (dz_right, dz_bottom),
                    (255, 255, 255),
                    1
                )

                cv2.putText(
                    frame,
                    "LIVE" if args.live else "DRY RUN",
                    (12, 26),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2
                )

                cv2.imshow("Gini Vision v0.5", frame)

                if cv2.waitKey(1) & 0xFF in (27, ord("q")):
                    break

    except KeyboardInterrupt:
        pass
    finally:
        if bridge is not None:
            try:
                bridge.stdin.write("quit\n")
                bridge.stdin.flush()
            except Exception:
                pass

            try:
                bridge.terminate()
            except Exception:
                pass

        try:
            ffmpeg.terminate()
        except Exception:
            pass

        if args.preview:
            cv2.destroyAllWindows()

        print("")
        print("Gini Vision stopped.")


if __name__ == "__main__":
    main()
