#!/usr/bin/env python3
"""Đoạn mở 6s (cảnh nhiều lớp + chữ chạy) bằng EffectCraft CLI trong Docker (--network none).
Mỗi tập (slug) bốc NGẪU NHIÊN có seed theo slug: chuyển động camera, kiểu chữ, hiệu ứng khí quyển, hậu kỳ, kiểu mở đầu.
Dùng: /usr/bin/python3 intro-compose.py <slug> --layers DIR --l1 "NHẸ LÒNG" --l2 "RỒI XẤU HỔ" --tag "BYTECAST · TÂM LÝ HỌC" [--seed N] [--out F.mp4] [--accent "#E39B5B"]
DIR có các PNG 1280x1920 (bg, bokeh, table, glow, mid, near, vignette) — xem tmp/layers_nhelong.py làm mẫu.
Cần ~/.local/effectcraft/effectcraft-0.21.0-linux-aarch64 và font OFL trong cover-bc/fonts (Nunito, Be Vietnam Pro)."""
import sys, os, json, random, hashlib, argparse, subprocess, tempfile, shutil
HERE=os.path.dirname(os.path.abspath(__file__))
ECDIR=os.environ.get("EFFECTCRAFT_DIR",os.path.expanduser("~/.local/effectcraft/effectcraft-0.21.0-linux-aarch64"))
ap=argparse.ArgumentParser(); ap.add_argument("slug"); ap.add_argument("--layers",required=True); ap.add_argument("--l1",required=True); ap.add_argument("--l2",default="")
ap.add_argument("--tag",default=""); ap.add_argument("--seed",type=int); ap.add_argument("--out"); ap.add_argument("--accent",default="#E39B5B"); ap.add_argument("--dur",type=float,default=6)
a=ap.parse_args()
seed=a.seed if a.seed is not None else int(hashlib.md5(a.slug.encode()).hexdigest()[:8],16)
R=random.Random(seed)
CAM={"dollyIn":([520,970,-1560],[565,945,-1350]),"dollyOut":([565,945,-1380],[520,975,-1560]),"panRight":([440,960,-1500],[640,960,-1500]),
     "panLeft":([640,960,-1500],[440,960,-1500]),"riseUp":([540,1050,-1500],[540,880,-1480]),"handheldPush":([530,965,-1540],[555,950,-1400])}
TEXT=["bounceInWords","fadeUpCharacters","blurIn","trackingIn","typewriter","scramble","dropInLines"]
AMB={"dust":("CC Snowfall",100,"screen"),"rain":("CC Rainfall",45,"screen"),"fog":("Fractal Noise",13,"screen"),"flare":("Lens Flare",30,"screen"),"none":(None,0,"")}
POST=["glow","grain","vignette","glow+grain"]; REVEAL=["fade","blurFocus","flash","slowFade"]
cam=R.choice(list(CAM)); t1,t2=R.sample(TEXT,2); tag=R.choice(["trackingIn","typewriter","fadeUpCharacters"])
amb=R.sample(list(AMB),2) if R.random()<0.7 else [R.choice(list(AMB))]
if "none" in amb and len(amb)>1: amb=[x for x in amb if x!="none"]
post=R.choice(POST); rev=R.choice(REVEAL)
combo={"seed":seed,"camera":cam,"text":[t1,t2,tag],"ambient":amb,"post":post,"reveal":rev}
rgb=lambda h:[int(h[i:i+2],16)/255 for i in (1,3,5)]
acc=rgb(a.accent); cs,ce=CAM[cam]; D=a.dur
j=[]
j.append(f'var comp=app.project.items.addComp("Main",1080,1920,1,{D},30);')
j.append('function imp(n){return app.project.importFile(new ImportOptions(new File("/in/layers/"+n+".png")));}')
j.append('var CAMZ=1500; function add(n,z){var L=comp.layers.add(imp(n));L.threeDLayer=true;var s=100*(CAMZ+z)/CAMZ;L.property("Transform").property("Position").setValue([540,960,z]);L.property("Transform").property("Scale").setValue([s,s,s]);return L;}')
j.append('var bg=add("bg",700),bokeh=add("bokeh",600),table=add("table",350),glow=add("glow",300),mid=add("mid",200),near=add("near",-150);')
j.append('var vig=comp.layers.add(imp("vignette"));vig.property("Transform").property("Scale").setValue([84.4,100,100]);')
j.append(f'var cam=comp.layers.addCamera("Cam",[540,960]);var cp=cam.property("Transform").property("Position");cp.setValueAtTime(0,{cs});cp.setValueAtTime({D},{ce});')
if cam=="handheldPush": j.append('cp.expression="wiggle(1.1,5)";')
j.append('glow.property("Transform").property("Opacity").setValue(85);glow.property("Transform").property("Opacity").expression="wiggle(1.2,8)";bokeh.property("Transform").property("Position").expression="wiggle(0.3,14)";')
def fx(name,op,blend):
    j.append(f'var s_{name}=comp.layers.addSolid([0,0,0],"FX_{name}",1080,1920,1);s_{name}.property("Transform").property("Opacity").setValue({op});'+(f's_{name}.blendingMode=BlendingMode.{blend.upper()};' if blend!="normal" else ""))
fxlist=[]
for k in amb:
    e,op,bl=AMB[k]
    if e: fx(k,op,bl); fxlist.append((f"FX_{k}",e))
def txt(name,s,size,y,col,start):
    j.append(f'var t_{name}=comp.layers.addText("{s}");t_{name}.name="{name}";var sp=t_{name}.property("Source Text");var doc=sp.value;doc.fontSize={size};doc.font="Nunito";doc.fillColor={col};doc.justification=ParagraphJustification.CENTER_JUSTIFY;sp.setValue(doc);t_{name}.property("Transform").property("Position").setValue([540,{y}]);t_{name}.startTime={start};')
txt("Title1",a.l1,118,300,[0.98,0.957,0.9],0.4)
if a.l2: txt("Title2",a.l2,118,440,acc,1.0)
if a.tag: txt("Tag",a.tag,40,560,[0.7,0.75,0.85],1.9)
# post / reveal adjustment layers
adjs=[]
if "glow" in post or "grain" in post:
    j.append('var adj=comp.layers.addSolid([1,1,1],"ADJ",1080,1920,1);adj.adjustmentLayer=true;adj.property("Transform").property("Opacity").setValue(55);')
    adjs.append("ADJ")
if rev in("fade","slowFade"):
    dur=0.7 if rev=="fade" else 1.6
    j.append(f'var blk=comp.layers.addSolid([0,0,0],"REVEAL",1080,1920,1);var bo=blk.property("Transform").property("Opacity");bo.setValueAtTime(0,100);bo.setValueAtTime({dur},0);')
elif rev=="flash":
    j.append('var fl=comp.layers.addSolid([1,1,1],"REVEAL",1080,1920,1);var fo=fl.property("Transform").property("Opacity");fo.setValueAtTime(0,85);fo.setValueAtTime(0.35,0);')
else:
    j.append('var adj2=comp.layers.addSolid([1,1,1],"BLUR",1080,1920,1);adj2.adjustmentLayer=true;')
j.append('app.project.save(new File("/out/p.ecproj"));')
tmp=tempfile.mkdtemp(); os.makedirs(tmp+"/in"); os.makedirs(tmp+"/out"); shutil.copytree(a.layers,tmp+"/in/layers"); open(tmp+"/in/g.jsx","w").write("\n".join(j))
def ec(*args):
    r=subprocess.run(["docker","run","--rm","--network","none","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--memory","3g","-v",ECDIR+":/ec:ro","-v",os.path.join(HERE,"fonts")+":/usr/share/fonts/truetype/custom:ro","-v",tmp+"/in:/in:ro","-v",tmp+"/out:/out","debian:bookworm-slim","/ec/bin/effectcraft-cli",*args],capture_output=True,text=True)
    if r.returncode: print("ERR",args[:3],r.stdout[-300:],r.stderr[-300:],file=sys.stderr)
    return r
def ex(cid,params): return ec("exec",cid,"--params",json.dumps(params,ensure_ascii=False),"/out/p.ecproj","--save")
ec("script","/in/g.jsx")
for name,p in (("Title1",t1),("Title2",t2),("Tag",tag)):
    if name=="Title2" and not a.l2: continue
    if name=="Tag" and not a.tag: continue
    ex("layer.applyTextPreset",{"layer":name,"preset":p}); ex("layer.setText",{"layer":name,"variations":{"wght":900 if name!="Tag" else 700}})
for ln,e in fxlist: ex("effect.apply",{"effect":e,"layers":[ln]})
if adjs:
    if "glow" in post: ex("effect.apply",{"effect":"Glow","layers":["ADJ"]})
    if "grain" in post: ex("effect.apply",{"effect":"Add Grain","layers":["ADJ"]})
if post=="vignette": ex("effect.apply",{"effect":"CC Vignette","layers":["ADJ"]}) if adjs else None
if rev=="blurFocus": ex("effect.apply",{"effect":"Gaussian Blur","layers":["BLUR"]})
out=a.out or f"{a.slug}.intro.mp4"
r=ec("render","--comp","Main","--out","/out/o.mp4","--format","h264","--video-quality","80","/out/p.ecproj")
shutil.copy(tmp+"/out/o.mp4",out); shutil.rmtree(tmp); print(json.dumps(combo,ensure_ascii=False)); print("->",out)
