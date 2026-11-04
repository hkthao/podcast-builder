import random, numpy as np
from PIL import Image, ImageDraw, ImageFilter
K=1.25; S=2; W,H=int(1024*K),int(1536*K)   # 1280x1920
INK=(9,14,26); INK2=(14,22,38); AMB=(227,155,91)
def P(pts): return [(x*K*S,y*K*S) for x,y in pts]
def R(x0,y0,x1,y1): return [x0*K*S,y0*K*S,x1*K*S,y1*K*S]
def canvas(): return Image.new("RGBA",(W*S,H*S),(0,0,0,0))
def save(im,name): im.resize((W,H),Image.LANCZOS).save(f"in/layers/{name}.png")
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
# L0: background gradient + window + bokeh
im=Image.new("RGBA",(W*S,H*S)); d=ImageDraw.Draw(im)
for y in range(H*S): d.line((0,y,W*S,y),fill=lerp((10,18,34),(26,38,62),y/(H*S))+(255,))
d.rectangle(R(90,470,934,980),fill=(16,26,46,255))
save(im,"bg")
# bokeh lights (separate layer so it can drift)
bk=canvas(); bd=ImageDraw.Draw(bk); rnd=random.Random(3)
for _ in range(70):
    x=rnd.randint(120,900); y=rnd.randint(540,950); r=rnd.randint(8,24)
    c=rnd.choice([(190,125,70),(120,92,80),(80,104,150)])
    bd.ellipse(R(x-r,y-r,x+r,y+r),fill=c+(200,))
bk=bk.filter(ImageFilter.GaussianBlur(9*S)); save(bk,"bokeh")
# mullions + table (far/mid)
t=canvas(); td=ImageDraw.Draw(t)
for x in (300,512,724): td.rectangle(R(x-6,470,x+6,980),fill=(10,16,28,255))
td.polygon(P([(0,1060),(1024,1060),(1024,1536),(0,1536)]),fill=(20,30,50,255))
td.polygon(P([(120,1010),(904,1010),(1024,1130),(0,1130)]),fill=(34,48,76,255))
save(t,"table")
# lamp glow (soft radial)
g=canvas(); gd=ImageDraw.Draw(g); gd.ellipse(R(380,760,820,1200),fill=(170,110,56,255)); g=g.filter(ImageFilter.GaussianBlur(80*S))
a=np.asarray(g).astype(float); a[...,3]*=0.75; save(Image.fromarray(a.astype('uint8')),"glow")
# mid: lamp + colleague
m=canvas(); md=ImageDraw.Draw(m)
md.rectangle(R(600,1000,612,1092),fill=INK+(255,)); md.polygon(P([(556,1000),(656,1000),(634,950),(578,950)]),fill=(214,150,84,255))
cx=470
md.rounded_rectangle(R(cx-110,930,cx+110,1020),radius=50*S*K,fill=INK2+(255,)); md.ellipse(R(cx-40,860,cx+40,950),fill=INK2+(255,))
md.rectangle(R(cx-90,1000,cx+30,1032),fill=(180,170,150,255))
save(m,"mid")
# near: woman + chair
n=canvas(); nd=ImageDraw.Draw(n); fx=250
nd.rounded_rectangle(R(fx-170,1220,fx+170,1536),radius=120*S*K,fill=INK+(255,))
nd.ellipse(R(fx-82,1040,fx+82,1210),fill=INK+(255,)); nd.ellipse(R(fx-90,1050,fx-30,1100),fill=INK+(255,))
nd.polygon(P([(fx-60,1130),(fx+10,1230),(fx-90,1250)]),fill=INK+(255,))
nd.rounded_rectangle(R(fx-215,1180,fx-150,1536),radius=30*S*K,fill=(16,24,40,255))
rim=canvas(); rd=ImageDraw.Draw(rim); rd.ellipse(R(fx+40,1060,fx+78,1190),fill=AMB+(150,)); rd.rectangle(R(fx+120,1250,fx+160,1500),fill=AMB+(120,))
rim=rim.filter(ImageFilter.GaussianBlur(6*S)); n=Image.alpha_composite(n,rim); save(n,"near")
# vignette
v=Image.new("RGBA",(W,H),(0,0,0,0)); a=np.zeros((H,W,4),dtype=np.uint8); yy,xx=np.mgrid[0:H,0:W]; d2=((xx-W/2)/(W/2))**2+((yy-H*0.55)/(H*0.6))**2
a[...,3]=np.clip((d2-0.35)*170,0,200).astype(np.uint8); Image.fromarray(a).save("in/layers/vignette.png")
print("layers ok")
