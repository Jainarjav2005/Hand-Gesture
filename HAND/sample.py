import cv2
import mediapipe as mp

# Initialize MediaPipe
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(min_detection_confidence=0.7,
                       min_tracking_confidence=0.7)
mp_draw = mp.solutions.drawing_utils

cap = cv2.VideoCapture(0)

def fingers_up(hand_landmarks):
    tips = [4, 8, 12, 16, 20]
    fingers = []

    # Thumb
    fingers.append(hand_landmarks.landmark[tips[0]].x <
                   hand_landmarks.landmark[tips[0]-1].x)

    # Other fingers
    for i in range(1, 5):
        fingers.append(hand_landmarks.landmark[tips[i]].y <
                       hand_landmarks.landmark[tips[i]-2].y)

    return fingers

while True:
    ret, frame = cap.read()
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb)

    gesture = "Detecting..."

    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:
            f = fingers_up(hand_landmarks)
            count = f.count(True)

            # Gesture Logic
            if f == [True, False, False, False, False]:
                gesture = "👍 GOOD LUCK / LIKE"
            elif f == [False, False, False, False, False]:
                gesture = "✊ POWER / NO"
            elif f == [False, True, False, False, False]:
                gesture = "☝️ NUMBER ONE"
            elif f == [False, True, True, False, False]:
                gesture = "✌️ VICTORY / PEACE"
            elif f == [True, True, True, False, False]:
                gesture = "🤟 I LOVE YOU"
            elif f == [False, True, True, True, True]:
                gesture = "✋ HELLO / STOP"
            elif f == [False, True, False, False, True]:
                gesture = "🤘 ROCK"
            elif f == [True, True, False, False, False]:
                gesture = "👌 OK / PERFECT"
            elif f == [False, False, False, False, True]:
                gesture = "👎 DISLIKE / NO"

            mp_draw.draw_landmarks(
                frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)

    cv2.putText(frame, gesture, (20, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1,
                (0, 255, 0), 3)

    cv2.imshow("Hand Gesture Recognition", frame)

    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()