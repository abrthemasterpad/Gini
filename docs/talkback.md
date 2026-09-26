# Built-in speaker and talkback

## Verified result

Arbitrary generated speech has been heard through the physical speaker of the tested Trueview T18205-A.

This is separate from simply triggering the built-in alarm sound.

## Native sequence

The working path is:

```text
connect
  ↓
login
  ↓
vop2p_call(channel 0)
  ↓
result 0
  ↓
send G711A frames
  ↓
vop2p_hangup
```

## Audio format

The public ESee/Juan CameraSDK path we tested sends:

```text
Codec:       G711A / A-law
Sample rate: 8000 Hz
Sample size: 16-bit source PCM before encoding
Channels:    mono
Frame size:  160 encoded bytes
Cadence:     20 ms
```

At 8000 samples/second, 160 G711A bytes represent 20 ms of mono audio.

## Clean TTS pipeline

The first speech test worked but sounded rough. A better result came from:

```text
TTS at 16 kHz PCM
      ↓
downsample to 8 kHz
      ↓
reduce level to avoid clipping
      ↓
G711A encode
      ↓
160-byte packets
      ↓
20 ms pacing
      ↓
camera speaker
```

Adding a short silence lead-in and lead-out also helped the speaker start and stop cleanly.

## Volume

The built-in alarm can be much louder than talkback speech because they are different playback paths.

For clean generated speech, avoid simply maximizing the digital waveform. The tiny speaker can distort or vibrate. A moderate source level plus camera-side output-volume control is preferable.

## Capability flag caveat

The tested firmware reports:

```text
spTwowayTalk: false
```

but `vop2p_call` returned success and audio playback worked.

Therefore, this flag does not reliably describe the lower-level behavior of this specific unit/firmware.
