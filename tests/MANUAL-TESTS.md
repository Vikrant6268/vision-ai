# Manual Test Checklist

The automated suite (`node tests/test-api.js`) covers the APIs, all four
languages and the error handling. These tests need a person: they involve the
camera, the microphone, and hearing sound.

**Before starting:** double-click `start.bat`, wait for the Python window to
say `YOLO loaded`, then open Chrome at <http://localhost:3000>.

---

## A. Camera

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| A1 | Click **Camera** | Chrome asks permission → Allow. Live preview appears. | |
| A2 | Click **Camera** again | Preview disappears, webcam light goes out | |
| A3 | Reload, click **Block** on the permission prompt | Hears *"I need permission to use the camera…"* — not silence | |
| A4 | Allow again from the address-bar icon, reload | Camera works again | |

## B. Speech output

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| B1 | Language **English**, click **Help** | Hears the command list immediately | |
| B2 | Language **मराठी**, click **Help** (first time) | Marathi speech starts within ~2 s | |
| B3 | Click **Help** again | Starts almost instantly (cached) | |
| B4 | While it speaks, press **Escape** | Audio stops at once, nothing more plays | |
| B5 | Repeat B2 in **हिंदी** and **ગુજરાતી** | Correct language each time | |
| B6 | Open the page in Marathi, wait 40 s, then click **Detect Objects** at a person | Answer starts in well under a second after the result | |

## C. Voice commands

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| C1 | Click the **🎤 microphone** | Permission prompt → Allow. Hears *"I am listening…"*. Cyan ring appears. | |
| C2 | Say **"help"** / **"मदत"** | Speaks the command list | |
| C3 | Say **"what is in front of me"** / **"समोर काय आहे"** | Detects objects and speaks the result | |
| C4 | Say **"read this"** / **"हे वाच"** at some text | Reads it aloud | |
| C5 | Say **"stop"** / **"थांबा"** while it talks | Stops speaking | |
| C6 | Say something unrelated | Hears a short *"Sorry, I did not catch that"* — never silence | |
| C6b | Keep talking nonsense for 20 s | Replies at most once every ~8 s, not to every phrase. After 3 misses it adds *"Say help…"* | |
| C6c | Ask for **help**, and while the list is being read, say nothing | When it finishes, it does **NOT** react to its own voice (no "help", no "stop", no "sorry") | |
| C6d | Right after any answer finishes, say a command | It hears you first time (the mic is back on within a second) | |
| C7 | Say **"speak in English"** | Switches language and confirms in English | |
| C8 | Stay silent for 60 s, then speak | Still responds — the recogniser restarted itself | |
| C9 | Click the microphone again | Hears *"Voice commands off."*, ring disappears | |

## D. Object detection

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| D1 | Point at yourself → **Detect Objects** | *"There is a person in front of you"* in under a second | |
| D2 | Same in **मराठी** | *"एक व्यक्ती तुमच्या समोर आहे"* | |
| D3 | Move to the left of frame | Position changes to *on your left* / *डावीकडे* | |
| D4 | Point at a blank wall | *"I cannot see anything clearly…"* | |

## E. Walk Mode

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| E1 | Click **Walk Mode** | Hears the warning that this is an aid, not a guarantee | |
| E2 | Point at an empty room, wait 20 s | **Silence.** Chatter here means the thresholds are wrong. | |
| E3 | Walk slowly toward a chair or door | Warns before you reach it | |
| E4 | Hold the camera on the SAME object for 30 seconds | **One** short beep and **one** spoken warning. Then silence, apart from a quiet tone about every 10 s. It must NOT keep repeating the sentence. | |
| E4b | Move the object away | **Silence.** No warning about something that has gone. | |
| E4c | Bring the object back | Warns again, once | |
| E5 | Cover the camera with your hand | *"Stop. Something is right in front of you."* | |
| E6 | Turn the lights off | *"It is too dark to see. Please turn on a light."* — **not** a collision warning | |
| E7 | Press **Escape** | Walk Mode stops | |
| E8 | Close the Python window, start Walk Mode | After ~5 failed checks it stops and says why | |

## F. Read Text (reads and translates, in ONE button)

Read Text always speaks in the language selected at the top, whatever language
the page is in.

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| F1 | Language **English**, point at an English page → **Read Text** | Reads the exact printed words, **aloud** | |
| F2 | Language **मराठी**, point at an English page → **Read Text** | Hears *"याचा अर्थ आहे…"* then the Marathi meaning, **aloud** | |
| F3 | Language **मराठी**, point at a Marathi page | Hears *"यावर लिहिले आहे…"* then the exact words | |
| F4 | Language **English**, point at a Marathi or Hindi page | Hears the English meaning | |
| F5 | A page with several paragraphs (about 10 lines), language **मराठी** | Starts speaking within a few seconds and keeps going to the end. It must not stay silent. | |
| F6 | While it is reading a long page, say **"stop"** | Stops at once | |
| F7 | Point at a blank page → **Read Text** | *"I could not read the text clearly…"* | |
| F8 | Say **"translate this"** | Does the same as **Read Text** | |

## G. Accessibility — the important section

This is the project's whole purpose: **can someone who cannot see use it alone?**

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| G1 | **Close your eyes and use only voice** for 2 minutes | Every action possible without looking | |
| G2 | Press **Tab** repeatedly | Visible cyan ring moves through every control | |
| G3 | First **Tab** on a fresh page | "Skip to main content" appears | |
| G4 | Turn on **Windows Narrator** (`Win + Ctrl + Enter`) | Buttons announced by name; status changes read out | |
| G5 | Unplug the internet, click **Detect Objects** | Still works — YOLO is local | |
| G6 | Still offline, click **Describe Scene** | Spoken error naming the problem | |
| G7 | Still offline, **Read Text** (English) | Still reads, via the EasyOCR fallback. It cannot translate offline. | |

## H. Mobile

| # | Do this | Expected | ✅/❌ |
|---|---|---|---|
| H1 | Chrome **F12** → device toolbar → iPhone/Pixel | Buttons in 2 columns, nothing cut off | |
| H2 | Scroll the whole page | No sideways scrolling | |

---

## Found a problem?

Write down: **what you did**, **what you expected**, **what happened**, and
anything red in the Chrome console (**F12** → Console).
