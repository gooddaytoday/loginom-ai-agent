"""Independent stage-0 numbers. Reuses only the independent PCA oracle."""
import importlib.util
import csv
import copy
import json
import math
import sys
from pathlib import Path
from fractions import Fraction

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('pca_oracle', ROOT.parent / 'oracle.py')
pca_oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pca_oracle)


def rotate(loadings, gamma, normalize):
    # Two factors: objective = constant + a*cos(4t) + b*sin(4t).
    norms = [math.sqrt(sum(x*x for x in row)) if normalize else 1 for row in loadings]
    rows = [[x / n for x in row] for row, n in zip(loadings, norms)]

    def objective(theta):
        c, s = math.cos(theta), math.sin(theta)
        rotated = [[x*c+y*s, -x*s+y*c] for x, y in rows]
        return sum(sum(row[j]**4 for row in rotated) - gamma/len(rows)*sum(row[j]**2 for row in rotated)**2 for j in range(2))

    a = (objective(0) - objective(math.pi/4)) / 2
    b = (objective(math.pi/8) - objective(-math.pi/8)) / 2
    theta = math.atan2(b, a) / 4
    c, s = math.cos(theta), math.sin(theta)
    result = [[x*c+y*s, -x*s+y*c] for x, y in loadings]
    assert objective(theta) >= objective(0) - 1e-12
    assert all(abs(sum(v*v for v in row) - sum(v*v for v in target)) < 1e-12 for row, target in zip(loadings, result))
    assert objective(theta) >= objective(theta + 1e-5) - 1e-12
    assert objective(theta) >= objective(theta - 1e-5) - 1e-12
    return dict(angle=theta, loadings=result)


def scores(reference):
    n = len(reference['source'])
    return [[sum((float(row[field])-reference['means'][i]) / reference['sample_sd'][i] * reference['eigenvectors'][i][j] for i, field in enumerate(reference['fields'])) / math.sqrt(reference['eigenvalues'][j]) * math.sqrt(n/(n-1)) for j in range(3)] for row in reference['source']]


def missing_training(template):
    with (ROOT.parents[1] / 'fixtures/null.csv').open() as stream:
        source = list(csv.DictReader(stream))
    fields = ['X','Y','Z']
    values = [[Fraction(row[f]) if row[f]!='?' else None for f in fields] for row in source]
    means = [sum(row[i] for row in values if row[i] is not None)/sum(row[i] is not None for row in values) for i in range(3)]
    sd = [math.sqrt(sum((row[i]-means[i])**2 for row in values if row[i] is not None)/sum(row[i] is not None for row in values)) for i in range(3)]
    correlation = [[float(sum(row[i]*row[j] for row in values if row[i] is not None and row[j] is not None)/sum(row[i] is not None and row[j] is not None for row in values)-means[i]*means[j])/(sd[i]*sd[j]) for j in range(3)] for i in range(3)]
    # This fixture's R=[[1,a,0],[a,1,b],[0,b,1]] has an analytic eigensystem.
    assert correlation[0][2] == 0 and all(abs(correlation[i][i]-1)<1e-12 for i in range(3))
    a,b = correlation[0][1],correlation[1][2]
    radius = math.sqrt(a*a+b*b)
    eigenvalues = [1+radius,1,1-radius]
    assert 0 < radius < 1
    vectors = [[a/radius/math.sqrt(2),-b/radius,a/radius/math.sqrt(2)],
               [1/math.sqrt(2),0,-1/math.sqrt(2)],
               [b/radius/math.sqrt(2),a/radius,b/radius/math.sqrt(2)]]
    loadings = [[vectors[i][j]*math.sqrt(eigenvalues[j]) for j in range(3)] for i in range(3)]
    assert max(abs(sum(loadings[i][k]*loadings[j][k] for k in range(3))-correlation[i][j]) for i in range(3) for j in range(3)) < 1e-12
    case = copy.deepcopy(template)
    case['outputs'][0]['rows'] = []
    for raw,row in zip(source,values):
        projected = [None,None] if None in row else [sum((float(row[i])-float(means[i]))/sd[i]*vectors[i][j] for i in range(3))/math.sqrt(eigenvalues[j]) for j in range(2)]
        case['outputs'][0]['rows'].append(dict(Factor1=projected[0],Factor2=projected[1],Factor3=None,
            RowID=int(raw['RowID']),X=float(raw['X']),Y=None if raw['Y']=='?' else float(raw['Y']),Z=float(raw['Z']),Tag=raw['Tag']))
    case['outputs'][1]['rows'] = [dict(ColumnName=name,ColumnDisplayName=name,Factor1=loadings[i][0],Factor2=loadings[i][1],Factor3=0.0) for i,name in enumerate(fields)]
    return case, dict(means=[float(v) for v in means],population_sd=sd,correlation=correlation,eigenvalues=eigenvalues)


def expected():
    base = pca_oracle.pca(ROOT.parents[1] / 'fixtures/matrix.csv')
    spectrum = base['eigenvalues']
    rotation = pca_oracle.pca(ROOT / 'fixtures/rotation.csv')
    automatic = {str(t): sum(v > t for v in spectrum) for t in [.95, 1.1]}
    variance = {str(t): next(k for k in range(1, 4) if sum(spectrum[:k])/sum(spectrum)*100 >= t) for t in [50, 90, 99]}
    assert automatic == {'0.95': 2, '1.1': 1}
    assert variance == {'50': 1, '90': 2, '99': 3}
    # Apply OLD fit to update.csv, not new fit or native observed scores.
    with (ROOT.parents[1] / 'fixtures/update.csv').open() as stream:
        updates = list(csv.DictReader(stream))
    n = len(base['source'])
    applied = [[sum((float(row[field])-base['means'][i]) / base['sample_sd'][i] * base['eigenvectors'][i][j] for i, field in enumerate(base['fields'])) / math.sqrt(spectrum[j]) * math.sqrt(n/(n-1)) for j in range(2)] for row in updates]
    rotations = {}
    for method, gamma in [('varimax', 1), ('quartimax', 0)]:
        rotations[method] = {}
        for normalization in ['none', 'kaiser']:
            fit = rotate(rotation['loadings'], gamma, normalization == 'kaiser')
            c, s = math.cos(fit['angle']), math.sin(fit['angle'])
            fit['scores'] = [[row[0]*c+row[1]*s, -row[0]*s+row[1]*c] for row in scores(rotation)]
            rotations[method][normalization] = fit
    variance_case = pca_oracle.expected(ROOT.parents[1] / 'fixtures/matrix.csv')
    variance_case['factor_signs'] = dict(columns=['Factor1', 'Factor2'], ports=[0, 1])
    eigenvalue_case = copy.deepcopy(variance_case)
    eigenvalue_case['factor_signs']['columns'] = ['Factor1']
    for table in eigenvalue_case['outputs']:
        for row in table['rows']:
            row['Factor2'] = None if table['output_port'] == 0 else 0.0
    apply_case = pca_oracle.expected(ROOT.parents[1] / 'fixtures/update.csv')
    apply_case['factor_signs'] = dict(columns=['Factor1', 'Factor2'], ports=[0, 1])
    apply_case['outputs'][1] = copy.deepcopy(variance_case['outputs'][1])
    for row, values in zip(apply_case['outputs'][0]['rows'], applied):
        row.update(Factor1=values[0], Factor2=values[1])
    cap_case = copy.deepcopy(variance_case)
    cap_case['factor_signs']['columns'] = ['Factor1']
    for table in cap_case['outputs']:
        table['columns'] = [c for c in table['columns'] if c['name'] not in ['Factor2', 'Factor3']]
        for row in table['rows']:
            del row['Factor2'], row['Factor3']
    rotation_cases = {}
    for method in ['varimax', 'quartimax']:
        case = pca_oracle.expected(ROOT / 'fixtures/rotation.csv')
        case['factor_signs'] = dict(columns=['Factor1', 'Factor2'], ports=[0, 1])
        for row, values in zip(case['outputs'][0]['rows'], rotations[method]['kaiser']['scores']):
            row.update(Factor1=values[0], Factor2=values[1])
        for row, values in zip(case['outputs'][1]['rows'], rotations[method]['kaiser']['loadings']):
            row.update(Factor1=values[0], Factor2=values[1])
        rotation_cases[method] = case
    constant_case = copy.deepcopy(variance_case)
    with (ROOT.parents[1] / 'fixtures/constant.csv').open() as stream:
        constant_source = list(csv.DictReader(stream))
    assert len(constant_source) == 8 and all(float(row['Z']) == 0 for row in constant_source)
    constant_case['outputs'][0]['rows'] = [dict(Factor1=(float(row['X'])+float(row['Y']))/6,
        Factor2=(float(row['X'])-float(row['Y']))/2, Factor3=None,
        RowID=int(row['RowID']), X=float(row['X']), Y=float(row['Y']), Z=0.0, Tag=row['Tag']) for row in constant_source]
    assert all(row['Factor1']**2 == row['Factor2']**2 == 1 for row in constant_case['outputs'][0]['rows'])
    for row in constant_case['outputs'][1]['rows']:
        row['Factor2'] = {'X':math.sqrt(.1),'Y':-math.sqrt(.1),'Z':0.0}[row['ColumnName']]
        if row['ColumnName'] == 'Z':
            row['Factor1'] = 0.0
    with (ROOT / 'fixtures/rank.csv').open() as stream:
        rank_source = list(csv.DictReader(stream))
    assert all(float(row['Y'])==2*float(row['X']) and float(row['Z'])==-float(row['X']) for row in rank_source)
    population_sd = math.sqrt(sum(float(row['X'])**2 for row in rank_source)/len(rank_source))
    assert sum(float(row['X']) for row in rank_source) == 0
    rank_case = copy.deepcopy(variance_case)
    rank_case['factor_signs']['columns'] = ['Factor1']
    rank_case['outputs'][0]['rows'] = [dict(Factor1=float(row['X'])/population_sd,
        Factor2=None,Factor3=None,RowID=int(row['RowID']),X=float(row['X']),Y=float(row['Y']),Z=float(row['Z']),Tag=row['Tag']) for row in rank_source]
    rank_case['outputs'][1]['rows'] = [dict(ColumnName=name,ColumnDisplayName=name,Factor1=1.0 if name!='Z' else -1.0,Factor2=0.0,Factor3=0.0) for name in ['X','Y','Z']]
    null_case,null_reference = missing_training(variance_case)
    return dict(status='proposal_pending_owner_approval', eigenvalues=spectrum,
                eigenvalue_selected=automatic, variance_selected=variance,
                unrotated_scores_all=scores(base),
                unrotated_loadings_all=[[base['eigenvectors'][i][j] * math.sqrt(spectrum[j]) for j in range(3)] for i in range(3)],
                apply_old_fit_scores=applied, apply_loadings=base['loadings'], rotations=rotations,
                null_training=null_reference,
                cases=dict(eigenvalue=eigenvalue_case, variance=variance_case, cap=cap_case, apply=apply_case, constant=constant_case, rank=rank_case, null=null_case, **rotation_cases),
                unresolved=['native strict eigenvalue equality'],
                tolerance=dict(abs=1e-8, rel=1e-10))


if __name__ == '__main__':
    text = json.dumps(expected(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    if sys.argv[1:] == ['--write']:
        (ROOT / 'expected.json').write_text(text)
    elif sys.argv[1:] == ['--check']:
        assert (ROOT / 'expected.json').read_text() == text
        print('PASS: spectrum selection, rotation objective/communalities and expected.json')
    else:
        print(text, end='')
