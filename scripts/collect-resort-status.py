"""Read a small allowlist of official public tables. Never infer operation from weather."""
import argparse, concurrent.futures, json, re, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []
    def all(self, tag):
        result=[]
        for child in self.children:
            if isinstance(child, Node):
                if child.tag==tag: result.append(child)
                result.extend(child.all(tag))
        return result
    def text(self):
        if self.tag=='img': return self.attrs.get('alt','')
        if self.tag in ('script','style'): return ''
        return ' '.join(c.text() if isinstance(c,Node) else c for c in self.children)

class Document(HTMLParser):
    def __init__(self, raw):
        super().__init__(convert_charrefs=True)
        self.root=Node(); self.stack=[self.root]; self.feed(raw)
    def handle_starttag(self,tag,attrs):
        n=Node(tag,attrs);self.stack[-1].children.append(n)
        if tag not in ('img','br','hr','input','meta','link','source','wbr','area','base','embed','param','col'): self.stack.append(n)
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs);self.handle_endtag(tag)
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag==tag: self.stack=self.stack[:i];break
    def handle_data(self,data): self.stack[-1].children.append(data)

def clean(text,limit=100): return re.sub(r'\s+',' ',text).strip()[:limit]
def state(value):
    text=clean(value).upper()
    if text in ('◯','○','〇','OPEN','OPEN OPEN','運行中','運転中','滑走可','全面滑走可能'): return 'open'
    if text in ('×','Ｘ','✕','CLOSE','CLOSED','クローズ','運休','運休中','運休/閉鎖中','運休/本日営業終了','クローズ','滑走不可'): return 'closed'
    if text in ('△','SUSPENDED','見合わせ中','運行待ち','減速運転','待機調査中','一部滑走不可'): return 'limited'
    if text in ('－','—','-','終了／時間外／期間外'): return 'outside'
    return 'unknown'

def updated_at(doc, adapter):
    text=clean(doc.text(),1_000_000)
    if adapter=='happo': pattern=r'(20\d{2})[.](\d{1,2})[.](\d{1,2})\s+(\d{1,2}):(\d{2})\s*更新'
    elif adapter=='kiroro': pattern=r'Lift and Trail Status\s*(20\d{2})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})'
    else: return None
    m=re.search(pattern,text,re.I)
    if not m:return None
    try:
        y,mo,d,h,mi=map(int,m.groups());return datetime(y,mo,d,h,mi).isoformat(timespec='minutes')+'+09:00'
    except ValueError:return None


def descendants(node, css):
    result=[]
    for child in node.children:
        if not isinstance(child,Node):continue
        if css in child.attrs.get('class','').split():result.append(child)
        result.extend(descendants(child,css))
    return result

def first_text(node,css):
    values=descendants(node,css)
    return clean(values[0].text()) if values else ''

def finish(items, updated=None, deduplicate=False, **extra):
    if deduplicate:
        unique={}
        for item in items:
            if item['name'] in unique and unique[item['name']]!=item:raise ValueError('Conflicting duplicate status')
            unique[item['name']]=item
        items=list(unique.values())
    if not 1<=len(items)<=120 or len({i['name'] for i in items})!=len(items):raise ValueError('Unexpected item count')
    return {'sourceUpdatedAt':updated,'items':items,**extra}

def parse_extended(raw,adapter,kind):
    if adapter=='rusutsu':
        data=json.loads(raw)
        records=data['lift'] if kind=='lifts' else [item for group in data['trail'].values() for item in group]
        items=[{'name':clean(row['nm']),'status':state(row['stat']),'label':clean(row['stat'],40)} for row in records]
        try:updated=datetime.fromtimestamp(int(data['other']['update']),timezone.utc).isoformat(timespec='seconds')
        except (KeyError,ValueError,TypeError,OverflowError):updated=None
        return finish(items,updated)
    doc=Document(raw).root
    if adapter=='hirafu':
        containers=descendants(doc,'p-status__lifts' if kind=='lifts' else 'p-status__courses')
        if not containers:raise ValueError('Missing Japanese status container')
        rows=descendants(containers[0],'p-status__lift' if kind=='lifts' else 'p-status__course-item');items=[]
        for row in rows:
            if kind=='lifts':
                name=first_text(row,'p-status__lift-name');label=first_text(row,'p-status__lift-status')
            else:name=first_text(row,'p-status__course-name');label=first_text(row,'p-status__course-state')
            if name:items.append({'name':name,'status':state(label),'label':label or '不明'})
        # The page's snow timestamp is not an operations timestamp.
        return finish(items,None,True)
    if adapter=='charmant':
        items=[]
        for table in doc.all('table'):
            header=clean(table.text(),100)
            if ('リフト名' if kind=='lifts' else 'コース名') not in header or '状況' not in header:continue
            for row in table.all('tr'):
                cells=[c for c in row.children if isinstance(c,Node) and c.tag=='td']
                if len(cells)<2:continue
                name=clean(cells[0].text());label=clean(cells[1 if kind=='lifts' else 2].text()) if len(cells)>(1 if kind=='lifts' else 2) else ''
                if name:items.append({'name':name,'status':state(label),'label':label or '不明'})
        text=clean(doc.text(),100000);match=re.search(r'(20\d{2})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*更新',text)
        try:updated=datetime(*map(int,match.groups())).isoformat(timespec='minutes')+'+09:00' if match else None
        except ValueError:updated=None
        return finish(items,updated)
    if adapter=='okuibuki':
        sections=descendants(doc,'lcl-lift' if kind=='lifts' else 'lcl-open-course')
        if not sections:raise ValueError('Missing planned operations section')
        section=sections[0];text=clean(section.text(),50000);items=[]
        for row in descendants(section,'lcl-course-list__item'):
            name=first_text(row,'lcl-course__ttl');prep=first_text(row,'lcl-course__prep')
            mark=bool(descendants(row,'lcl-course__mark'))
            label='準備中' if prep else ('運行予定' if kind=='lifts' else '滑走可予定') if mark else '予定未確認'
            if name:items.append({'name':name,'status':'closed' if prep else 'open' if mark else 'unknown','label':label})
        target=re.search(r'(20\d{2})/(\d{1,2})/(\d{1,2})\s*の',text)
        update=re.search(r'(20\d{2})/(\d{1,2})/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*更新',text)
        try:
            date=datetime(*map(int,target.groups())).date().isoformat() if target else None
            updated=datetime(*map(int,update.groups())).isoformat(timespec='minutes')+'+09:00' if update else None
        except ValueError:date=updated=None
        return finish(items,updated,mode='planned',targetDate=date)
    raise ValueError('Unknown adapter')


def parse(raw,adapter,kind):
    if adapter in ('hirafu','rusutsu','charmant','okuibuki'):return parse_extended(raw,adapter,kind)
    doc=Document(raw).root;tables=doc.all('table');items=[]
    if adapter=='kiroro':
        if len(tables)<2: raise ValueError('Expected status tables are missing')
        # The third table lists off-piste/tree areas, not the 24 marked courses.
        targets=tables[:1] if kind=='lifts' else tables[1:2]
        for table in targets:
            for row in table.all('tr'):
                cells=row.all('td')
                if len(cells)!=2:continue
                name,value=map(lambda c:clean(c.text()),cells)
                if not name:continue
                if state(value)=='unknown':raise ValueError('Unrecognized Kiroro status')
                items.append({'name':name,'status':state(value),'label':value})
    else:
        header='リフト名' if kind=='lifts' else ('コース・ゲレンデ名' if adapter=='happo' else 'コース名')
        table=next((t for t in tables if header in clean(t.text(),200)),None)
        if table is None:raise ValueError('Expected status table is missing')
        for row in table.all('tr'):
            if not any(isinstance(c,Node) and c.tag=='td' for c in row.children):continue
            cells=[c for c in row.children if isinstance(c,Node) and c.tag in ('th','td')]
            if adapter=='happo':
                if len(cells)<3:raise ValueError('Unexpected Happo row')
                name=clean(cells[1 if kind=='courses' else 0].text())
                cell=cells[2 if kind=='courses' else 1]
                icons=[clean(n.attrs.get('alt','')) for n in cell.all('img') if n.attrs.get('alt')]
                value=icons[0] if icons and len(set(icons))==1 else clean(cell.text())
            else:
                if len(cells)<4:raise ValueError('Unexpected Marunuma row')
                name=clean(cells[0].text());value=clean(cells[2 if kind=='courses' else 1].text())
            if not name:continue
            items.append({'name':name,'status':state(value),'label':value or '不明'})
    if not 1<=len(items)<=120 or len({x['name'] for x in items})!=len(items):raise ValueError('Unexpected number of items')
    return {'sourceUpdatedAt':updated_at(doc,adapter),'items':items}

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'StanceMemoTrial/2.7 (+https://github.com/kanon6343/snowboard-stance-memo-trial)'})
    with urllib.request.urlopen(req,timeout=20) as r:
        if not r.url.startswith('https://'):raise ValueError('Non-HTTPS redirect')
        raw=r.read(4_000_001)
        if len(raw)>4_000_000:raise ValueError('Page too large')
        return raw.decode(r.headers.get_content_charset() or 'utf-8',errors='replace')

def collect(root, fixture_dir=None):
    config=json.loads((root/'weather/spot-catalog.json').read_text(encoding='utf-8'))
    checked=datetime.now(timezone.utc).isoformat(timespec='seconds')
    def one(resort):
        adapter=resort.get('adapter')
        if not adapter:return resort['id'],None
        result={};raws={}
        for kind,key in [('lifts','liftUrl'),('courses','courseUrl')]:
            url=resort[key];request_url=resort.get('dataUrl') or url
            try:
                if request_url not in raws:
                    if fixture_dir:
                        name=('happo-lift' if kind=='lifts' else 'happo-course') if adapter=='happo' else adapter+'-status'
                        raws[request_url]=(fixture_dir/(name+('.json' if adapter=='rusutsu' else '.html'))).read_text(encoding='utf-8')
                    else:raws[request_url]=fetch(request_url)
                result[kind]={'state':'ok','sourceUrl':url,'checkedAt':checked,**parse(raws[request_url],adapter,kind)}
            except Exception:
                result[kind]={'state':'unavailable','sourceUrl':url,'checkedAt':checked,'sourceUpdatedAt':None,'items':[]}
        return resort['id'],result
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: pairs=list(pool.map(one,config['resorts']))
    return {'version':1,'generatedAt':checked,'resorts':{id:record for id,record in pairs if record}}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--fixtures',type=Path);args=ap.parse_args()
    root=Path(__file__).resolve().parent.parent
    output=collect(root,args.fixtures)
    dest=root/'weather/operations.json';temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(dest)
    print(json.dumps({id:{kind:len(value['items']) for kind,value in record.items()} for id,record in output['resorts'].items()},ensure_ascii=False))
