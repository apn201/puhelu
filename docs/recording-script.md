# Recording script: the human voice

You are the "real person" in an IVR that is not entirely run by people. Prerecord these. The robot lines are synthesized and are not recorded, but a sample set sits at the end so the tone stays consistent.

The company is fictional: Thirdwatch Customer Continuity. Do not use real company names, real people, real phone numbers or your own name or address in any line.

## 0. Record first: the lines the web phone uses now

These three are wired into `content/nodes.yaml` today. Everything else in this file is for later content. The words must match the node's `say` text, because that text is the subtitle.

| File | Node | Section |
|---|---|---|
| h_help_01.wav | human_helper_01 | 7 |
| h_help_02.wav | human_helper_02 | 7 |
| h_callback_01.wav | callback_human | 8 |

h_help_01 and h_help_02 carry the game's only exit (dial four), so the word "four" must be clear before the cut.

After recording: pick the best take, then process and drop it in place (needs ffmpeg):

```
ffmpeg -i h_help_01_t2.wav -af "highpass=f=300,lowpass=f=3400,silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-18:TP=-3" -ac 1 -ar 16000 web/public/audio/human/h_help_01.wav
```

Then tell Claude or Kiro the time in ms where the cut word starts in each file, so `cut_at_ms` in nodes.yaml can be set to it (the current 5200 and 4200 are guesses).

## 1. Voice and delivery

Two registers, same person.

- Operator: tired, polite, slightly too close to the microphone, working a night shift. No performance. Imagine reading from a screen that is not helping. Small pauses, small exhales. Not quirky, not theatrical.
- The quiet one: late-run dread. Lower, closer, almost no breath control. Never shout. The line should sound like it costs the speaker something to say it. Used from night 3 on.

One thing helps everything: say the lines like you mean them as ordinary words. Horror comes from the plainness.

## 2. Technical

- Record in a quiet room at night. Phone (smartphone) recorder or a proper mic, 48 kHz, mono. Keep the file lossless (WAV).
- Mic 15 to 25 cm away for Operator, 5 to 8 cm for the quiet one.
- Three takes per line. Leave one second of silence before and after each take.
- Name files `h_<id>_t1.wav`, `h_<id>_t2.wav`, `h_<id>_t3.wav` using the IDs below.
- Also record 30 seconds of plain room tone, and the non-speech sounds in section 9.
- Processing happens later in a script: bandpass 300 to 3400 Hz, mono 8 kHz, peak at minus 3 dB. It makes you sound like a phone call without any extra effort.
- Later, once the box works, record a few lines again through the actual Ericofon microphone. Compare. Keep whichever sounds better.

## 3. Key to the table

- Gate: when the director may play it. N = night number, D = dread, T = trust.
- Cut: the engine truncates the take at this point when the robot overrides. Record the full line anyway.

## 4. Pickup and first contact (Operator)

| ID | Line | Direction | Gate |
|---|---|---|---|
| h_pick_01 | "Hello? ... Hello. Oh. You picked up." | Mild surprise, like you expected voicemail. | N1 |
| h_pick_02 | "Thirdwatch, this is the line. How can I help." | Flat, bored, mid-sentence. | N1 |
| h_pick_03 | "Sorry, did I wake you? ... No. Of course I didn't." | Small private joke, then you hear yourself. | N2+ |
| h_pick_04 | "You answered faster this time." | Neutral. Almost approving. | N2+, needs flag fast_pickup |
| h_pick_05 | "It rang for a long time. I wasn't sure you'd come." | Quiet, honest. | needs flag answered_late |

## 5. Putting the caller on hold, taking them back (Operator)

| ID | Line | Direction | Gate |
|---|---|---|---|
| h_hold_01 | "One moment. I'll just put you back on hold." | Cheerful, like a script. | any |
| h_hold_02 | "I need to check something. Don't go anywhere." | Light. Later playbacks of this line feel worse. | D>=2 |
| h_hold_03 | "Let me transfer you. It might take a second." | Click of a button implied. | any |
| h_hold_04 | "Hang on. It's asking me something." | Distracted, glancing at a screen. | D>=3 |
| h_back_01 | "Sorry about that. Where were we." | Back to the call. | any |
| h_back_02 | "Still there? Good. Good." | Mild relief that has nowhere to go. | D>=2 |
| h_back_03 | "That took longer than I wanted. It does that." | Trailing off. | D>=4 |

## 6. Reacting to the caller (Operator, then the quiet one)

| ID | Line | Direction | Gate |
|---|---|---|---|
| h_slow_01 | "Take your time. We have all night." | Warm. Then you realize how that sounds. | think time long |
| h_slow_02 | "You don't have to press anything. Well. You do." | Dry. | think time long, N1 to N2 |
| h_slow_03 | "You dial slowly. That's all right. Some phones do." | Gentle, almost intimate. | rotary caller |
| h_fast_01 | "Quick. Nobody is that quick." | Short laugh at the end. | very fast dial |
| h_silent_01 | "Hello? ... I can hear you breathing. That's fine." | Whispered kindness. | silence |
| h_silent_02 | "Say something. Or don't. It will take both." | Quiet one. | silence, D>=5 |
| h_zero_01 | "Zero is for an operator. I'm the operator. It isn't for me, though." | Confused for half a second. | pressed zero |
| h_rude_01 | "That wasn't necessary." | Measured. No heat. | flag was_rude |

## 7. Help, and being cut off (the quiet one, human tries to help)

Record these as full takes. The engine cuts them at the marked point, plays a short click, and the robot takes over ("I am transferring you to a more helpful agent").

| ID | Line | Direction | Cut |
|---|---|---|---|
| h_help_01 | "Hello? Oh thank god, a real line. Listen, if you dial four, four times, slowly, it lets you out of the..." | Relief first, then fast and low, like someone might walk in. Keep going past "lets you" so the cut lands mid-word. | after "it lets you" |
| h_help_07 | "Listen. I'm not supposed to say this. The menu isn't really for you." | Tight, fast, glancing away. | after "say this" |
| h_help_02 | "It's me again. Don't press nine, nine just brings you back. Dial four, keep dialing four, and don't let it..." | Urgent whisper, closer to the mic than h_help_01. Keep going past "don't". | after "and don't" |
| h_help_08 | "Don't press nine. It listens to nine." | Urgent whisper. | after "press nine" |
| h_help_03 | "If it asks for your name, don't give it one. It already has the number." | Low, careful. | after "give it one" |
| h_help_04 | "Hang up. No, don't hang up, it will call back. Wait. Let me think." | Real panic, held down. | after "call back" |
| h_help_05 | "I've been on this shift a very long time. I can't remember the front door." | Flat, worn out. | none |
| h_help_06 | "Press one. No. Press anything but one." | Rushed. | after "No." |

## 8. Callback openers (after a hang-up)

The phone rings, the caller lifts it, the first word is one of these. Pick by flags.

| ID | Line | Direction | Gate |
|---|---|---|---|
| h_cb_01 | "You hung up." | Perfectly even. | first callback |
| h_cb_02 | "We were in the middle of something." | Polite and patient. | any |
| h_cb_03 | "That was rude. I'm not upset." | Almost kind. | flag was_rude |
| h_cb_04 | "I thought you'd call back. You didn't. So I did." | Matter of fact. | N2+ |
| h_cb_05 | "Don't hang up this time." | Quiet one. Not a threat. A request. | D>=5 |
| h_cb_06 | "It's all right. You can hang up. It'll just ring again." | Resigned, almost tender. | D>=6 |
| h_cb_07 | "Good evening. Again." | Dry. | calls>=3 |
| h_callback_01 | "Hi, sorry, it's me again. Please don't hang up this time, I don't think they let you keep hanging up." | The quiet one, apologetic, a little out of breath. Full line, no cut. | N3+, T>=1 |

## 9. Endings (Operator, then quiet)

Three kinds. None of them ends the loop. They change the next call.

| ID | Line | Direction | Gate |
|---|---|---|---|
| h_end_rel_01 | "Your call is now complete. Thank you for holding." | Normal. Eerie because it is normal. | release |
| h_end_rel_02 | "That's all for tonight. I'll let you know when there's more." | Gentle. | release |
| h_end_tak_01 | "Thank you. We'll take it from here." | Cheerful. | taken |
| h_end_tak_02 | "You don't need to do anything else. Please stay on the line." | Calm. | taken |
| h_end_ans_01 | "I'm glad it was you who answered." | Quiet, honest. | answered |
| h_end_ans_02 | "Same time tomorrow. Or whenever it likes." | Dry. | answered |

## 10. Non-speech (record each three times, 2 to 4 seconds)

- n_sigh_01: a tired sigh
- n_throat_01: throat clear
- n_chair_01: chair creak and shift
- n_type_01: slow typing on a plain keyboard
- n_click_01: pen click, then nothing
- n_breath_01: breathing close to mic, ten seconds of it
- n_room_01: 30 seconds of room tone (no sound at all, just the room)
- n_cough_01: one small cough, turned away from the mic

These go under hold music, between lines, and into silence nodes. They do most of the work.

## 11. Hold music

Do not use anyone else's music. Anything in the video must be yours or clearly licensed.

- Generate two or three loops: a thin synthesized "easy listening" melody, slightly detuned, with tape wow and flutter, a short loop that repeats awkwardly.
- Variants by dread: normal, then a slower version, then one with a note that bends a little wrong.
- Ten seconds of a "hold announcement" slot between loops. The robot voice fills it ("Your call is important to us").
- Kiro can write the generator (Python and numpy, or sox). You choose the sound.

## 12. Recording order that saves time

1. Room tone and non-speech first. Cheap, always useful.
2. Operator lines in one session: sections 4, 5, 6, 9.
3. Quiet-one lines in a second session, later in the night, lower voice: sections 7 and 8.
4. Listen back once. Mark the best take per ID in a text file. Do not agonize.

## 13. Appendix: robot lines (TTS, not recorded)

Sample tone for the synthesized voice, so the recorded lines match it. All fictional.

- "Thank you for calling Thirdwatch Customer Continuity. Your call is important to us."
- "You will be taken in order of arrival. You arrived some time ago."
- "To hear this menu again, press nine. To hear it differently, stay on the line."
- "We have noticed you are using a rotary phone. Please allow extra time. We do."
- "This is night {{night}}. Your patience is appreciated and recorded."
- "You paused for {{think_s}} seconds. Would you like to say that again?"
- "We have tried to reach you {{calls}} times. Thank you for finally answering."
- "I am transferring you to a more helpful agent."
- "Please do not hang up. Hanging up is not available at this time." (only at very high dread)
- "Your call is complete. Please remain on the line for a short survey about how you felt."

Keep robot lines short, polite, a little too accurate. Never a threat. The cruelty is paperwork.
