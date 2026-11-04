import sys, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
S=2; W,H=1024*S,1536*S
AMB=(227,155,91); INK=(9,14,26); INK2=(14,22,38)
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def P(pts): return [(x*S,y*S) for x,y in pts]
def base(top,bot):
    im=Image.new("RGB",(W,H)); d=ImageDraw.Draw(im)
    for y in range(H): d.line((0,y,W,y),fill=lerp(top,bot,y/H))
    return im
def add(im,layer): return Image.fromarray(np.clip(np.asarray(im).astype(int)+np.asarray(layer).astype(int),0,255).astype('uint8'))
def glow(im,ells,blur,col=(120,78,40)):
    g=Image.new("RGB",(W,H),(0,0,0)); d=ImageDraw.Draw(g)
    for (x0,y0,x1,y1,c) in ells: d.ellipse((x0*S,y0*S,x1*S,y1*S),fill=c or col)
    return add(im,g.filter(ImageFilter.GaussianBlur(blur*S)))
def rim(im,shapes,blur=5,alpha=110,col=AMB):
    m=Image.new("L",(W,H),0); d=ImageDraw.Draw(m)
    for kind,pts in shapes:
        if kind=="e": d.ellipse([c*S for c in pts],fill=alpha)
        else: d.rectangle([c*S for c in pts],fill=alpha)
    m=m.filter(ImageFilter.GaussianBlur(blur*S))
    return Image.composite(Image.new("RGB",(W,H),col),im,m)
def finish(im,path):
    n=np.random.default_rng(1).normal(0,5,(H,W,1))
    im=Image.fromarray(np.clip(np.asarray(im).astype(float)+n,0,255).astype('uint8')).resize((1024,1536),Image.LANCZOS)
    im.save(path)
def head_shoulders(d,cx,cy,r,sw,sh,col=INK,tilt=0,hair=None):
    d.ellipse(P([(cx-r+tilt,cy-r),(cx+r+tilt,cy+r)]),fill=col)
    d.rounded_rectangle([ (cx-sw)*S,(cy+r*0.9)*S,(cx+sw)*S,(cy+r*0.9+sh)*S ],radius=int(sw*0.5*S),fill=col)
def windows(d,x0,x1,y0,y1,col_on=(150,105,66),col_off=(24,36,60),p=0.25,seed=4,w=34,h=50,gx=80,gy=90):
    random.seed(seed)
    for yy in range(y0,y1,gy):
        for xx in range(x0,x1,gx):
            d.rectangle(P([(xx,yy),(xx+w,yy+h)]),fill=col_on if random.random()<p else col_off)

def scene_khongai():
    im=base((12,20,36),(30,42,66)); d=ImageDraw.Draw(im)
    d.rectangle(P([(0,520),(300,1100)]),fill=(18,28,48)); d.rectangle(P([(760,470),(1024,1100)]),fill=(18,28,48))
    d.rectangle(P([(300,640),(420,1100)]),fill=(22,33,56)); d.rectangle(P([(650,700),(780,1100)]),fill=(22,33,56))
    windows(d,30,260,580,1000); windows(d,790,980,530,1000,seed=7)
    for y in range(1080*S,H): d.line((0,y,W,y),fill=lerp((26,36,58),(14,22,38),(y-1080*S)/(H-1080*S)))
    im=glow(im,[(260,520,1000,1180,None),(330,1120,980,1360,(80,52,28))],90); d=ImageDraw.Draw(im)
    d.rectangle(P([(676,640),(692,1250)]),fill=INK)
    d.arc(P([(520,600),(700,720)])[0]+P([(520,600),(700,720)])[1],180,270,fill=INK,width=14*S)
    d.rectangle(P([(560,610),(700,628)]),fill=INK)
    d.polygon(P([(500,668),(612,668),(590,640),(522,640)]),fill=INK); d.ellipse(P([(528,664),(586,692)]),fill=(255,214,150))
    fx=420
    d.ellipse(P([(fx-46,780),(fx+46,872)]),fill=INK); d.rounded_rectangle(P([(fx-78,868),(fx+78,1080)]),radius=40*S,fill=INK)
    d.polygon(P([(fx-70,1070),(fx-10,1070),(fx-18,1300),(fx-72,1300)]),fill=INK); d.polygon(P([(fx+10,1070),(fx+70,1070),(fx+72,1300),(fx+18,1300)]),fill=INK)
    d.rounded_rectangle(P([(fx-82,1296),(fx-8,1326)]),radius=12*S,fill=INK); d.rounded_rectangle(P([(fx+8,1296),(fx+86,1326)]),radius=12*S,fill=INK)
    d.polygon(P([(fx-70,900),(fx-40,880),(fx+20,1000),(fx-10,1030)]),fill=INK2); d.polygon(P([(fx+70,900),(fx+40,880),(fx-20,1000),(fx+10,1030)]),fill=INK2)
    d.rounded_rectangle(P([(fx-52,985),(fx+52,1050)]),radius=8*S,fill=(140,84,50)); d.rectangle(P([(fx-44,985),(fx+44,1006)]),fill=(214,214,200))
    im=rim(im,[("e",(fx+30,790,fx+50,860)),("r",(fx+66,880,fx+80,1060))]); d=ImageDraw.Draw(im)
    cx,cy=830,1250
    d.ellipse(P([(cx-50,cy-30),(cx+50,cy+40)]),fill=(8,12,22)); d.ellipse(P([(cx-70,cy-60),(cx-20,cy-5)]),fill=(8,12,22))
    d.polygon(P([(cx-70,cy-55),(cx-62,cy-82),(cx-50,cy-58)]),fill=(8,12,22)); d.polygon(P([(cx-42,cy-58),(cx-30,cy-82),(cx-22,cy-52)]),fill=(8,12,22))
    d.ellipse(P([(cx-62,cy-40),(cx-52,cy-32)]),fill=AMB); d.ellipse(P([(cx-40,cy-40),(cx-30,cy-32)]),fill=AMB)
    im=glow(im,[(300,1330,900,1380,(110,72,38))],24)
    return im

def scene_nhelong():
    im=base((10,18,34),(26,38,62)); d=ImageDraw.Draw(im)
    # window wall with rain-blurred city lights
    d.rectangle(P([(90,470),(934,980)]),fill=(16,26,46))
    rnd=random.Random(3)
    lights=Image.new("RGB",(W,H),(0,0,0)); ld=ImageDraw.Draw(lights)
    for _ in range(60):
        x=rnd.randint(120,900); y=rnd.randint(560,940); r=rnd.randint(8,22)
        ld.ellipse(P([(x-r,y-r),(x+r,y+r)]),fill=rnd.choice([(150,100,55),(90,70,60),(70,90,120)]))
    im=add(im,lights.filter(ImageFilter.GaussianBlur(10*S))); d=ImageDraw.Draw(im)
    for x in (300,512,724): d.rectangle(P([(x-6,470),(x+6,980)]),fill=(10,16,28))
    # table
    d.polygon(P([(0,1060),(1024,1060),(1024,1536),(0,1536)]),fill=(20,30,50))
    d.polygon(P([(120,1010),(904,1010),(1024,1130),(0,1130)]),fill=(34,48,76))
    # lamp on table
    im=glow(im,[(400,780,800,1180,(130,82,40))],80); d=ImageDraw.Draw(im)
    d.rectangle(P([(600,1000),(612,1092)]),fill=INK); d.polygon(P([(556,1000),(656,1000),(634,950),(578,950)]),fill=(200,140,80))
    # colleague across, head bowed over folder
    cx=470
    d.rounded_rectangle(P([(cx-110,930),(cx+110,1020)]),radius=50*S,fill=INK2); d.ellipse(P([(cx-40,860),(cx+40,950)]),fill=INK2)
    d.rectangle(P([(cx-90,1000),(cx+30,1032)]),fill=(180,170,150))
    # woman front-left, from behind/side with tilted head
    fx=250
    d.rounded_rectangle(P([(fx-170,1220),(fx+170,1536)]),radius=120*S,fill=INK)
    d.ellipse(P([(fx-82,1040),(fx+82,1210)]),fill=INK)
    d.polygon(P([(fx-60,1130),(fx+10,1230),(fx-90,1250)]),fill=INK)  # hair/shoulder curve
    d.ellipse(P([(fx-90,1050),(fx-30,1100)]),fill=INK)
    d.rounded_rectangle(P([(fx-215,1180),(fx-150,1536)]),radius=30*S,fill=(16,24,40))  # chair back
    im=rim(im,[("e",(fx+40,1060,fx+78,1190)),("r",(fx+120,1250,fx+160,1500))],blur=8)
    return im

def scene_thathu():
    im=base((11,18,32),(28,36,58)); d=ImageDraw.Draw(im)
    d.rectangle(P([(0,0),(1024,1536)]),fill=None)
    # back wall slightly lighter
    d.rectangle(P([(0,480),(1024,1150)]),fill=(22,31,52))
    # pendant lamp
    im=glow(im,[(380,520,820,1100,(120,78,40)),(300,1080,900,1300,(70,48,28))],90); d=ImageDraw.Draw(im)
    d.rectangle(P([(596,420),(604,640)]),fill=INK); d.polygon(P([(540,700),(660,700),(636,640),(564,640)]),fill=INK); d.ellipse(P([(560,690),(640,716)]),fill=(255,214,150))
    # kumquat tree right
    d.rectangle(P([(820,900),(830,1090)]),fill=INK); d.polygon(P([(770,1090),(880,1090),(866,1150),(784,1150)]),fill=(70,40,30))
    rnd=random.Random(5)
    d.ellipse(P([(740,740),(910,930)]),fill=(18,40,40))
    for _ in range(18):
        x=rnd.randint(765,885); y=rnd.randint(765,905); d.ellipse(P([(x-9,y-9),(x+9,y+9)]),fill=(228,140,50))
    # red tet strings left
    for i,x in enumerate((140,210,280)):
        d.line(P([(x,480),(x,560+i*30)]),fill=(110,30,30),width=3*S); d.ellipse(P([(x-18,560+i*30),(x+18,610+i*30)]),fill=(170,40,38))
    # table
    d.polygon(P([(0,1150),(1024,1150),(1024,1536),(0,1536)]),fill=(30,22,24)); d.rectangle(P([(0,1150),(1024,1170)]),fill=(48,34,32))
    # tea cup + steam
    d.ellipse(P([(520,1100),(620,1160)]),fill=(214,196,170)); d.rectangle(P([(528,1130),(612,1190)]),fill=(214,196,170)); d.ellipse(P([(528,1120),(612,1150)]),fill=(120,70,40))
    st=Image.new("RGB",(W,H),(0,0,0)); sd=ImageDraw.Draw(st); sd.arc(P([(560,1020),(590,1090)])[0]+P([(560,1020),(590,1090)])[1],90,300,fill=(80,66,52),width=6*S)
    im=add(im,st.filter(ImageFilter.GaussianBlur(4*S))); d=ImageDraw.Draw(im)
    # phone glowing
    d.rounded_rectangle(P([(660,1200),(780,1330)]),radius=14*S,fill=(40,50,70)); d.rounded_rectangle(P([(668,1208),(772,1322)]),radius=10*S,fill=(150,170,200))
    im=glow(im,[(600,1160,860,1380,(40,52,70))],50); d=ImageDraw.Draw(im)
    # woman from behind-left, shoulders relaxed
    fx=300
    d.rounded_rectangle(P([(fx-210,1160),(fx+210,1536)]),radius=140*S,fill=INK)
    d.ellipse(P([(fx-84,930),(fx+84,1110)]),fill=INK)
    d.ellipse(P([(fx-100,900),(fx+60,1060)]),fill=(14,20,32))  # hair bun mass
    d.ellipse(P([(fx+30,860),(fx+110,940)]),fill=INK)  # bun
    d.rounded_rectangle(P([(fx+60,1330),(fx+300,1390)]),radius=30*S,fill=INK)  # arm toward table, open hand
    d.ellipse(P([(fx+280,1318),(fx+340,1388)]),fill=(18,26,42))
    im=rim(im,[("e",(fx+40,950,fx+80,1090)),("r",(fx+170,1200,fx+205,1420))],blur=8)
    return im

def scene_thoigian():
    im=base((14,22,38),(34,44,66)); d=ImageDraw.Draw(im)
    d.rectangle(P([(0,470),(1024,1150)]),fill=(24,34,56))
    # window with dawn light left
    im=glow(im,[(40,520,520,1120,(150,98,48)),(300,900,900,1300,(70,48,28))],100); d=ImageDraw.Draw(im)
    d.rectangle(P([(90,560),(420,1040)]),fill=(236,176,112))
    for x in (255,): d.rectangle(P([(x-6,560),(x+6,1040)]),fill=(30,22,24))
    d.rectangle(P([(90,800),(420,812)]),fill=(30,22,24))
    d.rectangle(P([(78,552),(432,566)]),fill=(30,22,24)); d.rectangle(P([(78,1036),(432,1050)]),fill=(30,22,24))
    # floor
    d.polygon(P([(0,1150),(1024,1150),(1024,1536),(0,1536)]),fill=(26,20,24))
    # cabinet + vase + peach blossom
    d.rectangle(P([(560,1030),(900,1250)]),fill=(30,22,26)); d.rectangle(P([(560,1020),(900,1040)]),fill=(48,34,32))
    d.polygon(P([(690,950),(730,950),(740,1020),(680,1020)]),fill=(160,120,90))
    d.line(P([(710,950),(690,860),(660,780)]),fill=(60,36,30),width=6*S); d.line(P([(700,900),(760,840),(800,770)]),fill=(60,36,30),width=6*S)
    rnd=random.Random(9)
    for _ in range(46):
        x=rnd.choice([rnd.randint(640,700),rnd.randint(750,820)]); y=rnd.randint(740,900); r=rnd.randint(8,15)
        d.ellipse(P([(x-r,y-r),(x+r,y+r)]),fill=rnd.choice([(232,150,160),(240,180,185),(214,120,140)]))
    # wall calendar
    d.rectangle(P([(740,560),(920,800)]),fill=(228,220,200)); d.rectangle(P([(740,560),(920,620)]),fill=(170,40,38))
    for r_ in range(4):
        for c in range(5): d.rectangle(P([(756+c*30,640+r_*34),(776+c*30,660+r_*34)]),fill=(150,140,120))
    d.ellipse(P([(816+0,606),(842,632)]),fill=(235,180,60))
    # woman standing, facing calendar, hand raised
    fx=560
    d.ellipse(P([(fx-50,640),(fx+50,740)]),fill=INK)
    d.rounded_rectangle(P([(fx-90,730),(fx+90,1010)]),radius=50*S,fill=INK)
    d.polygon(P([(fx-84,1000),(fx+84,1000),(fx+110,1330),(fx-110,1330)]),fill=INK)
    d.polygon(P([(fx+70,760),(fx+105,775),(fx+190,640),(fx+160,620)]),fill=INK2)  # raised arm toward calendar
    d.ellipse(P([(fx+150,596),(fx+196,646)]),fill=INK2)
    d.ellipse(P([(fx-60,600),(fx+30,700)]),fill=(14,20,32))
    im=rim(im,[("e",(fx-62,650,fx-40,720)),("r",(fx-96,780,fx-76,1000))],blur=8)
    return im

SC={"khong-ai-thay-ta-co-con-tu-te":scene_khongai,"vi-sao-ta-nhe-long-khi-nguoi-khac-kho":scene_nhelong,"co-nen-tha-thu-khi-chua-ai-xin-loi":scene_thathu,"vi-sao-cang-lon-thoi-gian-troi-cang-nhanh":scene_thoigian}
for s in sys.argv[1:]:
    finish(SC[s](),f"tmp/{s}.cover.notext.png"); print("drew",s)
