// AG1171 minimal bench test for Arduino UNO (5 V logic, no level shifting needed).
//
// What it does:
//   lift handset  -> 425 Hz tone in the earpiece (Nordic dial tone frequency)
//   dial a digit  -> tone stops, Serial shows pulse count and break times, N beeps come back
//   hang up       -> tone stops
//
// Serial 9600 baud. Commands:
//   b  1 kHz beep for 1 s (only audible while the handset is lifted)
//   m  mic level (needs the optional mic wiring on A0)
//   r  ring once (disabled until RING_ENABLED is true)
//
// PD (AG1171 pin 14) is NOT connected. Never drive it high.
// F/R idles HIGH, RM idles LOW, per the datasheet.

const uint8_t PIN_SHK  = 2;   // from AG1171 pin 5 (SHK)
const uint8_t PIN_FR   = 6;   // to AG1171 pin 3 (F/R), with 10k pull-up to 5 V
const uint8_t PIN_RM   = 7;   // to AG1171 pin 4 (RM), with 10k pull-down to GND
const uint8_t PIN_TONE = 8;   // to 10k / 1k divider, then 10 nF, then AG1171 pin 9 (VIN)
const uint8_t PIN_MIC  = A0;  // optional: AG1171 pin 10 via 100 nF, biased with 2 x 100k

// Set true ONLY after the Figure 4 protection circuit is built.
const bool RING_ENABLED = false;

const unsigned long DEBOUNCE_MS  = 10;    // datasheet: SHK needs 10 ms persistence
const unsigned long HANGUP_MS    = 300;   // a break longer than this is a hang-up
const unsigned long DIGIT_GAP_MS = 300;   // this long after the last pulse = digit finished
const unsigned int  DIAL_TONE_HZ = 425;

bool rawLast = false;
bool shk = false;                 // debounced SHK, true = off-hook loop current
unsigned long rawChangedAt = 0;
bool offHook = false;
unsigned long breakStart = 0;
unsigned long lastPulseAt = 0;
unsigned long lastRingEnd = 0;
uint8_t pulses = 0;
unsigned int breaks[12];

void setup() {
  digitalWrite(PIN_FR, HIGH); pinMode(PIN_FR, OUTPUT);   // F/R idles high (forward)
  digitalWrite(PIN_RM, LOW);  pinMode(PIN_RM, OUTPUT);   // RM low except during ringing
  pinMode(PIN_SHK, INPUT);
  Serial.begin(9600);
  Serial.println(F("AG1171 mini test ready. Now power the SLIC supply."));
}

void onShkEdge(unsigned long now) {
  if (shk) {                                   // went high
    if (!offHook) {
      offHook = true;
      pulses = 0;
      Serial.println(F("OFF-HOOK"));
      tone(PIN_TONE, DIAL_TONE_HZ);
    } else {                                   // end of a break = one pulse
      unsigned long b = now - breakStart;
      if (b < HANGUP_MS) {
        if (pulses < 12) breaks[pulses] = b;
        pulses++;
        lastPulseAt = now;
      }
    }
  } else {                                     // went low
    breakStart = now;
    if (offHook) noTone(PIN_TONE);             // dial tone stops at the first break
  }
}

void reportDigit() {
  Serial.print(F("pulses="));
  Serial.print(pulses);
  Serial.print(F("  standard digit="));
  Serial.print(pulses == 10 ? 0 : pulses);
  Serial.print(F("  sweden_legacy digit="));
  Serial.print((int)pulses - 1);
  Serial.print(F("  breaks(ms):"));
  for (uint8_t i = 0; i < pulses && i < 12; i++) {
    Serial.print(' ');
    Serial.print(breaks[i]);
  }
  Serial.println();
  uint8_t n = pulses;
  pulses = 0;
  delay(300);
  for (uint8_t i = 0; i < n; i++) {            // N pulses -> N beeps
    tone(PIN_TONE, 1000, 120);
    delay(260);
  }
}

void micLevel() {
  int lo = 1023, hi = 0;
  unsigned long t0 = millis();
  while (millis() - t0 < 200) {
    int v = analogRead(PIN_MIC);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  Serial.print(F("mic peak-to-peak counts: "));
  Serial.println(hi - lo);
}

// Ring sequence from the datasheet (section 3.3): RM high, toggle F/R at 25 Hz,
// on ring-trip hold F/R high, then drop RM more than 10 ms later.
bool ringOnce(unsigned long onMs) {
  bool trip = false;
  bool fr = true;
  unsigned long t0 = millis();
  unsigned long lastToggle = t0;
  unsigned long highSince = 0;
  digitalWrite(PIN_RM, HIGH);
  while (millis() - t0 < onMs) {
    unsigned long n = millis();
    if (n - lastToggle >= 20) {                // 20 ms half period = 25 Hz
      fr = !fr;
      digitalWrite(PIN_FR, fr);
      lastToggle += 20;
    }
    if (digitalRead(PIN_SHK)) {
      if (highSince == 0) highSince = n;
      else if (n - highSince >= 10) { trip = true; break; }   // 10 ms persistence
    } else {
      highSince = 0;
    }
  }
  digitalWrite(PIN_FR, HIGH);                  // F/R permanently high
  delay(20);                                   // RM low only more than 10 ms later
  digitalWrite(PIN_RM, LOW);
  return trip;
}

void ringCommand(unsigned long now) {
  if (!RING_ENABLED) { Serial.println(F("ring is disabled in the sketch (RING_ENABLED = false)")); return; }
  if (offHook)       { Serial.println(F("phone is off-hook, not ringing")); return; }
  if (lastRingEnd != 0 && now - lastRingEnd < 4000) { Serial.println(F("wait, RM duty limit")); return; }
  bool answered = ringOnce(1000);              // 1 s on, then at least 4 s off: 20 percent duty
  lastRingEnd = millis();
  Serial.println(answered ? F("ring-trip: picked up") : F("no answer"));
}

void loop() {
  unsigned long now = millis();

  // debounce SHK, 10 ms persistence
  bool raw = digitalRead(PIN_SHK);
  if (raw != rawLast) { rawLast = raw; rawChangedAt = now; }
  if (raw != shk && now - rawChangedAt >= DEBOUNCE_MS) {
    shk = raw;
    onShkEdge(now);
  }

  // hang-up: loop open for longer than a dial pulse can be
  if (offHook && !shk && now - breakStart > HANGUP_MS) {
    offHook = false;
    pulses = 0;
    noTone(PIN_TONE);
    Serial.println(F("ON-HOOK"));
  }

  // digit finished: quiet for a while after the last pulse
  if (offHook && shk && pulses > 0 && now - lastPulseAt > DIGIT_GAP_MS) {
    reportDigit();
  }

  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'b') tone(PIN_TONE, 1000, 1000);
    else if (c == 'm') micLevel();
    else if (c == 'r') ringCommand(now);
  }
}
