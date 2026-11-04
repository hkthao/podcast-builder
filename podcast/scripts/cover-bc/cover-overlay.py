import sys, json, shutil, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
slug=sys.argv[1]
sp=json.load(open("tmp/cover-specs.json"))[slug]
src=f"input/{slug}.cover.png"; nt=f"tmp/{slug}.cover.notext.png"
if not os.path.exists(nt): shutil.copy(src,nt)
im=Image.open(nt).convert("RGB"); W,H=1024,1536; im=im.resize((W,H))
series=sp["series"]
# SAFE ZONE FB Reels (theme.ts): frame 1080x1920, top 160, bottom 380, left 80, right 140. Cover 1024x1536 scale x1.25 crop ngang 100px
SAFE_W=650   # cover px, can giua x 187..837 (safe frame 80..940)
SAFE_TOP=132 # cover px (=165 frame)
TNR="/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"; SFR="/System/Library/Fonts/SFNSRounded.ttf"
def font(path,size,var=None):
    f=ImageFont.truetype(path,size)
    if var:
        try: f.set_variation_by_name(var)
        except Exception: pass
    return f
def pad_top(img,frac,tone=None):
    s=1-frac; nw,nh=int(W*s),int(H*s)
    small=img.resize((nw,nh))
    top=img.crop((0,0,W,6)).resize((1,1)).getpixel((0,0)) if tone is None else tone
    if tone is None and series in('cx','dhv'): top=tuple(int(0.5*a+0.5*b) for a,b in zip(top,(226,206,170)))
    bg=Image.new("RGB",(W,H),top)
    mask=Image.new("L",(nw,nh),255); d=ImageDraw.Draw(mask)
    ed=120
    for i in range(ed):
        a=int(255*i/ed); d.rectangle((i,i,nw-i-1,nh-i-1),outline=a)
    bg.paste(small,((W-nw)//2,H-nh),mask); return bg
def fit(draw,lines,path,maxw,start,var=None):
    size=start
    while size>40:
        f=font(path,size,var)
        if max(draw.textlength(l,font=f) for l in lines)<=maxw: return f
        size-=4
    return font(path,40,var)
if series in("cx","dhv"):
    im=pad_top(im,0.17)
    d=ImageDraw.Draw(im)
    lines=sp["l1"].split("\n")
    f=fit(d,lines,TNR,SAFE_W,150)
    y=SAFE_TOP; col=(58,36,22) if series=="cx" else (110,26,26)
    halo=(240,226,196)
    for l in lines:
        w=d.textlength(l,font=f); x=(W-w)/2
        for dx in(-3,0,3):
            for dy in(-3,0,3): d.text((x+dx,y+dy),l,font=f,fill=halo)
        d.text((x,y),l,font=f,fill=col); y+=int(f.size*1.08)
    sub="CHUYỆN XƯA - NGẪM NAY" if series=="cx" else "DÒNG HỌ VIỆT"
    fs=fit(d,[sub],TNR,SAFE_W-48,46); w=d.textlength(sub,font=fs); y+=14
    d.rectangle(((W-w)/2-24,y-6,(W+w)/2+24,y+60),fill=(232,214,176))
    d.text(((W-w)/2,y),sub,font=fs,fill=col)
elif series=="bc":
    im=pad_top(im,0.12)
    d=ImageDraw.Draw(im); lines=sp["l1"].split("\n"); hi=sp.get("hi"); acc=sp["color"]
    f=fit(d,lines,SFR,SAFE_W,170,"Heavy"); y=SAFE_TOP
    for l in lines:
        w=d.textlength(l,font=f); x=(W-w)/2
        for sdx,sdy in((5,6),):
            d.text((x+sdx,y+sdy),l,font=f,fill=(10,14,30))
        if hi and hi in l:
            a,b=l.split(hi,1); xa=x; d.text((xa,y),a,font=f,fill=(250,244,230)); xa+=d.textlength(a,font=f)
            d.text((xa,y),hi,font=f,fill=acc); xa+=d.textlength(hi,font=f); d.text((xa,y),b,font=f,fill=(250,244,230))
        else: d.text((x,y),l,font=f,fill=(250,244,230))
        y+=int(f.size*1.1)
elif series=="ttl":
    im=pad_top(im,0.22,(246,244,236))
    d=ImageDraw.Draw(im); lines=sp["l1"].split("\n"); hi=sp.get("hi"); acc=sp["color"]
    f=fit(d,lines,SFR,SAFE_W,140,"Heavy"); y=SAFE_TOP
    for l in lines:
        w=d.textlength(l,font=f); x=(W-w)/2
        if hi and hi in l:
            a,b=l.split(hi,1); xa=x; d.text((xa,y),a,font=f,fill=(24,32,64)); xa+=d.textlength(a,font=f)
            d.text((xa,y),hi,font=f,fill=acc); xa+=d.textlength(hi,font=f); d.text((xa,y),b,font=f,fill=(24,32,64))
        else: d.text((x,y),l,font=f,fill=(24,32,64))
        y+=int(f.size*1.1)
im.save(src); print("saved",src)
