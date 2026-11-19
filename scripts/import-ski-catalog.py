import csv,hashlib,json,math,re,unicodedata
from pathlib import Path
from urllib.parse import urlparse

import argparse
parser=argparse.ArgumentParser();parser.add_argument('--source-dir',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parent.parent;site=root;source=args.source_dir
old=json.loads((site/'weather/legacy-resorts.json').read_text(encoding='utf-8'))
raw=json.loads((source/'ski_areas.geojson').read_bytes())['features']
pref=['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄']
aliases={'hirafu':['hirafu','ヒラフ'],'rusutsu':['rusutsu','ルスツ'],'kiroro':['kiroro','キロロ'],'furano':['furano ski','富良野スキー'],'hakkoda':['hakkoda','八甲田'],'appi':['appi','安比'],'zao':['zao onsen','蔵王温泉'],'inawashiro':['inawashiro','猪苗代スキー'],'marunuma':['marunuma','丸沼'],'kawaba':['kawaba','川場'],'naeba':['naeba','苗場'],'gala':['gala','ガーラ'],'akakura':['akakura onsen','赤倉温泉'],'charmant':['charmant','シャルマン'],'nozawa':['nozawa','野沢温泉'],'shiga':['shiga kogen','志賀高原'],'happo':['happo','八方尾根'],'jam-katsuyama':['jam福井','jam fukui katsuyama','ski jam','jam katsuyama','スキージャム'],'takasu':['takasu','高鷲'],'okuibuki':['okuibuki','奥伊吹'],'biwako':['biwako','びわ湖バレイ'],'hachikita':['hachikita','ハチ北'],'daisen':['daisen','大山スキー'],'ishizuchi':['ishizuchi','石鎚']}
def distance(a,b):
    return math.hypot((a[0]-b[0])*math.cos(math.radians((a[1]+b[1])/2))*111,(a[1]-b[1])*111)
def nice_name(value):
    value=unicodedata.normalize('NFKC',value)
    parts=[x.strip() for x in value.split(',')]
    japanese=next((x for x in parts if re.search('[ぁ-んァ-ヶ一-龯]',x)),None)
    if japanese:return japanese[:120]
    bracket=re.search(r'[（(]([^()（）]*[ぁ-んァ-ヶ一-龯][^()（）]*)[)）]',value)
    return (bracket[1] if bracket else parts[0])[:120]
def source_url(props):
    for source in props['sources']:
        if source['type']=='openstreetmap':return 'https://www.openstreetmap.org/'+str(source['id'])
    for source in props['sources']:
        if source['type']=='skimap.org':return 'https://skimap.org/skiareas/view/'+str(source['id'])
    return 'https://openskimap.org/?obj='+props['id']
def stable_id(props):
    for source in props['sources']:
        if source['type']=='openstreetmap':return 'osm-'+str(source['id']).replace('/','-')
    for source in props['sources']:
        if source['type']=='skimap.org':return 'skimap-'+str(source['id'])
    return 'ski-'+hashlib.sha256((str(props['viewportHint']['center'])+props['name']).encode()).hexdigest()[:16]
eligible=[f for f in raw if any(p.get('iso3166_1Alpha2')=='JP' for p in f['properties']['places']) and 'downhill' in f['properties']['activities'] and f['properties']['status']!='abandoned' and f['properties']['name']]
mapping={};matched=[];used=set()
for legacy in old:
    candidates=[f for f in eligible if f['properties']['id'] not in used and any(alias.lower() in f['properties']['name'].lower() for alias in aliases[legacy['id']]) and distance([legacy['lon'],legacy['lat']],f['properties']['viewportHint']['center'])<20]
    preferred={'hakkoda':'cd01ad6e93fff84a92c2a2baf9823f98dc19b6b5','shiga':'e8db6fae104f008cde4c93e7adcbed5ae752621c','daisen':'7d9fbf98ae623fc3419aac6666fc8c4dbd5c69a1'}
    if legacy['id'] in preferred:candidates=[f for f in candidates if f['properties']['id']==preferred[legacy['id']]]
    candidates.sort(key=lambda f:distance([legacy['lon'],legacy['lat']],f['properties']['viewportHint']['center']))
    if candidates:
        feature=candidates[0];key=feature['properties']['id'];mapping[key]=legacy['id'];used.add(key);matched.append({'id':legacy['id'],'sourceName':feature['properties']['name'],'distanceKm':round(distance([legacy['lon'],legacy['lat']],feature['properties']['viewportHint']['center']),2)})
items=[];profiles={};id_seen=set();names=[]
for feature in eligible:
    prop=feature['properties'];upstream=prop['id'];identifier=mapping.get(upstream,stable_id(prop))
    if identifier in id_seen:continue
    id_seen.add(identifier)
    place=next((p for p in prop['places'] if p.get('iso3166_2','') and p['iso3166_2'].startswith('JP-')),None)
    if not place:continue
    region=pref[int(place['iso3166_2'].split('-')[1])-1]
    center=prop['viewportHint']['center'];stats=prop.get('statistics') or {};lo=stats.get('minElevation');hi=stats.get('maxElevation')
    elevation=round((lo+hi)/2) if isinstance(lo,(float,int)) and isinstance(hi,(float,int)) else None
    official=next((u for u in prop.get('websites',[]) if u.startswith('https://') and not urlparse(u).username and not urlparse(u).password),None)
    legacy=next((r for r in old if r['id']==identifier),None)
    item={'id':identifier,'name':legacy['name'] if legacy else nice_name(prop['name']),'region':region,'lat':round(center[1],6),'lon':round(center[0],6),'elevation':elevation,'official':official,'sourceUrl':source_url(prop),'aliases':prop['name'],'locality':place.get('localized',{}).get('en',{}).get('locality') or '', 'sourceStatus':prop.get('status') or 'unknown'}
    if legacy:item.update({k:legacy[k] for k in ['lat','lon','elevation','official']});item['legacy']=True
    items.append(item);profiles[identifier]={'sourceUrl':item['sourceUrl'],'sourceName':prop['name'],'elevationMin':lo,'elevationMax':hi,'lifts':[],'courses':[],'unnamedCourseSegments':0}
    mapping[upstream]=identifier
for legacy in old:
    if legacy['id'] in id_seen:continue
    item=dict(legacy);item.update({'legacy':True,'sourceUrl':legacy['official'],'aliases':legacy['name'],'sourceStatus':'unknown'})
    if item['region']=='東北':item['region']={'hakkoda':'青森','appi':'岩手','zao':'山形','inawashiro':'福島'}[item['id']]
    items.append(item);profiles[item['id']]={'sourceUrl':item['sourceUrl'],'sourceName':item['name'],'lifts':[],'courses':[],'unnamedCourseSegments':0}

for kind in ['lifts','runs']:
    by_id={}
    with (source/(kind+'.csv')).open(encoding='utf-8',newline='') as stream:
        for row in csv.DictReader(stream):
            if 'Japan' not in row['countries']:continue
            if kind=='runs' and 'downhill' not in row['uses']:continue
            ids=[mapping[key] for key in re.split('[,;| ]+',row['ski_area_ids']) if key in mapping]
            if not ids:continue
            name=nice_name(row['name']) if row['name'] else ''
            for identifier in ids:
                profile=profiles[identifier]
                if kind=='lifts':
                    if row['status'] in ['abandoned','demolished','removed']:continue
                    item={'name':name or (row['ref']+'号リフト' if row['ref'] else '名称未登録'),'type':row['lift_type'],'sourceStatus':row['status'] or 'unknown','sourceUrl':row['sources'].split(';')[0],'sourceId':row['id']}
                    profile['lifts'].append(item)
                elif name or row['ref']:
                    key=(identifier,name or row['ref']);target=by_id.get(key)
                    if target:target['segments']+=1;continue
                    item={'name':name or 'コース番号 '+row['ref'],'difficulty':row['difficulty'] or 'unknown','segments':1,'sourceUrl':row['sources'].split(';')[0]};by_id[key]=item;profile['courses'].append(item)
                else:profile['unnamedCourseSegments']+=1

# Keep the original IDs first so their saved preferences and map attachments survive.
order={r['id']:i for i,r in enumerate(old)}
items.sort(key=lambda r:(0,order[r['id']]) if r['id'] in order else (1,pref.index(r['region']),r['name']))
assert len({r['id'] for r in items})==len(items)
assert all(any(r['id']==x['id'] for r in items) for x in old)
assert all(re.fullmatch('[a-z][a-z0-9-]{0,39}',r['id']) for r in items)
metadata=json.loads((source/'metadata.json').read_text(encoding='utf-8'))
source_date=metadata['run']['finishedAt'][:10]
provenance={'license':'ODbL-1.0','build':metadata,'sha256':{name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in ['ski_areas.geojson','lifts.csv','runs.csv']}}
(site/'weather/data-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n',encoding='utf-8')
facilities={'version':1,'sourceDate':source_date,'dataLicense':'ODbL-1.0','resorts':profiles}
(site/'weather/resorts.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
(site/'weather/facilities.json').write_text(json.dumps(facilities,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
summary={'places':len(items),'prefectures':len(set(r['region'] for r in items)),'matchedOriginal':matched,'unmatchedOriginal':[r['id'] for r in old if r['id'] not in {m['id'] for m in matched}],'placesWithLiftNames':sum(bool(v['lifts']) for v in profiles.values()),'placesWithCourseNames':sum(bool(v['courses']) for v in profiles.values()),'liftRecords':sum(len(v['lifts']) for v in profiles.values()),'namedCourseRecords':sum(len(v['courses']) for v in profiles.values()),'unnamedCourseSegments':sum(v['unnamedCourseSegments'] for v in profiles.values()),'missingElevation':sum(r['elevation'] is None for r in items),'missingOfficial':sum(not r['official'] for r in items)}
(site/'weather/catalog-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False))
