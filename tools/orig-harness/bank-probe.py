"""Compare the onset of a banked turn in a uniform air mass, with no ground, thrust or gravity."""
import argparse
import csv
import importlib.util
import json
import math
import statistics
import subprocess
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("water", here / "water-probe.py")
water = importlib.util.module_from_spec(spec)
spec.loader.exec_module(water)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", type=Path)
parser.add_argument("--pitch", type=float, default=10)
parser.add_argument("--banks", type=float, nargs="+", default=[0, -30, 30])
parser.add_argument("--wind", type=float, default=20)
args = parser.parse_args()
if not all(math.isfinite(n) for n in [args.wind, args.pitch, *args.banks]):
    parser.error("angles and wind must be finite")
args.output.mkdir(exist_ok=False)
model = args.output / "wing.txt"
model.write_text("Val {} Key {} Body { Core(){ W:Chip(){} E:Chip(){} } }\n")
core = here.parents[1] / "core"
subprocess.run(["cargo","build","--locked","--bin","bank"],cwd=core,check=True)
for bank in args.banks:
    out = args.output / f"bank-{bank:g}"
    out.mkdir()
    water.LOGGER = r'''n=0
buf="frame,y,vy,h,x,z,roll,pitch,qx,qy,qz,qw,hit,parent1,parent2\n"
function OnInit() n=0 end
function OnReset() end
function OnFrame()
 n=n+1
 _SETREG("U",1) _SETREG("G",0) _SETREG("A",1)
 if n==30 then _ENERVATE(0) _WARP(0,0,100,0) _ROTATE(0,PITCH,0,BANK) end
 if n==60 then _SETWIND(0,0,WIND) end
 local x,y,z,m=0,0,0,0
 for i=0,2 do local w=_M(i) x=x+w*_X(i) y=y+w*_Y(i) z=z+w*_Z(i) m=m+w end
 buf=buf..n..","..y/m..",".._VY(0)..",".._H(0)..","..x/m..","..z/m..",".._EZ(0)..",".._EX(0)..",".._QX(0)..",".._QY(0)..",".._QZ(0)..",".._QW(0)..",".._GETHIT(0,"LAND")..",".._GET(1,"PARENT")..",".._GET(2,"PARENT").."\n"
 if n==LAST_FRAME then local f=_FOPEN("water.csv","w") if f>=0 then _FPUTS(f,buf) _FCLOSE(f) end end
end
'''.replace("PITCH",str(args.pitch)).replace("BANK",str(bank)).replace("WIND)",str(args.wind)+")")
    sys.argv=["water-probe","0","--model-file",str(model),"--frames","120","--out",str(out/"original")]
    water.main()
    (out / "case.json").write_text(json.dumps({"pitch": args.pitch, "bank": bank, "wind_z": args.wind,
                                               "exe_sha256": water.EXPECTED}, indent=2))
    with (out/"original/wing_base0.csv").open() as stream:
        orig=list(csv.DictReader(stream))
    for row in orig[50:90]:
        assert float(row["y"])>90 and all(float(row[k])==0 for k in ("hit","parent1","parent2")), row
    start = 63  # frame 64, after the change of wind
    axes = ("x", "y", "z")
    velocity = [15*(float(orig[start+1][k])-float(orig[start-1][k])) for k in axes]
    q=[float(orig[start][k]) for k in ("qx","qy","qz","qw")]
    assert abs(sum(v*v for v in q)-1)<0.001
    with (out/"snap.csv").open("w") as stream:
        subprocess.run([core/"target/debug/bank", model, *map(str,q), str(args.wind), *map(str,velocity)],stdout=stream,check=True)
    with (out/"snap.csv").open() as stream:
        snap=list(csv.DictReader(stream))
    for name, rows, offset in [("B26", orig, start), ("Snap", snap, 0)]:
        accelerations, lifts, speeds = [], [], []
        for frame in range(offset + 2, offset + 7):
            prev, now, following = rows[frame-1:frame+2]
            acc = [(float(following[k]) - 2*float(now[k]) + float(prev[k])) * 900 for k in axes]
            relative = [(float(following[k]) - float(prev[k])) * 15 for k in axes]
            relative[2] -= args.wind
            speed = math.hypot(*relative)
            if speed < 0.1:
                raise ValueError("Airspeed too low to resolve lift")
            along = sum(a*v for a,v in zip(acc, relative)) / speed**2
            accelerations.append(acc)
            lifts.append([a - along*v for a,v in zip(acc, relative)])
            speeds.append(speed)
        for label, samples in [("accel", accelerations), ("lift/mass", lifts)]:
            components = [round(statistics.mean(axis), 3) for axis in zip(*samples)]
            print(name, "bank", bank, "airspeed", round(statistics.mean(speeds), 3),
                  label, "(x,y,z) m/s²", components, flush=True)
