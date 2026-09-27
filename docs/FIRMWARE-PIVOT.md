# Gini Firmware Pivot

## Goal

Replace the stock Trueview/Juan/N1 firmware with an open, controllable camera firmware layer suitable for Gini.

The camera should become a hardware appliance that exposes clean local interfaces for:

- H.264 video
- microphone capture
- speaker/talkback
- pan/tilt motors
- IR cut / white light / IR LEDs
- snapshots
- local configuration
- watchdog/reboot
- local API for Gini Brain

Gini Brain, STT, vision reasoning, memory and higher-level AI remain on the PC/SBC rather than on the camera SoC.

## Preferred path

1. Identify the exact SoC, image sensor, SPI flash size, RAM, Wi-Fi chip and PTZ motor interface.
2. Make a complete stock flash backup before changing anything.
3. Check the exact SoC against current OpenIPC support.
4. If supported, install OpenIPC Lite first.
5. Bring up image sensor and video.
6. Bring up microphone and speaker.
7. Map pan/tilt motor GPIO/driver.
8. Map IR cut, IR LEDs, white LEDs, reset button and speaker amplifier-enable pin.
9. Add a Gini-specific board overlay/config.
10. Expose stable local APIs to the existing Gini Brain.

## Why OpenIPC first

OpenIPC already provides a Linux camera firmware base, Majestic media streamer, audio/two-way talk support, RTSP/WebRTC, GPIO configuration and camera-oriented tooling. Rebuilding all of this from zero would add large risk with no advantage unless the exact SoC is unsupported.

## Important hardware rule

Do not flash by model number alone.

Camera vendors can change SoC, sensor, flash and Wi-Fi hardware without changing the retail model name. We must identify the actual PCB components in this specific camera.

## Phase F0 — non-destructive hardware identification

Required evidence:

- clear photo of the entire main PCB, both sides if accessible
- close-up of the largest SoC chip marking
- close-up of SPI NOR flash chip marking
- close-up of Wi-Fi chip/module marking
- close-up of camera sensor PCB/module marking
- close-up of motor-driver IC(s)
- close-up of any 3- or 4-pin pads/header likely to be UART

If UART is available, use 3.3 V TTL only. Power the camera normally; connect only GND, adapter RX and adapter TX. Do not connect the adapter's 5 V line.

## Phase F1 — stock firmware backup

Before any erase/write:

- capture full UART boot log
- record U-Boot environment
- identify flash size and partition map
- dump the complete SPI flash
- record MAC address and calibration data
- verify the backup size and hash
- prepare a tested recovery procedure

No OpenIPC write happens before this phase passes.

## Phase F2 — OpenIPC fit test

Check:

- exact SoC has a current OpenIPC image
- exact sensor driver exists for that SoC family
- flash size is sufficient
- Wi-Fi chip has a usable kernel module/driver
- audio input/output is supported
- GPIO/motor access is available

If all pass, use OpenIPC Lite as the Gini firmware base.

## Phase F3 — Gini board port

Create a board-specific map for:

- pan motor coils or motor driver
- tilt motor coils or motor driver
- IR-cut coils
- IR LED
- white LED
- speaker amplifier enable
- reset button
- SD power
- microphone/audio codec routing

PTZ may use OpenIPC gpio-motors or a small Gini motor daemon depending on the board.

## Audio target

The stock firmware advertises/behaves as half-duplex. Gini does not require simultaneous full-duplex audio to work well.

Minimum reliable firmware behavior:

listen -> close capture cleanly -> speak -> close talkback cleanly -> resume capture

If the hardware supports simultaneous mic and speaker without feedback or codec conflicts, full duplex can be enabled later.

## If OpenIPC does not support the SoC

Do not immediately build an entire firmware from scratch.

Fallback order:

1. Port OpenIPC to the exact SoC using its vendor BSP/SDK if obtainable.
2. Reuse the stock kernel/vendor media modules with a custom userspace/rootfs if technically possible.
3. Only then consider a new Buildroot firmware.

A from-scratch image requires bootloader, kernel/BSP, sensor ISP driver, encoder, audio, Wi-Fi, SD, GPIO, PTZ and recovery support, so it is the most expensive path.

## Success criteria

The firmware pivot is complete when one uninterrupted test can do:

1. stream video continuously
2. hear "Gini, turn left"
3. return the microphone transcript
4. move left
5. speak a reply
6. resume microphone capture without reboot
7. accept a second spoken command
8. expose a stable local API for later tracking and behaviors

## Current status

- Stock camera video: verified
- Stock PTZ: verified
- Stock microphone: verified
- Stock speaker: verified
- Stock STT/Brain: verified externally
- Stock firmware audio-state bug: reproduced
- Safe talkback hangup: verified
- Firmware replacement: research/identification phase
