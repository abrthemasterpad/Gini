# Draft article: Turning a Trueview PTZ camera into Gini, a local AI robot head

> Draft — update this article only with features verified on physical hardware.

## The idea

Instead of buying a separate robot camera, microphone, speaker and pan/tilt mechanism, Gini reuses a low-cost PTZ Wi-Fi camera as a robot head.

The camera already contains:

- a camera sensor
- a microphone
- a speaker
- pan/tilt motors
- Wi-Fi

The PC becomes the brain.

## The first obstacle: escaping the vendor app

The camera's vendor software is useful for normal operation, but Gini needs local programmatic control.

The first goal was therefore to identify the camera's local interfaces without depending on cloud automation.

## Finding the video stream

The camera exposes a local Bubble media stream:

```text
/bubble/live?ch=0&stream=0
```

This produced continuous H.264 video and exposed an audio track.

That gave Gini its eyes.

## Finding PTZ

The camera also exposes a local PTZ CGI:

```text
/cgi-bin/hi3510/ptzctrl.cgi
```

Left, right, up and down were verified on the physical camera.

That gave Gini a neck.

## The difficult part: the speaker

Triggering a built-in alarm is not the same thing as sending arbitrary speech.

The firmware capability endpoint revealed manual sound control, but also reported:

```text
spTwowayTalk: false
```

At first that looked like a dead end.

Public ESee/Juan CameraSDK source showed something more interesting:

```text
vop2p_call
vop2p_send
vop2p_hangup
```

with G711A audio at 8 kHz.

## Port 10000 was not DVRIP

A DVRIP attempt failed.

A direct WebSocket probe changed the picture:

```text
ws://CAMERA_IP:10000   -> OPEN
wss://CAMERA_IP:10000  -> FAIL
```

So port 10000 was the native WebSocket transport used by this firmware family.

## The SDK bug

The SDK's direct-IP path passed the string `"ws"` into code that chose between WS and WSS using a truthy test.

A non-empty string is truthy, so the SDK accidentally selected WSS.

After changing the selector to a real false boolean, the same camera returned:

```text
CONNECT: 0
LOGIN: 0
```

## Native talkback actually worked

The next test returned:

```text
TALKBACK RESULT: 0
```

G711A frames were then transmitted in 160-byte chunks at 20 ms intervals.

The physical camera speaker played the test audio.

Finally, generated TTS was converted from PCM to G711A and Gini spoke an arbitrary sentence.

That gave Gini a mouth.

## Why this matters

The interesting part is not merely that one camera can speak.

It shows that low-cost consumer cameras may contain useful local capabilities hidden behind vendor applications, capability flags or undocumented protocol layers.

On the tested Trueview T18205-A, the reported two-way-talk capability flag did not match the behavior of the lower-level native protocol.

## Current state

Verified:

- local H.264 video
- PTZ
- native WebSocket connection
- native authentication
- built-in alarm control
- arbitrary generated speech through the built-in speaker

Partially verified:

- microphone audio track is present, but the clean capture pipeline is still being built

Next:

- extract microphone audio
- local speech recognition
- wake word
- conversation loop
- person tracking
- autonomous PTZ behavior

## Responsible use

Only reverse engineer devices you own or have permission to test. Keep camera control interfaces off the public internet and remove credentials and unique device identifiers from published logs.
