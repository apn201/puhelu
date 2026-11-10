---
inclusion: always
---

# Safety

- Ring safety lives in MCU firmware: ring state machine, RM duty limit (target 25 to 30 percent, absolute max 33), 1 s watchdog, ARM switch. The engine only asks.
- Never drive PD. RM high only while ringing. F/R idles high.
- Line side is about 48 V DC and 65 Vrms ringing. One phone only, never house wiring. Never open the Ericofon.
- Scheduler: disarmed by default, night window, max 3 rings per night, auto-disarm after N nights.
- Web phone: no network calls at runtime except fonts. State stays in localStorage.
