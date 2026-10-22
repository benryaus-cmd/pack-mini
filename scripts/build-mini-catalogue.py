"""Reproducible focused catalogue from TCGdex source + its published asset index.
Downloads used for artwork comparison stay in the build cache, never runtime/public.
"""
import json,re,sys,hashlib,concurrent.futures,urllib.request,time
from pathlib import Path
from PIL import Image
import numpy as np
from scipy.fft import dctn
ROOT=Path(__file__).resolve().parents[1];DB=ROOT.parent/'tcgdex-reference';ASSETS=json.loads((ROOT.parent/'tcgdex-assets.json').read_text());CACHE=ROOT.parent/'mini-art-cache';CACHE.mkdir(exist_ok=True)
JA={1:'フシギダネ',4:'ヒトカゲ',6:'リザードン',7:'ゼニガメ',25:'ピカチュウ',133:'イーブイ',150:'ミュウツー',197:'ブラッキー',448:'ルカリオ',658:'ゲッコウガ',778:'ミミッキュ'}
SPECIES={1:'Bulbasaur',4:'Charmander',6:'Charizard',7:'Squirtle',25:'Pikachu',133:'Eevee',150:'Mewtwo',197:'Umbreon',448:'Lucario',658:'Greninja',778:'Mimikyu'}
def field(s,k):
 m=re.search(r'\b'+re.escape(k)+r'\s*:\s*([\"\'])(.*?)\1',s,re.S);return m[2] if m else ''
def name(s,lang):
 m=re.search(r'\bname\s*:\s*\{(.*?)\}',s,re.S);return field(m[1],lang) if m else ''
def tier(r,h):
 r=r.lower()
 if r=='common':return 0
 if r=='uncommon':return 1
 if 'hyper' in r:return 6
 if any(x in r for x in ['secret','special illustration','black white']):return 5
 if any(x in r for x in ['ultra','illustration','double',' v','legend','prime','full art','shiny','radiant']):return 4
 return 3 if h or 'holo' in r else 2
cards=[];missing=[]
for folder,lang in [('data','en'),('data-asia','ja')]:
 for p in sorted((DB/folder).rglob('*.ts')):
  if len(p.relative_to(DB/folder).parts)!=3:continue
  s=p.read_text();m=re.search(r'\bdexId\s*:\s*\[([^\]]*)\]',s,re.S)
  dex=list(map(int,re.findall(r'\d+',m[1]))) if m else []
  display=name(s,lang)
  if not display:continue
  if not dex and field(s,'category')=='Pokemon' and '&' not in display and '＆' not in display:
   dex=[d for d,n in (SPECIES if lang=='en' else JA).items() if (re.search(r'(?<![A-Za-z])'+re.escape(n)+r'(?![A-Za-z])',display) if lang=='en' else n in display)]
  if not dex or not all(d in SPECIES for d in dex):continue
  setfile=p.parent.with_suffix('.ts');seriesfile=p.parent.parent.with_suffix('.ts')
  if not setfile.exists() or not seriesfile.exists():continue
  st=setfile.read_text();sid=field(st,'id');series=re.findall(r'\bid\s*:\s*[\"\']([^\"\']+)',seriesfile.read_text())[-1];local=p.stem
  if series=='tcgp':continue
  present=ASSETS.get(lang,{}).get(series,{}).get(sid,{}).get(local) if lang=='en' else ASSETS.get(lang,{}).get(sid,{}).get(local)
  cid=f'{sid}-{local}'
  if not present:missing.append({'language':lang,'id':cid,'name':display});continue
  rarity=field(s,'rarity') or 'Promo';holo=bool(re.search(r'\btype\s*:\s*[\"\']holo[\"\']|\bholo\s*:\s*true',s));t=tier(rarity,holo);promo='promo' in name(st,'en').lower() or 'promo' in p.parent.name.lower() or bool(re.search(r'(^|[-])P$|^[a-z]+p$',sid))
  typ=re.search(r'\btypes\s*:\s*\[\s*[\"\']([^\"\']+)',s)
  cards.append(dict(id=f'{lang}_{cid}',apiId=cid,localId=local,name=display,species=SPECIES[dex[0]],dexId=dex[0],language=lang,image=f'https://assets.tcgdex.net/{lang}/{series}/{sid}/{local}',setId=sid,setName=name(st,lang) or sid,rarity=rarity,tier=t,type=typ[1] if typ else 'Colorless',holo=holo or t>=3,promo=promo,illustrator=field(s,'illustrator'),releaseDate=field(st,'releaseDate')))
print('Candidates with indexed artwork',len(cards),flush=True)
def fetch(c):
 p=CACHE/(hashlib.sha256(c['image'].encode()).hexdigest()+'.webp')
 if not p.exists():
  for attempt in range(3):
   try:
    r=urllib.request.urlopen(c['image']+'/low.webp',timeout=18)
    if not r.headers.get('Content-Type','').startswith('image/'):return None
    p.write_bytes(r.read());break
   except Exception:
    if attempt==2:return None
    time.sleep(.3)
 try:
  im=Image.open(p).convert('L');w,h=im.size;crop=im.crop((w*.15,h*.22,w*.85,h*.43))
  a=np.array(crop.resize((32,32)),dtype=float);d=dctn(a,norm='ortho')[:8,:8];ph=(d>np.median(d.flatten()[1:])).flatten()
  a=np.array(crop.resize((9,8)));dh=(a[:,1:]>a[:,:-1]).flatten()
  return c,ph,dh
 except Exception:return None
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 valid=[v for v in pool.map(fetch,cards) if v]
print('Verified images',len(valid),flush=True)
groups=[]
# Conservative comparison of image crops; language/stamp/edition changes do not create artwork slots.
for c,ph,dh in sorted(valid,key=lambda v:(v[0]['releaseDate'],v[0]['id'])):
 match=next((g for g in groups if g['species']==c['species'] and ((np.count_nonzero(g['ph']!=ph)<=3 and np.count_nonzero(g['dh']!=dh)<=4) or (c['illustrator'] and c['illustrator']==g['prints'][0]['illustrator'] and np.count_nonzero(g['ph']!=ph)<=10 and np.count_nonzero(g['dh']!=dh)<=10))),None)
 if match:match['prints'].append(c)
 else:groups.append({'species':c['species'],'ph':ph,'dh':dh,'prints':[c]})
result=[]
for i,g in enumerate(groups):
 aid='art_'+hashlib.sha256(g['prints'][0]['image'].encode()).hexdigest()[:14]
 for lang in ['en','ja']:
  variants=[c for c in g['prints'] if c['language']==lang]
  if not variants:continue
  c=variants[0].copy();c['artId']=aid;c['aliases']=[{'apiId':v['apiId'],'language':v['language'],'image':v['image']} for v in g['prints'] if v['id']!=c['id']];c['promo']=any(v['promo'] for v in variants);result.append(c)
(ROOT/'src/game/mini-cards.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
report={'source':'TCGdex/cards-database + assets.tcgdex.net/datas.json','sourceCommit':__import__('subprocess').check_output(['git','rev-parse','HEAD'],cwd=DB,text=True).strip(),'species':SPECIES,'indexedCandidates':len(cards),'verifiedPrintImages':len(valid),'artworks':len(groups),'collectibleLanguageArtSlots':len(result),'english':sum(c['language']=='en' for c in result),'japanese':sum(c['language']=='ja' for c in result),'missingArtwork':missing,'deduplication':'Artwork-area pHash <=3 AND dHash <=4 within the same species; matching illustrators also allow pHash <=10 AND dHash <=10 to account for scan/hologram differences. Earliest printing represents each language/artwork slot; reprint aliases retained for pricing. Conservative perceptual deduplication may retain border cases.'}
(ROOT/'docs/MINI-CATALOGUE-AUDIT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print({k:v for k,v in report.items() if k!='missingArtwork'},flush=True)
