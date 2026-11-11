# Measuring the original RigidChips 1.5B26 under wine

The original exe (quarantined copy, not in this repo) runs in WSL2 Ubuntu-24.04 with wine 9
(`WINEPREFIX=~/.wine-rc`, win32) on an Xvfb display. It loads `Resources/Basic.txt` as the default
model and `Resources/System.rcs` as the default scenario, so experiments replace those two files.

- `harness_System.rcs` — scenario: every Wheel/RLW gets `POWER` ±2500 (by side) during frames
  31..150, rest pose of every chip at frame 30 → `geom.txt`, per-frame core state → `log.txt`
  (written once at frame 330; file handles do not survive across frames in the original).
- `harness_turn.rcs` — same with power until 210 and the first Rudder set to 20° (note: the model's
  own `angle=Val` overrides `_SET ANGLE` each frame; use a model with a constant angle instead).
- `harness_turn2.rcs` — log only (same columns as `harness_turn.rcs`); the model drives and steers itself
  (Val defaults + its own Lua, see `rc_models17.sh`/`rc_models18.sh`). Replay with
  `cargo run --release --bin orig_compare -- <model> <out.csv> --self --turn --nocourse` (in `core/`) and compare both
  logs with `turndiff.py <csv…>` (speed, yaw rate, radius, lateral g, body slip per 20-frame window).
- `harness_wheels.rcs` — log only: core pose/velocity/Euler plus `_WY` of up to six wheels (`rc_models19.sh`
  straight-line spin probes). Replay with `--self --wheels`.
- `rc_launch.sh <secs>` — one run with a screenshot. `rc_batch.sh name:model:power ...` — batch
  runs, copies `log.txt`/`geom.txt`/screenshot to `D:\rigidcraft-models\quarantine\original\runs\`.
  `HARNESS=<path>` picks the scenario. `rc_models.sh` … `rc_models44.sh` write the probe models (the model names are the evidence column of docs/measured.md).
- Replay in RigidCraft: `cargo run --release --bin orig_compare -- <model> <out.csv> --allwheels --off=210` (in `core/`).

Results are summarised in `docs/measured.md`.

For the static-angle binding diagnostic, `standing-angle-variable.rcd` and
`standing-angle-literal.rcd` are an 18-tile generated fixture pair. Run either with
`harness_idle.rcs` through `run_probe.sh` (log name `idle.csv`). Their original
240-frame traces were identical; `standing-angle-original.csv` stores the shared
result. See `docs/sprints-45-47.md` for provenance. The replay tool named there was removed with the
TypeScript core; the same fixture is now checked by `core/tests/sim.rs`
(`holds_the_original_measured_variable_angle_standing_fixture`).

## Index: which script produced which measurement

The sections of `docs/measured.md` name their evidence by model or run name. This is where each comes from
(added 2026-11-11; scripts not listed under a section are operator utilities or re-run lists).

| measurement (docs/measured.md) | runner | models / scenario |
|---|---|---|
| first table (wheel, jet, servo, aero, brake, friction, arm, fuel, cowl: `jet_*`, `servo_*`, `sag_*`, `aero_*`, `sled_*`, `roll?_*`, `wheelmass_*`, `brake3_*`, `fric_*`, `arm*`, `fuel_*`, `cowl_*`, `leg_*`, `sign_*`) | `rc_batch.sh` (`HARNESS=` picks the `.rcs`) | `rc_models.sh` … `rc_models30.sh`, `rc_models35.sh` |
| key numbers (`keys.csv`) | `rc_keys.sh` | `harness_keys.rcs` |
| balls and wind (`ball1/3.png`) | `rc_ball.sh` | — |
| corpus walkers | `rc_walk.sh` | `harness_turn3.rcs` |
| orientation API, rotor and spawn logs (`s22-api.csv`, `s23-rotor.csv`, `spawn.csv`) | `rc_batch.sh` | `harness_orientation.rcs`, `harness_settled.rcs`, `harness_rotor.rcs`, `harness_spawn.rcs` |
| standing angle (sprints 45–47) | `run_probe.sh` | `harness_idle.rcs`, `standing-angle-*.rcd` |
| camera views A–J | `rc_camera.sh`, `rc_camera_models.sh`, `rc_camera_batch2.sh` (`batch3` re-runs six of its cases) | `harness_camera.rcs` |
| kerb strike | `rc_step.sh` (`rc_step_batch.sh`; needs `lands/step_<h>.body` from `make_step_land.py <h> <out>`), `stepdiff.py` | `rc_step_control.sh` writes the driving model |
| terrain probes (tier 1) | `rc_terrain.sh` (`rc_terrain_batch.sh`, `rc_terrain_high.sh`), `make_land.py`, `terraindiff.py` | `terrains.json` |
| corpus geometry (tier 2) | `rc_geom_corpus.sh` (`rc_geom_one.sh`), `geomrank.py` | corpus |
| corpus driving (tier 3) | `rc_drive_corpus.sh` (`rc_drive_custom.sh` adds `HARNESS`/`OUTDIR`/`INDEX`; `rc_drive_one.sh` is its older single-model form), `driverank.py` | `rc_models31.sh` … `rc_models44.sh` for the isolated rigs |
| ground contact | `rc_ground.sh`, `rc_ground_default.sh` | `harness_servo2.rcs` |
| water, raft drag | `water-probe.py` | generated |
| collision joint failure | `crash-probe.py` | generated; `core/src/bin/crash.rs` |
| plane speed, wing pair, incidence, banked lift | `flight-probe.py`, `wing-probe.py`, `bank-probe.py` | generated; `core/src/bin/{flight,bank}.rs` |

`geomrank.py` and `driverank.py` read `SNAP_DIR` (default `snap`), while `core/src/bin/replay.rs` writes to `snap_rust`
unless `SNAP_DIR` is set: export `SNAP_DIR` for both. `aerodiff.py`, `geomdiff.py` and `servodiff.py` compare against
output of the removed TypeScript tools and are kept for the record.
