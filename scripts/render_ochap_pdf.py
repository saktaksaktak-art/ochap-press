from pathlib import Path
import json,re,io
from bs4 import BeautifulSoup
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor,white
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF
from xml.sax.saxutils import escape

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent
from fontTools.ttLib import TTFont as FontToolsTTFont
from fontTools.varLib.instancer import instantiateVariableFont
fontpath=WORK/'NotoSansJP400.ttf'
if not fontpath.exists():
    font=FontToolsTTFont(WORK/'NotoSansJP.ttf')
    instantiateVariableFont(font,{'wght':400},inplace=True).save(fontpath)
pdfmetrics.registerFont(TTFont('OchaJP',str(fontpath)))
pdfmetrics.registerFontFamily('OchaJP',normal='OchaJP',bold='OchaJP',italic='OchaJP',boldItalic='OchaJP')
styles={n:ParagraphStyle(n,fontName='OchaJP',fontSize=size,leading=size*1.5,textColor=HexColor('#173f32'),wordWrap='CJK') for n,size in [('body',9),('small',7.5),('heading',17),('sub',11)]}
pred=json.loads((WORK/'OchaP_Predictions_20261105_M0_v1.json').read_text())
doc=BeautifulSoup((ROOT/'archives/2026-11-05.html').read_text(),'html.parser')
official=BeautifulSoup((WORK/'official_20261105.html').read_text(),'html.parser')
sessions={}
for body in official.select('tbody'):
    a=body.select_one('a[href*="/race/raceindex?jcd="]')
    if not a:continue
    v=int(re.search(r'jcd=(\d+)',a['href'])[1])
    classes=' '.join(' '.join(x.get('class',[])) for x in body.find_all())
    sessions[v]='morning' if 'is-morning' in classes else 'night' if 'is-nighter' in classes or 'is-midnight' in classes else 'day'
assert set(sessions)==set(r['venue_number'] for r in pred['races']),sessions
(ROOT/'data/official-sessions-2026-11-05.json').write_text(json.dumps({'date':'2026-11-05','source_url':'https://www.boatrace.jp/owpc/pc/race/index?hd=20261105','source_fields':'tbody is-morning / is-nighter / is-midnight; unflagged daytime','sessions':sessions},ensure_ascii=False,indent=2))
PALETTE=['#fffdf2','#26302c','#d24048','#286db2','#e5bd29','#25855b']
W,H=A4;LEFT=30;WIDTH=W-60
def para(c,text,y,style='body',width=WIDTH):
    p=Paragraph(escape(text).replace('\n','<br/>'),styles[style]);_,h=p.wrap(width,H)
    if y-h<30:raise ValueError('PDF overflow '+text[:30]+str(y-h))
    p.drawOn(c,LEFT,y-h);return y-h-6
def header(c,r,part):
    c.setFillColor(HexColor('#faf7ed'));c.rect(0,0,W,H,fill=1,stroke=0)
    y=para(c,f"お茶P新聞　11月5日｜{r['venue_name']} {r['race_number']}R",H-28,'heading')
    y=para(c,f"締切 {r['deadline_display']}　おちゃっぴー記者　{part}/2",y,'small')
    c.setStrokeColor(HexColor('#28563d'));c.line(LEFT,y,LEFT+WIDTH,y)
    return y-12
def draw_table(c,tag,y,widths=None):
    rows=[]
    for tr in tag.select('tr'):
        rows.append([Paragraph(escape(td.get_text(' ',strip=True)),styles['small']) for td in tr.find_all(['th','td'],recursive=False)])
    if not widths:widths=[WIDTH/len(rows[0])]*len(rows[0])
    commands=[('BACKGROUND',(0,0),(-1,0),HexColor('#e5ecdf')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('BOTTOMPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),3),('LINEBELOW',(0,0),(-1,-1),.35,HexColor('#ccd8c9'))]
    for ri,tr in enumerate(tag.select('tr')):
        for ci,td in enumerate(tr.find_all(['th','td'],recursive=False)):
            cl=td.get('class',[])
            if 'rank1' in cl:commands.append(('BACKGROUND',(ci,ri),(ci,ri),HexColor('#f6e3a1')))
            if 'rank2' in cl:commands.append(('BACKGROUND',(ci,ri),(ci,ri),HexColor('#dcecf8')))
            if ri and ci==0:
                bn=td.get_text(strip=True)[0]
                if bn in '123456':
                    commands.append(('BACKGROUND',(ci,ri),(ci,ri),HexColor(PALETTE[int(bn)-1])))
                    if bn not in '15':rows[ri][ci]=Paragraph('<font color="white">'+escape(td.get_text(' ',strip=True))+'</font>',styles['small'])
    t=Table(rows,colWidths=widths)
    t.setStyle(TableStyle(commands));_,h=t.wrap(WIDTH,H)
    if y-h<28:raise ValueError('table overflow '+str(y-h))
    t.drawOn(c,LEFT,y-h);return y-h-9
def tickets(c,label,ts,y):
    y=para(c,label,y,'sub');x=LEFT
    for t in ts:
        for n in t:
            c.setFillColor(HexColor(PALETTE[n-1]));c.setStrokeColor(HexColor('#8d9d91'));c.roundRect(x,y-20,20,20,3,fill=1,stroke=1)
            c.setFont('OchaJP',10);c.setFillColor(HexColor('#173f32') if n in [1,5] else white);c.drawCentredString(x+10,y-15,str(n));x+=23
        x+=14
    return y-29
def svg(c,path,x,y,width):
    text=path.read_text().replace('<svg ','<svg font-family="OchaJP" ')
    d=svg2rlg(io.BytesIO(text.encode()));scale=width/d.width;h=d.height*scale
    d.scale(scale,scale);renderPDF.draw(d,c,x,y-h);return h

outdir=ROOT/'pdf';outdir.mkdir(exist_ok=True)
counts={}
for session in ['morning','day','night']:
    races=[r for r in pred['races'] if sessions[r['venue_number']]==session]
    if not races:continue
    path=outdir/f'2026-11-05-{session}.pdf';c=canvas.Canvas(str(path),pagesize=A4,pageCompression=1)
    c.setTitle('お茶P新聞 2026年11月5日 '+{'morning':'モーニング','day':'デイ','night':'ナイター'}[session])
    for r in races:
        a=doc.find('article',id=r['race_id']);tables=a.select('table');assert len(tables)==4
        y=header(c,r,1)
        y=para(c,a.select_one('.lead').get_text(' ',strip=True),y,'sub')
        y=para(c,'予想決まり手：'+str(r['main'][0][0])+'号艇 '+r['main_predicted_method'],y,'sub')
        for label,ts in [('本線3点',r['main']),('逆張り4点',r['reverse']),('舟券ナビ',r['navi']['tickets'])]:
            y=tickets(c,label,ts,y) if ts else para(c,'舟券ナビ：推奨不成立',y)
        y=para(c,r['comment'],y)
        y=para(c,'01 出走表',y,'sub');y=draw_table(c,tables[0],y,[35,180,65,70,WIDTH-350])
        y=para(c,'02 コースデータ｜全国直近6か月',y,'sub');y=draw_table(c,tables[1],y,[65]+[(WIDTH-65)/6]*6)
        c.showPage()
        y=header(c,r,2)
        y=para(c,'決まり手・1C敗因率',y,'sub');y=draw_table(c,tables[2],y,[45,35,48,85,95,135,WIDTH-443])
        y=para(c,'03 ST詳細・スタート予想隊形',y,'sub');y=draw_table(c,tables[3],y)
        h=svg(c,ROOT/'assets/20261105'/f"{r['race_id']}-slit.svg",LEFT,y,WIDTH*.60);y-=h+10
        y=para(c,'04 展開予想図　①逃げ成立 ／ ①逃げ崩壊',y,'sub')
        dw=WIDTH*.40
        h1=svg(c,ROOT/'assets/20261105'/f"{r['race_id']}-escape.svg",LEFT,y,dw)
        h2=svg(c,ROOT/'assets/20261105'/f"{r['race_id']}-collapse.svg",LEFT+dw+12,y,dw);y-=max(h1,h2)+8
        for k,s in r['scenarios'].items():
            title='①逃げ成立' if k=='escape_established' else '①逃げ崩壊'
            y=para(c,title+'：'+str(s['winner'])+'号艇 '+s['method']+'。2着比較 '+'>'.join(map(str,s['second_candidates']))+'。3着比較 '+','.join(map(str,s['third_candidates']))+'。',y)
        y=para(c,r['navi']['axis_reason'],y,'small')
        c.showPage()
    c.save();counts[session]={'races':len(races),'pages':len(races)*2,'bytes':path.stat().st_size}
(ROOT/'data/pdf-2026-11-05.json').write_text(json.dumps(counts,indent=2))
print(counts)
