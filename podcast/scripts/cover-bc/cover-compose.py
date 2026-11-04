#!/usr/bin/env python3
"""Chèn chữ cover bằng PhotoCraft CLI (Docker, --network none) cho kênh bc (ByteCast) và ttl (Tiền & Tâm Lý).
cx/dhv (chữ có chân sepia) vẫn dùng cover-overlay.py (Pillow) cho tới khi chọn font serif.
Dùng: /usr/bin/python3 podcast/scripts/cover-bc/cover-compose.py <slug>
Cần: Docker, ~/.local/photocraft/photocraft-0.20.1-linux-aarch64 (bản Linux arm64 của photocraft-cli, kiểm SHA256), tmp/cover-specs.json,
tmp/<slug>.cover.notext.png. Vùng an toàn FB Reels: SAFE_W/SAFE_TOP (xem theme.ts SAFE_ZONE)."""
import sys, os, json, subprocess, tempfile, shutil
from PIL import Image, ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.abspath(os.path.join(HERE,"..","..",".."))
PCDIR=os.environ.get("PHOTOCRAFT_DIR",os.path.expanduser("~/.local/photocraft/photocraft-0.20.1-linux-aarch64"))
SAFE_W=650; SAFE_TOP=132; W,H=1024,1536
slug=sys.argv[1]; sp=json.load(open(os.path.join(ROOT,"tmp/cover-specs.json")))[slug]; series=sp["series"]
if series not in("bc","ttl"):
    sys.exit(subprocess.call(["/usr/bin/python3",os.path.join(HERE,"cover-overlay.py"),slug]))
src=os.path.join(ROOT,f"input/{slug}.cover.png"); nt=os.path.join(ROOT,f"tmp/{slug}.cover.notext.png")
if not os.path.exists(nt): shutil.copy(src,nt)
im=Image.open(nt).convert("RGB").resize((W,H))
def pad_top(img,frac,tone=None):
    s=1-frac; nw,nh=int(W*s),int(H*s); small=img.resize((nw,nh))
    top=img.crop((0,0,W,6)).resize((1,1)).getpixel((0,0)) if tone is None else tone
    bg=Image.new("RGB",(W,H),top); mask=Image.new("L",(nw,nh),255); d=ImageDraw.Draw(mask)
    for i in range(120): d.rectangle((i,i,nw-i-1,nh-i-1),outline=int(255*i/120))
    bg.paste(small,((W-nw)//2,H-nh),mask); return bg
im=pad_top(im,0.12) if series=="bc" else pad_top(im,0.22,(246,244,236))
lines=sp["l1"].split("\n"); hi=sp.get("hi"); acc=sp["color"]
text="\n".join(lines)
if series=="bc": font,txt,shadow=("Nunito",(250,244,230),True)
else: font,txt,shadow=("Be Vietnam Pro",(24,32,64),False)
hexc=lambda c:"#%02x%02x%02x"%c
rng=None
if hi:
    i=text.find(hi.replace("\n","\n"))
    if i>=0: rng=[i,i+len(hi)]
tmp=tempfile.mkdtemp(); os.makedirs(tmp+"/in"); os.makedirs(tmp+"/out"); im.save(tmp+"/in/bg.png")
def run(size):
    cmds=["--cmd","type.create","--params",json.dumps({"text":text,"box":[62,SAFE_TOP,900,420],"align":"center","font":font,"weight":900,"size":size,"color":hexc(txt),"leading":round(size*1.1)},ensure_ascii=False)]
    if rng: cmds+=["--cmd","type.setStyle","--params",json.dumps({"range":rng,"color":acc})]
    if shadow: cmds+=["--cmd","layer.layerStyle.dropShadow","--params",json.dumps({"color":"#0a0e1e","opacity":85,"distance":6,"size":5})]
    r=subprocess.run(["docker","run","--rm","--network","none","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--memory","2g",
        "-v",PCDIR+":/pc:ro","-v",os.path.join(HERE,"fonts")+":/usr/share/fonts/truetype/custom:ro","-v",tmp+"/in:/in:ro","-v",tmp+"/out:/out",
        "debian:bookworm-slim","/pc/bin/photocraft-cli","run","/in/bg.png",*cmds,"--out","/out/r.png"],capture_output=True,text=True)
    first=json.loads(r.stdout.splitlines()[0])["result"]["bounds"]; return first
from PIL import ImageFont
FONTFILE=os.path.join(HERE,"fonts","Nunito[wght].ttf" if series=="bc" else "BeVietnamPro-Black.ttf")
def measure(size):
    f=ImageFont.truetype(FONTFILE,size)
    if series=="bc":
        try: f.set_variation_by_axes([900])
        except Exception: pass
    return max(f.getlength(l) for l in lines)
size=170 if series=="bc" else 140
while size>40 and measure(size)>SAFE_W-20: size-=4
for _ in range(6):
    b=run(size); w=b[2]-b[0]
    if w<=SAFE_W and b[0]>=(W-SAFE_W)//2-3 and b[2]<=(W+SAFE_W)//2+3: break
    size=int(size*(SAFE_W-12)/max(w,1))
Image.open(tmp+"/out/r.png").convert("RGB").save(src); shutil.rmtree(tmp); print("composed",src,"size",size)
