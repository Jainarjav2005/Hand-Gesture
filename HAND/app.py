import os
import cv2
import time
import json
import asyncio
import threading
from typing import Dict, Any, List
import mediapipe as mp

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Aether Hands API")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure static directory exists
os.makedirs("static", exist_ok=True)

class CameraManager:
    def __init__(self):
        self.cap = None
        self.running = False
        self.thread = None
        self.lock = threading.Lock()
        
        # State variables
        self.latest_frame_bytes = None
        self.gesture_data = {
            "gesture": "Camera Offline",
            "fingers": [False] * 5,
            "finger_count": 0,
            "landmarks": []
        }
        self.fps = 0
        self.frame_count = 0
        self.start_time = time.time()
        
        # Settings
        self.draw_landmarks = True
        self.camera_index = 0
        
        # MediaPipe hands setup
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7,
            model_complexity=0  # Set to Lite model for high performance and low CPU overhead
        )
        self.mp_draw = mp.solutions.drawing_utils

        # MediaPipe selfie segmentation setup
        self.mp_selfie = mp.solutions.selfie_segmentation
        self.selfie_segmentation = self.mp_selfie.SelfieSegmentation(model_selection=1)

    def fingers_up(self, hand_landmarks, handedness: str = "Right") -> List[bool]:
        tips = [4, 8, 12, 16, 20]
        fingers = []

        # Thumb
        # Screen-space "Left" hand: open if 4.x > 3.x
        # Screen-space "Right" hand: open if 4.x < 3.x
        if handedness == "Left":
            fingers.append(hand_landmarks.landmark[tips[0]].x >
                           hand_landmarks.landmark[tips[0]-1].x)
        else:
            fingers.append(hand_landmarks.landmark[tips[0]].x <
                           hand_landmarks.landmark[tips[0]-1].x)

        # Other fingers
        for i in range(1, 5):
            fingers.append(hand_landmarks.landmark[tips[i]].y <
                           hand_landmarks.landmark[tips[i]-2].y)

        return fingers

    def start(self, camera_index: int = 0) -> bool:
        with self.lock:
            if self.running:
                return True
            
            self.camera_index = camera_index
            self.cap = cv2.VideoCapture(camera_index)
            if not self.cap.isOpened():
                print(f"Error: Could not open camera with index {camera_index}")
                return False
            
            # Request 640x480 resolution for faster frame processing and low latency
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                
            self.running = True
            self.start_time = time.time()
            self.frame_count = 0
            self.thread = threading.Thread(target=self._capture_loop, daemon=True)
            self.thread.start()
            print(f"Camera manager started with camera index {camera_index}")
            return True

    def stop(self):
        with self.lock:
            self.running = False
            
        if self.thread:
            self.thread.join(timeout=1.0)
            self.thread = None
            
        with self.lock:
            if self.cap:
                self.cap.release()
                self.cap = None
            self.latest_frame_bytes = None
            self.gesture_data = {
                "gesture": "Camera Offline",
                "fingers": [False] * 5,
                "finger_count": 0,
                "landmarks": []
            }
            self.fps = 0
            print("Camera manager stopped")

    def _capture_loop(self):
        while True:
            with self.lock:
                if not self.running:
                    break
                cap = self.cap
                
            if not cap:
                time.sleep(0.01)
                continue
                
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.01)
                continue

            # Process frame
            frame = cv2.flip(frame, 1)
            h, w, c = frame.shape
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Apply selfie segmentation for background blur (showing only human body)
            seg_result = self.selfie_segmentation.process(rgb)
            if seg_result.segmentation_mask is not None:
                import numpy as np
                mask = seg_result.segmentation_mask
                condition = np.stack((mask,) * 3, axis=-1) > 0.5
                blurred_frame = cv2.GaussianBlur(frame, (35, 35), 0)
                frame = np.where(condition, frame, blurred_frame)

            result = self.hands.process(rgb)

            gesture = "Detecting..."
            finger_count = 0
            fingers = [False] * 5
            landmarks_list = []

            if result.multi_hand_landmarks:
                for hand_idx, hand_landmarks in enumerate(result.multi_hand_landmarks):
                    # Capture relative 2D landmarks for frontend rendering
                    for idx, lm in enumerate(hand_landmarks.landmark):
                        landmarks_list.append({
                            "id": idx,
                            "x": round(lm.x, 4),
                            "y": round(lm.y, 4),
                            "z": round(lm.z, 4)
                        })

                    # Get handedness for robust thumb check
                    handedness = "Right"
                    if result.multi_handedness and hand_idx < len(result.multi_handedness):
                        handedness = result.multi_handedness[hand_idx].classification[0].label

                    # Calculate finger status
                    fingers = self.fingers_up(hand_landmarks, handedness)
                    finger_count = fingers.count(True)

                    # Gesture mapping logic (consistent with sample.py with extra Hello case)
                    if fingers == [True, False, False, False, False]:
                        gesture = "👍 GOOD LUCK / LIKE"
                    elif fingers == [False, False, False, False, False]:
                        gesture = "✊ POWER / NO"
                    elif fingers == [False, True, False, False, False]:
                        gesture = "☝️ NUMBER ONE"
                    elif fingers == [False, True, True, False, False]:
                        gesture = "✌️ VICTORY / PEACE"
                    elif fingers == [True, True, True, False, False]:
                        gesture = "🤟 I LOVE YOU"
                    elif fingers == [False, True, True, True, True] or fingers == [True, True, True, True, True]:
                        gesture = "✋ HELLO / STOP"
                    elif fingers == [False, True, False, False, True]:
                        gesture = "🤘 ROCK"
                    elif fingers == [True, True, False, False, False]:
                        gesture = "👌 OK / PERFECT"
                    elif fingers == [False, False, False, False, True]:
                        gesture = "👎 DISLIKE / NO"
                    else:
                        gesture = f"Hand Detected ({finger_count} fingers)"

                    # Draw landmarks on the video feed if enabled
                    with self.lock:
                        draw_enabled = self.draw_landmarks
                        
                    if draw_enabled:
                        self.mp_draw.draw_landmarks(
                            frame, hand_landmarks, self.mp_hands.HAND_CONNECTIONS,
                            self.mp_draw.DrawingSpec(color=(120, 80, 255), thickness=2, circle_radius=3),
                            self.mp_draw.DrawingSpec(color=(255, 180, 80), thickness=2, circle_radius=2)
                        )

                    # Highlight the active gesture on the frame
                    cv2.putText(
                        frame, gesture, (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1,
                        (80, 255, 120), 2
                    )

            else:
                gesture = "No Hand Detected"

            # Compute FPS
            self.frame_count += 1
            elapsed = time.time() - self.start_time
            if elapsed >= 1.0:
                self.fps = round(self.frame_count / elapsed, 1)
                self.frame_count = 0
                self.start_time = time.time()

            # Encode frame to JPEG
            ret, jpeg = cv2.imencode('.jpg', frame)
            if ret:
                frame_bytes = jpeg.tobytes()
            else:
                frame_bytes = None

            # Update manager state under lock
            with self.lock:
                self.latest_frame_bytes = frame_bytes
                self.gesture_data = {
                    "gesture": gesture,
                    "fingers": fingers,
                    "finger_count": finger_count,
                    "landmarks": landmarks_list,
                    "fps": self.fps
                }

            # Cap frame rate to ~30 FPS
            time.sleep(0.033)

    def get_latest_frame(self) -> bytes:
        with self.lock:
            return self.latest_frame_bytes

    def get_gesture_data(self) -> Dict[str, Any]:
        with self.lock:
            return self.gesture_data


# Initialize singleton camera manager
camera_manager = CameraManager()


# Active websocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Handle broken connections gracefully
                pass

ws_manager = ConnectionManager()


# Streaming generator for MJPEG
def frame_generator():
    while True:
        # Check if running
        if not camera_manager.running:
            # Send an offline placeholder image if camera not running
            # We can read a static offline frame or generate a black image
            import numpy as np
            offline_img = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(
                offline_img, "Camera Offline. Press Start.", (100, 240),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2
            )
            _, jpeg = cv2.imencode('.jpg', offline_img)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.5)
            continue
            
        frame_bytes = camera_manager.get_latest_frame()
        if frame_bytes is None:
            time.sleep(0.01)
            continue
            
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        # Sleep briefly to avoid hammering CPU
        time.sleep(0.03)


# Endpoints
@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.post("/api/start")
def start_camera(camera_index: int = 0):
    success = camera_manager.start(camera_index=camera_index)
    return {"status": "success" if success else "error", "running": camera_manager.running}

@app.post("/api/stop")
def stop_camera():
    camera_manager.stop()
    return {"status": "success", "running": camera_manager.running}

@app.get("/api/settings")
def get_settings():
    return {
        "draw_landmarks": camera_manager.draw_landmarks,
        "camera_index": camera_manager.camera_index,
        "running": camera_manager.running
    }

@app.post("/api/settings")
async def update_settings(request: Request):
    data = await request.json()
    if "draw_landmarks" in data:
        camera_manager.draw_landmarks = bool(data["draw_landmarks"])
    return {"status": "success", "settings": get_settings()}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Check client messages (like keepalives, settings updates)
            # but mostly we just stream data out.
            # We do a non-blocking check on websocket or just run a periodic task
            try:
                # Listen with a timeout or run send loop
                # We can do a sleep and broadcast the gesture details
                data = camera_manager.get_gesture_data()
                await websocket.send_json(data)
                await asyncio.sleep(0.05) # ~20 telemetry packets per second
            except WebSocketDisconnect:
                break
            except Exception as e:
                print(f"WS error: {e}")
                break
    finally:
        ws_manager.disconnect(websocket)

# HTML index route
@app.get("/")
def get_home():
    # If the static file exists, return it, otherwise return a simple bootstrap HTML
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    static_index = os.path.join(BASE_DIR, "static", "index.html")
    if os.path.exists(static_index):
        with open(static_index, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Frontend files not created yet. Please create static/index.html</h1>")

# Mount static folder
app.mount(
    "/static",
    StaticFiles(directory=os.path.join(BASE_DIR, "static")),
    name="static"
)

if __name__ == "__main__":
    import uvicorn
    # Automatically start camera on launch for convenience
    camera_manager.start(camera_index=0)
    try:
        uvicorn.run(app, host="0.0.0.0", port=8000)
    finally:
        camera_manager.stop()
