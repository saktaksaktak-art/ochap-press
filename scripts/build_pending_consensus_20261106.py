"""Display-only intersection of the two frozen forecasts; no results or scoring."""
import json,hashlib
from pathlib import Path
from datetime import datetime,timedelta
ROOT=Path(__file__).resolve().parents[1];P=ROOT.parent/'forecast1106'
o=json.loads((P/'OchaP_predictions_20261106_M0_v1.json').read_text())
g=json.loads((P/'gemi_original.json').read_text())
assert o['date']==g['date']=='2026-11-06'
out={'schema_version':'ochap.public.consensus.v1','date':o['date'],'edition':'M0',
 'snapshot_at_jst':o['frozen_at_jst'],'reference_only':True,'formal_pair_verified':False,
 'source_input_hashes':{'ocha':o['shared_input_sha256'],'gemi':g['shared_input']['sha256']},
 'metrics':{str(k):{'hits':0,'n':0,'return_rate_pct':None,'profit_yen':None,'finance_races':0,'ticket_points':0} for k in [2,3]},'races':[]}
for r in o['races']:
 x=g['races'][r['race_id']];assert x['status']=='published'
 assert len(r['input_boats'])==6
 sets={}
 for k in [2,3]:
  oo=r['main'] if k==2 else r['main']+r['reverse']+r['navi']['tickets']
  gg=x['bets']['main'] if k==2 else sum([x['bets'][a] for a in ['main','reverse','navi']],[])
  a={'-'.join(map(str,t[:k])) for t in oo};b={'-'.join(t.split('-')[:k]) for t in gg}
  sets[k]=(a,b)
 deadline=datetime.fromisoformat(r['closed_at_jst'])
 eligible=all(deadline-datetime.fromisoformat(t)>=timedelta(minutes=120) for t in [o['frozen_at_jst'],x['freeze_at']])
 out['races'].append({'race_id':r['race_id'],'venue':r['venue_name'],'venue_code':r['venue_number'],
  'race_no':r['race_number'],'deadline':r['closed_at_jst'],'pair_timing_eligible':eligible,
  'exacta':sorted(sets[2][0]&sets[2][1]),'trifecta':sorted(sets[3][0]&sets[3][1]),
  'reporters':{a:{**{str(k):sorted(sets[k][i]) for k in [2,3]},
    'categories':({group:['-'.join(map(str,t)) for t in (r['navi']['tickets'] if group=='navi' else r[group])] for group in ['main','reverse','navi']} if a=='ocha' else {group:list(x['bets'][group]) for group in ['main','reverse','navi']})} for i,a in enumerate(['ocha','gemi'])},'result':None})
dest=ROOT/'data/consensus/2026-11-06.json';dest.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
print({k:sum(bool(r[k]) for r in out['races']) for k in ['exacta','trifecta']})
