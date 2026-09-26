# Troubleshooting

## CONNECT: -13

On the public CameraSDK version tested during Gini development, this meant the transport closed before the protocol handshake completed.

The important discovery was that the SDK accidentally selected WSS when direct IP mode needed plain WS.

Test:

```text
ws://CAMERA_IP:10000   -> expected to open on the tested unit
wss://CAMERA_IP:10000  -> expected to fail on the tested unit
```

## HTTP 404 on WebSocket attempt to port 80

The tested nginx service on port 80 is not the native ESee WebSocket endpoint.

Use the firmware's actual service paths for HTTP and port 10000 for the native WebSocket transport on this tested model.

## Talkback opens but audio is rough

Check:

1. Source PCM quality before encoding.
2. Downsample cleanly to 8 kHz.
3. Encode G711A correctly.
4. Send exactly 160 encoded bytes every ~20 ms.
5. Avoid clipping.
6. Add short silence before and after speech.

## Alarm is loud but TTS is quiet

The built-in alarm and live talkback are separate playback paths. Do not assume alarm volume equals talkback output volume.

## Camera mic status

The media stream exposes an audio track, but this repository does not yet claim clean standalone microphone capture as verified. That is the next milestone.
