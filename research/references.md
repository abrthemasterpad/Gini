# Research references

These projects helped identify the protocol family and useful implementation details.

## go2rtc

Project:
https://github.com/AlexxIT/go2rtc

Relevant area: Bubble camera protocol support.

## Trueview / ESee CameraSDK research

https://github.com/harsh-chalo/trv-log-all-configs

Useful findings included:

- ESee/Juan native connection code
- `R/SoundManCtrl`
- VOP2P call/send/hangup
- G711A talkback framing

Gini does not assume third-party code can be redistributed. Review each upstream license before vendoring or copying source into this repository.

## Decompiled ESee/Juan application sources

https://github.com/Yolo-cell-hash/decompiled_files

Useful for cross-checking option names such as:

```text
R/SoundManCtrl
```

## dvr163 research

https://github.com/pgross41/dvr163

Useful background on local interfaces in the broader ESeeCloud / dvr163 ecosystem.

## Publication rule

When adding an external discovery to Gini:

1. Link the original source.
2. Clearly distinguish upstream findings from our own tests.
3. Mark behavior as verified only after reproducing it on physical hardware.
4. Never copy code into this repository until its license is understood.
