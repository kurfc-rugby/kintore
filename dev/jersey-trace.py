# ジャージの絵（index.html の #jk-front／#jk-back）を作ったときのスクリプト。
# 元：部のユニホームのデザイン資料（pptx）の画像（前 image1.png・後ろ image4.png・エンブレム image2.png）。M を画像のフォルダに変えて実行。
import cv2, numpy as np, json, sys
from PIL import Image
M='/home/claude/uni/x/ppt/media/'
PAL={'base':(0x77,0x02,0x1f),'red':(0xc4,0x02,0x25),'white':(255,255,255),'gray':(0xb1,0xb1,0xb1),'pink':(0xee,0x9a,0x9e),'black':(0,0,0)}
S=0.1  # px -> viewBox
def paths(mask, eps):
    mask=cv2.morphologyEx(mask.astype(np.uint8)*255, cv2.MORPH_OPEN, np.ones((3,3),np.uint8))
    cs,h=cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out=[]
    for c in cs:
        if cv2.contourArea(c)<40: continue
        a=cv2.approxPolyDP(c,eps,True)[:,0,:]
        out.append('M'+' '.join('%g %g'%(round(x*S,1),round(y*S,1)) for x,y in a)+'Z')
    return ''.join(out)
def layers(f, names):
    im=np.array(Image.open(M+f).convert('RGBA')).astype(int)
    rgb=im[:,:,:3]; al=im[:,:,3]
    keys=list(PAL); arr=np.array([PAL[k] for k in keys])
    d=((rgb[:,:,None,:]-arr[None,None,:,:])**2).sum(-1)
    lab=d.argmin(-1)
    wm=((lab==keys.index('white'))|(al<=128)).astype(np.uint8)
    n,cc=cv2.connectedComponents(wm)
    bgl=set(cc[0,:])|set(cc[-1,:])|set(cc[:,0])|set(cc[:,-1])
    bg=np.isin(cc,[l for l in bgl if l!=0])&(wm>0)
    al=np.where(bg,0,255)
    res={'sil':paths(al>128,1.0)}
    for n in names:
        res[n]=paths((lab==keys.index(n))&(al>128),1.4)
    return res, im.shape
b,shape=layers('image4.png',['red','white','gray','pink'])
f,_=layers('image1.png',['red','white','gray'])
json.dump({'back':b,'front':f,'w':shape[1]*S,'h':shape[0]*S},open('paths.json','w'))
for k,v in b.items(): print('back',k,len(v))
for k,v in f.items(): print('front',k,len(v))
