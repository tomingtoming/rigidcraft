"""Compare the air switch and wing joint stiffness on an airborne symmetric fixture."""
import argparse
import csv
from itertools import product
import importlib.util
import subprocess
import sys
from statistics import mean
from pathlib import Path

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("water", here / "water-probe.py")
water = importlib.util.module_from_spec(spec)
spec.loader.exec_module(water)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path, help="new private results directory")
parser.add_argument("--incidence", type=float, nargs="+", help="wing angle in degrees to vertical airflow (0=edge-on, 90=broadside)")
args = parser.parse_args()
if args.incidence and any(not 0 <= a <= 90 for a in args.incidence):
    parser.error("incidence must be between 0 and 90")
args.output.mkdir(exist_ok=False)
logger = water.LOGGER.replace("yaw\\n", "yaw,y3,y4,parent3,parent4\\n").replace(
    '_EY(0).."\\n"', '_EY(0)..",".._Y(3)..",".._Y(4)..",".._GET(3,"PARENT")..",".._GET(4,"PARENT").."\\n"')
core = here.parents[1] / "core"
subprocess.run(["cargo", "build", "--locked", "--bin", "flight"], cwd=core, check=True)
cases = [(1, 1, a) for a in args.incidence] if args.incidence else list(product((0, 1), (1, 0.2), (90,)))
frames = 240 if args.incidence else 90
for air, spring, incidence in cases:
    name = f"air-{air}-spring-{spring}"
    trial = args.output / (f"{name}-inc-{incidence:g}" if args.incidence else name)
    trial.mkdir()
    model = trial / "wing.txt"
    model.write_text(f"""Val {{ FOLD(default={90-incidence:g},min=-90,max=90) }} Key {{}}
Body {{ Core(){{ N:Jet(power=9000){{}} S:Jet(power=9000){{}}
W:Chip(angle=FOLD,spring={spring},damper=0.5){{}}
E:Chip(angle=FOLD,spring={spring},damper=0.5){{}} }} }}
""")
    water.LOGGER = logger.replace("KEY_CUE", f'_SETREG("A",{air}) _SETREG("G",0) _SETREG("J",1) _SETREG("U",1)')
    sys.argv = ["water-probe", "0", "--model-file", str(model), "--frames", str(frames), "--out", str(trial/"original")]
    water.main()
    with (trial / "snap.csv").open("w") as out:
        subprocess.run([core/"target/debug/flight", model, str(frames), "1", "fixed-plane" if air else "thrust", "3", "4"], stdout=out, check=True)
    for path in [trial/"original/wing_base0.csv", trial/"snap.csv"]:
        with path.open() as stream:
            rows = list(csv.DictReader(stream))
        for r in rows[29:]:
            assert float(r["y"]) > 2 and all(float(r[key]) == 0 for key in ["parent3","parent4"]), (path,r)
        if args.incidence:
            # Later B26 frames develop pitch drift. Compare the same interval in both engines.
            velocity = mean(float(row["vy"]) for row in rows[99:120])
            print(trial.name, path.name, "mean core local vy (frames 100..120)", round(velocity, 4))
        r = rows[59]
        sag = (float(r["y3"])+float(r["y4"]))/2-float(r["y"])
        print(trial.name, path.parent.name, "frame", r["frame"], "vy", round(float(r["vy"]),3), "tip-core height", round(sag,4),flush=True)
