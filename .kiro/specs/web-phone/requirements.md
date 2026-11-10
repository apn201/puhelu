# Requirements Document

## Introduction

The hosted web phone is the judged product URL. It must produce the same raw signals as the hardware and drive the same engine. Implemented in `web/` (first pass).

## Requirements
1. THE web phone SHALL generate hook edges and dial pulses as timestamped SHK edges fed to the pulse decoder, never digits directly.
2. THE keypad SHALL generate 8 kHz DTMF samples fed to the DTMF decoder.
3. WHEN the phone rings THE web phone SHALL play a synthesized bell and visibly shake.
4. THE web phone SHALL show subtitles for every spoken line.
5. THE web phone SHALL show a line monitor: SHK trace, decoded digits with source and pps, meters, flags, current node, log.
6. THE web phone SHALL work at 375 px width with touch dragging of the dial.
7. THE web phone SHALL need no server, keys or account, and SHALL be deployed to GitHub Pages.
8. All audio SHALL be synthesized or browser speech, or recordings that are own or licensed.
