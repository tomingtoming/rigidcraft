#!/bin/bash
# The ground probes of rc_ground.sh on the original's default land (harness_servo2.rcs: chips 0..9 every frame).
M=/mnt/d/rigidcraft-models/quarantine/original/runs/ground/models
L=""
for n in "$@"; do cp "$M/$n.txt" "$HOME/rc/models/gd_$n.txt"; L="$L gd_$n:gd_$n.txt:0"; done
D=$(cd "$(dirname "$0")" && pwd)
HARNESS=$D/harness_servo2.rcs bash "$D/rc_batch.sh" $L
