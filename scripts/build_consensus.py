#!/usr/bin/env python3
"""Build a public, result-independent agreement list and exploratory evaluation.

Usage: python3 scripts/build_consensus.py /path/to/verified/BC/package
Originals and formal BC counters are read-only. No network or AI calls.
"""
import sys, json, hashlib, math
from pathlib import Path
import numpy as np
from scipy.stats import fisher_exact, hypergeom

def build(source, root):
    sys.path.insert(0, str(source))
    import score_consensus as scoring
    forecasts = scoring.normalize()  # exact original SHA + date/input/ticket checks
    report = json.loads((source/'OchaP_Backcheck_20261105_interim.json').read_text())
    results = {r['race_id']: r for r in report['races']}
    def tickets(r, a, kind):
        return scoring.bets(r[a], 'main' if kind == 2 else 'all', kind)
    def common(r, kind):
        return tickets(r, 'ocha', kind) & tickets(r, 'gemi', kind)
    def wilson(h,n):
        if not n: return None
        z=1.959963984540054; p=h/n; d=1+z*z/n
        m=(p+z*z/(2*n))/d; w=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
        return [100*(m-w), 100*(m+w)]
    def financial_row(result, ts, kind):
        refund=sum(100 for t in ts if set(t)&set(result['refunded_boats']))
        hit=tuple(result['order'][:kind]) in ts
        payout=result['exacta_payout_yen' if kind==2 else 'trifecta_payout_yen']
        assert not hit or payout is not None
        return [len(ts)*100, (payout if hit else 0)+refund]
    out={'schema_version':'ochap.public.consensus.v1', 'date':'2026-11-05',
         'edition':'M0','snapshot_at_jst':'2026-11-05T18:34:00+09:00',
         'reference_only':True,'formal_pair_verified':False,
         'coverage':report['coverage'],'source_hashes':report['original_hashes'],
         'shared_input_sha256':report['shared_input_sha256'], 'metrics':{}, 'races':[]}
    for kind in (2,3):
        normal=[(k,r) for k,r in results.items() if forecasts[k]['two_hour_gate'] and not r['accuracy_excluded_reason']]
        agreed=[(k,r) for k,r in normal if common(forecasts[k],kind)]
        absent=[(k,r) for k,r in normal if not common(forecasts[k],kind)]
        summary=dict(report['consensus'][str(kind)])
        summary['comparison_normal_races']=len(normal)
        summary['wilson95_hit_pct']=wilson(summary['hits'],summary['n'])
        summary['normal_ticket_points']=sum(len(common(forecasts[k],kind)) for k,r in agreed)
        summary['same_cohort_reporters']={a:scoring.score([(r,tickets(forecasts[k],a,kind)) for k,r in agreed]) for a in ('ocha','gemi')}
        summary['agreement_selection_test']={}
        # Exploratory selection association; do not compare a subset against its
        # overlapping full population, or treat common/no-common as equal tickets.
        for a in ('ocha','gemi'):
            hit=lambda rs:sum(tuple(r['order'][:kind]) in tickets(forecasts[k],a,kind) for k,r in rs)
            h1,h0=hit(agreed),hit(absent)
            p=float(fisher_exact([[h1,len(agreed)-h1],[h0,len(absent)-h0]]).pvalue) if agreed and absent else None
            summary['agreement_selection_test'][a]={'with_common_hits':h1,'with_common_n':len(agreed),'without_common_hits':h0,'without_common_n':len(absent),'fisher_two_sided_p':p}
            distribution=np.array([1.0])
            for venue in sorted({r['venue_code'] for k,r in normal}):
                block=[(k,r) for k,r in normal if r['venue_code']==venue]
                draws_n=sum(bool(common(forecasts[k],kind)) for k,r in block)
                success_n=hit(block)
                probabilities=hypergeom.pmf(np.arange(draws_n+1),len(block),success_n,draws_n)
                distribution=np.convolve(distribution,probabilities)
            stratified_p=min(1.,2*min(float(distribution[:h1+1].sum()),float(distribution[h1:].sum())))
            summary['agreement_selection_test'][a]['venue_stratified_two_sided_p']=stratified_p
        # Cluster bootstrap by venue retains within-venue dependence and uses
        # identical financial race cohorts and identical draws for each reporter.
        financial=[(k,r) for k,r in results.items() if forecasts[k]['two_hour_gate'] and common(forecasts[k],kind)]
        venues=sorted({r['venue_code'] for k,r in financial})
        matrix=np.zeros((len(venues),3,2),float)
        for k,r in financial:
            f=forecasts[k];i=venues.index(r['venue_code'])
            for j,ts in enumerate([common(f,kind), tickets(f,'ocha',kind),tickets(f,'gemi',kind)]): matrix[i,j]+=financial_row(r,ts,kind)
        draws=np.random.default_rng(20261105+kind).integers(0,len(venues),(10000,len(venues)))
        sums=matrix[draws].sum(axis=1);roi=100*sums[:,:,1]/sums[:,:,0]
        summary['roi_cluster_bootstrap95_pct']=np.quantile(roi[:,0],[.025,.975]).tolist()
        summary['same_financial_cohort']={a:scoring.score([(r,tickets(forecasts[k],a,kind)) for k,r in financial]) for a in ('ocha','gemi')}
        summary['roi_delta_bootstrap95_percentage_points']={a:np.quantile(roi[:,0]-roi[:,j],[.025,.975]).tolist() for j,a in enumerate(('ocha','gemi'),1)}
        summary['evaluation']='優位性は未確認。1日・途中集計のため検証継続。'
        out['metrics'][str(kind)]=summary
    tests=[out['metrics'][str(k)]['agreement_selection_test'][a] for k in (2,3) for a in ('ocha','gemi')]
    previous=0.
    for i,t in enumerate(sorted(tests,key=lambda t:t['venue_stratified_two_sided_p'])):
        previous=max(previous,min(1.,(len(tests)-i)*t['venue_stratified_two_sided_p']))
        t['holm_adjusted_p_four_tests']=previous
    for k,f in forecasts.items():
        r=results.get(k);v,rn=map(int,k.replace('v','').replace('r','').split('-'))
        out['races'].append({'race_id':k,'venue':f['venue'],'venue_code':v,'race_no':rn,
            'deadline':f['deadline'],'pair_timing_eligible':f['two_hour_gate'],
            'exacta':['-'.join(map(str,t)) for t in sorted(common(f,2))],
            'trifecta':['-'.join(map(str,t)) for t in sorted(common(f,3))],
            'reporters':{a:{**{str(kind):['-'.join(map(str,t)) for t in sorted(tickets(f,a,kind))] for kind in (2,3)},
                'categories':{group:['-'.join(map(str,t)) for t in sorted(scoring.bets(f[a],group,3))] for group in ('main','reverse','navi')}} for a in ('ocha','gemi')},
            'result':({'order':r['order'],'excluded_reason':r['accuracy_excluded_reason'],
                       'refunded_boats':r['refunded_boats'], 'exacta_payout_yen':r['exacta_payout_yen'],
                       'trifecta_payout_yen':r['trifecta_payout_yen']} if r else None)})
    dest=root/'data/consensus/2026-11-05.json';dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({k:{s:v for s,v in m.items() if s not in ['accuracy_exclusions','same_cohort_reporters','same_financial_cohort']} for k,m in out['metrics'].items()},ensure_ascii=False,indent=2))
    return out

if __name__=='__main__':build(Path(sys.argv[1]).resolve(),Path(__file__).resolve().parents[1])
