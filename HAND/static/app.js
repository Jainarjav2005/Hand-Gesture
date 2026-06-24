// Aether Hands - UI Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
    // STATE VARIABLES
    let ws = null;
    let isCameraRunning = false;
    let lastMsgTime = Date.now();
    
    // Gesture Speech Latching
    let lastSpokenGesture = null;

    // UI DOM REFERENCES
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const latencyVal = document.getElementById('latency-val');
    const fpsVal = document.getElementById('fps-val');
    
    const toggleCamBtn = document.getElementById('toggle-cam-btn');
    const cameraSelect = document.getElementById('camera-select');
    const landmarksToggle = document.getElementById('landmarks-toggle');
    const videoStream = document.getElementById('video-stream');
    
    const activeEmoji = document.getElementById('active-emoji');
    const activeName = document.getElementById('active-name');
    const fingerCountVal = document.getElementById('finger-count');
    const activeGestureCard = document.querySelector('.active-gesture-box');
    const guideItems = document.querySelectorAll('.guide-item');
    
    // Welcome / Tutorial Modal DOM References
    const welcomeModal = document.getElementById('welcome-modal');
    const watchTutorialBtn = document.getElementById('watch-tutorial-btn');
    const skipTutorialBtn = document.getElementById('skip-tutorial-btn');
    const finishTutorialBtn = document.getElementById('finish-tutorial-btn');
    const modalWelcomeBody = document.getElementById('modal-welcome-body');
    const modalVideoBody = document.getElementById('modal-video-body');
    const tutorialVideo = document.getElementById('tutorial-video');

    // Tutorial overlay elements
    const overlayEmojiEl = document.getElementById('tutorial-overlay-emoji');
    const overlayNameEl = document.getElementById('tutorial-overlay-name');
    const overlayHindiEl = document.getElementById('tutorial-overlay-hindi');
    const stepRows = document.querySelectorAll('.step-row[data-step-index]');

    // Tutorial steps configuration
    const tutorialSteps = [
        { emoji: "✌️", name: "Victory", hindiName: "विक्ट्री (जीत)", voiceText: "पहला इशारा विक्ट्री यानी जीत का है। दो उंगलियाँ उठाकर आप आगे बढ़ सकते हैं या स्क्रॉल कर सकते हैं।" },
        { emoji: "👍", name: "like", hindiName: "लाइक (पसंद करें)", voiceText: "दूसरा इशारा थम्स-अप या लाइक का है। इससे आप पिछले स्लाइड पर जा सकते हैं।" },
        { emoji: "✊", name: "power", hindiName: "पावर (मुट्ठी)", voiceText: "तीसरा इशारा पावर यानी मुट्ठी का है। मुट्ठी बंद करके आप सिनेमा वीडियो चला सकते हैं।" },
        { emoji: "✋", name: "Open Hand hello", hindiName: "खुला हाथ (नमस्ते)", voiceText: "चौथा इशारा खुला हाथ यानी नमस्ते का है। इससे आप वीडियो रोक सकते हैं।" },
        { emoji: "🤘 / 👎", name: "Rock / Dislike", hindiName: "रॉक या डिस्लाइक", voiceText: "पांचवा इशारा रॉक या डिस्लाइक का है। इससे आप वॉल्यूम बढ़ा या घटा सकते हैं।" }
    ];
    let activeTutorialIndex = 0;
    let isAutoplayActive = false;
    let currentUtteranceIndex = 0;
    let segmentUtterances = [];

    function updateTutorialStep(index) {
        if (index < 0 || index >= tutorialSteps.length) return;
        activeTutorialIndex = index;
        const step = tutorialSteps[index];

        // Update visual overlay inside the video screen
        if (overlayEmojiEl) overlayEmojiEl.textContent = step.emoji;
        if (overlayNameEl) overlayNameEl.textContent = step.name;
        if (overlayHindiEl) overlayHindiEl.textContent = step.hindiName;

        // Highlight matching row on the list
        stepRows.forEach((row, rIdx) => {
            if (rIdx === index) {
                row.classList.add('active-tutorial-step');
            } else {
                row.classList.remove('active-tutorial-step');
            }
        });
    }

    function speakTutorialStepExplanation(index) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const step = tutorialSteps[index];
            const utterance = new SpeechSynthesisUtterance(step.voiceText);
            utterance.lang = 'hi-IN';
            utterance.rate = 1.0;
            
            setTimeout(() => {
                window.speechSynthesis.speak(utterance);
            }, 50);
        }
    }

    function speakTutorialExplanation() {
        if (!('speechSynthesis' in window)) return;
        
        window.speechSynthesis.cancel();
        isAutoplayActive = true;
        
        const segments = [
            {
                text: "एथर हैंड्स ट्यूटोरियल में आपका स्वागत है। आप अपने हाथों के इशारों से इस डैशबोर्ड को नियंत्रित कर सकते हैं।",
                stepIndex: 0
            },
            {
                text: "पहला, आगे बढ़ने के लिए विक्ट्री यानी दो उंगलियों का इशारा दिखाएं।",
                stepIndex: 0
            },
            {
                text: "दूसरा, पीछे जाने के लिए थम्स-अप यानी लाइक का इशारा दिखाएं।",
                stepIndex: 1
            },
            {
                text: "तीसरा, वीडियो चालू करने के लिए मुट्ठी यानी पावर का इशारा दिखाएं।",
                stepIndex: 2
            },
            {
                text: "चौथा, वीडियो रोकने के लिए खुला हाथ यानी हैलो का इशारा दिखाएं।",
                stepIndex: 3
            },
            {
                text: "और पांचवा, वॉल्यूम बढ़ाने के लिए रॉक साइन दिखाएं, या वॉल्यूम कम करने के लिए डिस्लाइक का इशारा दिखाएं।",
                stepIndex: 4
            },
            {
                text: "अपने हाथ को कैमरे के सामने रखें। शुरू करने के लिए स्टार्ट कंट्रोलिंग पर क्लिक करें।",
                stepIndex: 4
            }
        ];
        
        currentUtteranceIndex = 0;
        segmentUtterances = [];
        
        function speakNext() {
            if (!isAutoplayActive || currentUtteranceIndex >= segments.length) return;
            
            const seg = segments[currentUtteranceIndex];
            const utterance = new SpeechSynthesisUtterance(seg.text);
            utterance.lang = 'hi-IN';
            utterance.rate = 0.95;
            
            utterance.onstart = () => {
                if (isAutoplayActive) {
                    updateTutorialStep(seg.stepIndex);
                }
            };
            
            utterance.onend = () => {
                if (isAutoplayActive) {
                    currentUtteranceIndex++;
                    speakNext();
                }
            };
            
            utterance.onerror = (e) => {
                console.error("Tutorial speech queue error:", e);
                if (isAutoplayActive) {
                    currentUtteranceIndex++;
                    speakNext();
                }
            };

            segmentUtterances.push(utterance);
            window.speechSynthesis.speak(utterance);
        }

        setTimeout(() => {
            speakNext();
        }, 50);
    }

    // Welcome Modal Event Listeners
    if (watchTutorialBtn) {
        watchTutorialBtn.addEventListener('click', () => {
            modalWelcomeBody.style.display = 'none';
            modalVideoBody.style.display = 'flex';
            if (tutorialVideo) {
                tutorialVideo.play().catch(e => console.log("Video play failed:", e));
            }
            speakTutorialExplanation();
        });
    }

    // Bind interactive click triggers to the tutorial checklist step-rows
    stepRows.forEach(row => {
        row.addEventListener('click', () => {
            isAutoplayActive = false;
            const index = parseInt(row.getAttribute('data-step-index'), 10);
            updateTutorialStep(index);
            speakTutorialStepExplanation(index);
        });
    });

    const closeWelcomeModal = () => {
        isAutoplayActive = false;
        if (welcomeModal) {
            welcomeModal.style.opacity = 0;
            setTimeout(() => {
                welcomeModal.style.display = 'none';
            }, 400);
        }
        if (tutorialVideo) {
            tutorialVideo.pause();
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        if (!isCameraRunning) {
            toggleCamera();
        }
    };

    if (skipTutorialBtn) {
        skipTutorialBtn.addEventListener('click', closeWelcomeModal);
    }

    if (finishTutorialBtn) {
        finishTutorialBtn.addEventListener('click', closeWelcomeModal);
    }

    fetchSettings();
    startWebSocket();
    setStreamState(false);

    // =========================================================================
    // API CONTROLS & CAMERA STATUS
    // =========================================================================
    async function fetchSettings() {
        try {
            const response = await fetch('/api/settings');
            const data = await response.json();
            isCameraRunning = data.running;
            landmarksToggle.checked = data.draw_landmarks;
            cameraSelect.value = data.camera_index;
            setStreamState(isCameraRunning);
        } catch (error) {
            console.error("Error fetching settings:", error);
        }
    }

    async function toggleCamera() {
        toggleCamBtn.disabled = true;
        const camIndex = cameraSelect.value;
        
        if (isCameraRunning) {
            try {
                const response = await fetch('/api/stop', { method: 'POST' });
                const data = await response.json();
                isCameraRunning = data.running;
                setStreamState(false);
            } catch (err) {
                console.error("Error stopping camera:", err);
            }
        } else {
            try {
                const response = await fetch(`/api/start?camera_index=${camIndex}`, { method: 'POST' });
                const data = await response.json();
                isCameraRunning = data.running;
                if (isCameraRunning) {
                    setStreamState(true);
                } else {
                    setStreamState(false);
                }
            } catch (err) {
                console.error("Error starting camera:", err);
                setStreamState(false);
            }
        }
        toggleCamBtn.disabled = false;
    }

    async function updateOverlaySettings() {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draw_landmarks: landmarksToggle.checked })
            });
        } catch (err) {
            console.error("Error updating settings:", err);
        }
    }

    function setStreamState(running) {
        if (running) {
            toggleCamBtn.innerHTML = '<i class="fa-solid fa-video-slash"></i> Stop Camera';
            toggleCamBtn.className = "btn btn-danger-alt";
            videoStream.style.display = "block";
            videoStream.src = `/video_feed?t=${Date.now()}`;
        } else {
            toggleCamBtn.innerHTML = '<i class="fa-solid fa-video"></i> Start Camera';
            toggleCamBtn.className = "btn btn-primary";
            videoStream.style.display = "none";
            videoStream.src = "";
            updateTelemetryDisplay({
                gesture: "Camera Offline",
                fingers: [false, false, false, false, false],
                finger_count: 0,
                fps: 0
            });
        }
    }

    toggleCamBtn.addEventListener('click', toggleCamera);
    landmarksToggle.addEventListener('change', updateOverlaySettings);
    cameraSelect.addEventListener('change', () => {
        if (isCameraRunning) {
            toggleCamera().then(() => toggleCamera());
        }
    });

    // =========================================================================
    // WEBSOCKET TELEMETRY
    // =========================================================================
    function startWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        statusDot.className = "status-indicator";
        statusText.textContent = "Connecting...";
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            statusDot.className = "status-indicator online";
            statusText.textContent = "Connected";
        };

        ws.onclose = () => {
            statusDot.className = "status-indicator offline";
            statusText.textContent = "Offline";
            setTimeout(startWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error("WS error:", err);
            statusDot.className = "status-indicator offline";
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const now = Date.now();
            const latency = now - lastMsgTime;
            lastMsgTime = now;
            
            latencyVal.textContent = `${latency} ms`;
            fpsVal.textContent = data.fps !== undefined ? data.fps : "--";
            
            if (isCameraRunning) {
                updateTelemetryDisplay(data);
                processGestureAction(data.gesture);
            }
        };
    }

    function updateTelemetryDisplay(data) {
        const name = data.gesture;
        let emoji = "🤖";
        
        if (name.includes("LIKE")) emoji = "👍";
        else if (name.includes("POWER")) emoji = "✊";
        else if (name.includes("NUMBER ONE")) emoji = "☝️";
        else if (name.includes("VICTORY")) emoji = "✌️";
        else if (name.includes("LOVE")) emoji = "🤟";
        else if (name.includes("HELLO") || name.includes("STOP")) emoji = "✋";
        else if (name.includes("ROCK")) emoji = "🤘";
        else if (name.includes("OK")) emoji = "👌";
        else if (name.includes("DISLIKE")) emoji = "👎";
        else if (name.includes("Hand Detected")) emoji = "✋";
        else if (name === "Camera Offline") emoji = "🎥";
        
        activeEmoji.textContent = emoji;
        activeName.textContent = name;
        fingerCountVal.textContent = data.finger_count;

        if (name !== "No Hand Detected" && name !== "Detecting..." && name !== "Camera Offline") {
            activeGestureCard.classList.add('detected');
        } else {
            activeGestureCard.classList.remove('detected');
        }

        for (let i = 0; i < 5; i++) {
            const dot = document.getElementById(`finger-${i}`);
            if (data.fingers && data.fingers[i]) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        }

        guideItems.forEach(item => {
            const itemGesture = item.getAttribute('data-gesture');
            if (itemGesture === name) {
                item.classList.add('highlight-active');
            } else {
                item.classList.remove('highlight-active');
            }
        });
    }

    function processGestureAction(gesture) {
        if (gesture === "No Hand Detected" || gesture === "Detecting..." || gesture === "Camera Offline") {
            lastSpokenGesture = null;
            return;
        }

        if (gesture !== lastSpokenGesture) {
            lastSpokenGesture = gesture;
            speakGesture(gesture);
        }
    }

    function speakGesture(gesture) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            
            let text = "";
            if (gesture.includes("LIKE")) text = "लाइक";
            else if (gesture.includes("POWER")) text = "पावर";
            else if (gesture.includes("NUMBER ONE")) text = "नंबर वन";
            else if (gesture.includes("VICTORY")) text = "विक्ट्री";
            else if (gesture.includes("I LOVE YOU")) text = "आई लव यू";
            else if (gesture.includes("HELLO") || gesture.includes("STOP")) text = "हैलो";
            else if (gesture.includes("ROCK")) text = "रॉक";
            else if (gesture.includes("OK")) text = "ओके";
            else if (gesture.includes("DISLIKE")) text = "डिस्लाइक";
            
            if (text) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'hi-IN';
                utterance.rate = 1.0;
                setTimeout(() => {
                    window.speechSynthesis.speak(utterance);
                }, 50);
            }
        }
    }

    // Quote cycling logic
    const quotes = [
        { text: "The human hand is the cutting edge of the mind.", author: "Jacob Bronowski" },
        { text: "Technology is best when it brings people together.", author: "Nicolas Negroponte" },
        { text: "Shaping the digital world through human touch.", author: "Aether Core" },
        { text: "Control is not about dominance, but harmony between human and machine.", author: "Cybernetics" }
    ];
    let currentQuoteIndex = 0;
    const quoteTextEl = document.getElementById('artwork-quote-text');
    const quoteAuthorEl = document.getElementById('artwork-quote-author');

    if (quoteTextEl && quoteAuthorEl) {
        setInterval(() => {
            currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
            const quote = quotes[currentQuoteIndex];
            
            // Fade out
            quoteTextEl.style.opacity = 0;
            quoteAuthorEl.style.opacity = 0;
            
            setTimeout(() => {
                quoteTextEl.textContent = `"${quote.text}"`;
                quoteAuthorEl.textContent = `— ${quote.author}`;
                // Fade in
                quoteTextEl.style.opacity = 0.85;
                quoteAuthorEl.style.opacity = 0.6;
            }, 400);
        }, 8000);
    }
});
